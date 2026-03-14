package configsync

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"log/slog"

	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/store"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
}

func TestSyncer_FullSync(t *testing.T) {
	s := store.NewMockStore()
	defer s.Close()
	dir := t.TempDir()
	writer := NewConfigWriter(dir)
	ctx := context.Background()

	// Seed config in store
	_ = s.Put(ctx, "/wslproxy/config/v1/servers/host-example.json", []byte(`{"id":"host:example"}`))
	_ = s.Put(ctx, "/wslproxy/config/v1/rules/rule-1.json", []byte(`{"id":"rule-1"}`))

	versionMeta, _ := json.Marshal(ConfigVersion{Version: 1, Timestamp: time.Now().Format(time.RFC3339)})
	_ = s.Put(ctx, "/wslproxy/config/_meta/version.json", versionMeta)

	syncer := NewSyncer(s, writer, testLogger())
	if err := syncer.fullSync(ctx); err != nil {
		t.Fatalf("full sync: %v", err)
	}

	// Verify files written
	data, err := os.ReadFile(filepath.Join(dir, "servers/host-example.json"))
	if err != nil {
		t.Fatalf("read server file: %v", err)
	}
	if string(data) != `{"id":"host:example"}` {
		t.Fatalf("unexpected content: %s", data)
	}

	data, err = os.ReadFile(filepath.Join(dir, "rules/rule-1.json"))
	if err != nil {
		t.Fatalf("read rule file: %v", err)
	}
	if string(data) != `{"id":"rule-1"}` {
		t.Fatalf("unexpected content: %s", data)
	}

	// Verify version file
	v := writer.ReadConfigVersion()
	if v != 1 {
		t.Fatalf("expected version 1, got %d", v)
	}

	// Verify state
	state := syncer.State()
	if !state.InSync {
		t.Fatal("expected InSync")
	}
	if state.CurrentVersion != 1 {
		t.Fatalf("expected version 1, got %d", state.CurrentVersion)
	}
}

func TestSyncer_EmptyStore(t *testing.T) {
	s := store.NewMockStore()
	defer s.Close()
	dir := t.TempDir()
	writer := NewConfigWriter(dir)

	syncer := NewSyncer(s, writer, testLogger())
	if err := syncer.fullSync(context.Background()); err != nil {
		t.Fatalf("full sync on empty: %v", err)
	}

	if !syncer.InSync() {
		t.Fatal("expected InSync even on empty store")
	}
}

func TestSyncer_KeyToPath(t *testing.T) {
	syncer := &Syncer{}

	tests := []struct {
		key      string
		expected string
	}{
		{"/wslproxy/config/v1/servers/host-example.json", "servers/host-example.json"},
		{"/wslproxy/config/v42/rules/rule-1.json", "rules/rule-1.json"},
		{"/wslproxy/config/_meta/version.json", ".meta_version.json"},
		{"/wslproxy/config/_meta/checksum.json", ""},
		{"/other/prefix", ""},
		{"/wslproxy/config/v1/upstreams/prod/backend.json", "upstreams/prod/backend.json"},
	}

	for _, tt := range tests {
		t.Run(tt.key, func(t *testing.T) {
			result := syncer.keyToPath(tt.key)
			if result != tt.expected {
				t.Errorf("keyToPath(%q) = %q, want %q", tt.key, result, tt.expected)
			}
		})
	}
}

func TestSyncer_WatchEvent(t *testing.T) {
	s := store.NewMockStore()
	defer s.Close()
	dir := t.TempDir()
	writer := NewConfigWriter(dir)

	syncer := NewSyncer(s, writer, testLogger())

	// Simulate a PUT event
	syncer.handleEvent(store.WatchEvent{
		Type:  store.EventPut,
		Key:   "/wslproxy/config/v1/servers/new-server.json",
		Value: []byte(`{"id":"host:new"}`),
	})

	data, err := os.ReadFile(filepath.Join(dir, "servers/new-server.json"))
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if string(data) != `{"id":"host:new"}` {
		t.Fatalf("unexpected: %s", data)
	}

	// Simulate a DELETE event
	syncer.handleEvent(store.WatchEvent{
		Type: store.EventDelete,
		Key:  "/wslproxy/config/v1/servers/new-server.json",
	})

	_, err = os.Stat(filepath.Join(dir, "servers/new-server.json"))
	if !os.IsNotExist(err) {
		t.Fatal("file should be deleted after DELETE event")
	}
}
