package configsync

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/store"
)

const (
	configPrefix  = "/wslproxy/config/"
	metaVersionKey = "/wslproxy/config/_meta/version.json"
)

// Syncer watches the config store and syncs config to local disk.
type Syncer struct {
	store       store.Store
	writer      *ConfigWriter
	logger      *slog.Logger
	pollInterval time.Duration

	mu    sync.RWMutex
	state SyncState
}

// NewSyncer creates a config syncer.
func NewSyncer(s store.Store, writer *ConfigWriter, logger *slog.Logger) *Syncer {
	return &Syncer{
		store:        s,
		writer:       writer,
		logger:       logger,
		pollInterval: 30 * time.Second,
	}
}

// Run starts the config sync loop. Blocks until ctx is cancelled.
func (s *Syncer) Run(ctx context.Context) error {
	// Initial full sync
	if err := s.fullSync(ctx); err != nil {
		s.logger.Error("initial full sync failed", "error", err)
		s.mu.Lock()
		s.state.Error = err.Error()
		s.mu.Unlock()
	}

	// Start watch for incremental updates
	watchCh, err := s.store.Watch(ctx, configPrefix)
	if err != nil {
		s.logger.Error("failed to start config watch, falling back to poll-only", "error", err)
		return s.pollLoop(ctx)
	}

	// Poll ticker as fallback
	pollTicker := time.NewTicker(s.pollInterval)
	defer pollTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()

		case evt, ok := <-watchCh:
			if !ok {
				s.logger.Warn("watch channel closed, restarting")
				return s.Run(ctx) // restart
			}
			s.handleEvent(evt)

		case <-pollTicker.C:
			s.pollOnce(ctx)
		}
	}
}

func (s *Syncer) fullSync(ctx context.Context) error {
	entries, err := s.store.GetPrefix(ctx, configPrefix)
	if err != nil {
		return fmt.Errorf("get config prefix: %w", err)
	}

	if len(entries) == 0 {
		s.logger.Info("no config found in store, writing initial version")
		s.mu.Lock()
		s.state.InSync = true
		s.state.LastSyncTime = time.Now()
		s.mu.Unlock()
		_ = s.writer.WriteConfigVersion(0)
		return nil
	}

	var version ConfigVersion
	if metaData, ok := entries[metaVersionKey]; ok {
		_ = json.Unmarshal(metaData, &version)
	}

	for key, data := range entries {
		relPath := s.keyToPath(key)
		if relPath == "" {
			continue
		}
		if err := s.writer.WriteFile(relPath, data); err != nil {
			s.logger.Error("write config file", "path", relPath, "error", err)
		}
	}

	_ = s.writer.WriteConfigVersion(version.Version)

	s.mu.Lock()
	s.state.CurrentVersion = version.Version
	s.state.InSync = true
	s.state.LastSyncTime = time.Now()
	s.state.Error = ""
	s.mu.Unlock()

	s.logger.Info("full config sync complete", "version", version.Version, "files", len(entries))
	return nil
}

func (s *Syncer) handleEvent(evt store.WatchEvent) {
	relPath := s.keyToPath(evt.Key)
	if relPath == "" {
		return
	}

	switch evt.Type {
	case store.EventPut:
		if err := s.writer.WriteFile(relPath, evt.Value); err != nil {
			s.logger.Error("write on watch event", "path", relPath, "error", err)
			return
		}
		s.logger.Debug("config file updated", "path", relPath)

		// Check if this is a version update
		if evt.Key == metaVersionKey {
			var version ConfigVersion
			if json.Unmarshal(evt.Value, &version) == nil {
				_ = s.writer.WriteConfigVersion(version.Version)
				s.mu.Lock()
				s.state.CurrentVersion = version.Version
				s.state.LastSyncTime = time.Now()
				s.mu.Unlock()
				s.logger.Info("config version updated", "version", version.Version)
			}
		}

	case store.EventDelete:
		if err := s.writer.DeleteFile(relPath); err != nil {
			s.logger.Error("delete on watch event", "path", relPath, "error", err)
		}
		s.logger.Debug("config file deleted", "path", relPath)
	}
}

func (s *Syncer) pollOnce(ctx context.Context) {
	data, err := s.store.Get(ctx, metaVersionKey)
	if err != nil {
		return // No version key yet
	}

	var version ConfigVersion
	if json.Unmarshal(data, &version) != nil {
		return
	}

	s.mu.RLock()
	current := s.state.CurrentVersion
	s.mu.RUnlock()

	if version.Version > current {
		s.logger.Info("config version drift detected, resyncing", "local", current, "remote", version.Version)
		if err := s.fullSync(ctx); err != nil {
			s.logger.Error("resync failed", "error", err)
		}
	}
}

func (s *Syncer) pollLoop(ctx context.Context) error {
	ticker := time.NewTicker(s.pollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			s.pollOnce(ctx)
		}
	}
}

// keyToPath converts an etcd key to a local filesystem path relative to the config dir.
// Returns empty string for keys that shouldn't be written to disk (e.g., meta keys).
func (s *Syncer) keyToPath(key string) string {
	if !strings.HasPrefix(key, configPrefix) {
		return ""
	}
	rel := strings.TrimPrefix(key, configPrefix)

	// Skip the _meta prefix — those are internal
	if strings.HasPrefix(rel, "_meta/") {
		// Only write version.json for tracking
		if rel == "_meta/version.json" {
			return ".meta_version.json"
		}
		return ""
	}

	// Strip version prefix if present (e.g., "v42/servers/..." -> "servers/...")
	if len(rel) > 0 && rel[0] == 'v' {
		if idx := strings.Index(rel, "/"); idx > 0 {
			rel = rel[idx+1:]
		}
	}

	return rel
}

// State returns the current sync state.
func (s *Syncer) State() SyncState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.state
}

// InSync returns whether the node is in sync with the store.
func (s *Syncer) InSync() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.state.InSync
}
