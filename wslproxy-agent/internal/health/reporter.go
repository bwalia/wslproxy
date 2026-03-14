package health

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/noderegistry"
	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/store"
)

// Reporter publishes node health to the store periodically.
type Reporter struct {
	checker  *HealthChecker
	store    store.Store
	nodeID   string
	region   string
	leaseID  int64
	interval time.Duration
	logger   *slog.Logger
}

// NewReporter creates a health reporter.
func NewReporter(checker *HealthChecker, s store.Store, nodeID, region string, leaseID int64, logger *slog.Logger) *Reporter {
	return &Reporter{
		checker:  checker,
		store:    s,
		nodeID:   nodeID,
		region:   region,
		leaseID:  leaseID,
		interval: 5 * time.Second,
		logger:   logger,
	}
}

// Run starts reporting health to the store. Blocks until ctx is cancelled.
func (r *Reporter) Run(ctx context.Context) {
	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()

	r.report(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.report(ctx)
		}
	}
}

func (r *Reporter) report(ctx context.Context) {
	h := r.checker.Health()

	key := "/wslproxy/nodes/" + r.region + "/" + r.nodeID
	existing, err := r.store.Get(ctx, key)
	if err != nil {
		r.logger.Debug("node key not found, creating fresh", "error", err)
	}

	var node noderegistry.NodeInfo
	if existing != nil {
		_ = json.Unmarshal(existing, &node)
	}

	node.NodeID = r.nodeID
	node.Region = r.region
	node.Status = h.Status
	node.ConfigVersion = h.ConfigVersion
	node.LastHeartbeat = time.Now().UTC()

	data, err := json.Marshal(node)
	if err != nil {
		r.logger.Error("marshal node health", "error", err)
		return
	}

	if err := r.store.PutWithLease(ctx, key, data, r.leaseID); err != nil {
		r.logger.Error("report health", "error", err)
		return
	}

	r.logger.Debug("reported health", "status", h.Status, "node_id", r.nodeID)
}

// ReportOnce performs a single health report. Useful for initial registration.
func (r *Reporter) ReportOnce(ctx context.Context) error {
	h := r.checker.Health()
	node := noderegistry.NodeInfo{
		NodeID:        r.nodeID,
		Region:        r.region,
		Status:        h.Status,
		ConfigVersion: h.ConfigVersion,
		LastHeartbeat: time.Now().UTC(),
		StartedAt:     time.Now().UTC(),
	}

	data, err := json.Marshal(node)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	key := "/wslproxy/nodes/" + r.region + "/" + r.nodeID
	return r.store.PutWithLease(ctx, key, data, r.leaseID)
}
