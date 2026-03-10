package noderegistry

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/store"
)

const keyPrefix = "/wslproxy/nodes/"

// Registry manages node registration and discovery.
type Registry interface {
	Register(ctx context.Context, node NodeInfo, leaseID int64) error
	Deregister(ctx context.Context, region, nodeID string) error
	List(ctx context.Context, region string) ([]NodeInfo, error)
	Update(ctx context.Context, node NodeInfo, leaseID int64) error
}

// StoreRegistry implements Registry using a Store backend.
type StoreRegistry struct {
	store store.Store
}

// NewStoreRegistry creates a registry backed by the given store.
func NewStoreRegistry(s store.Store) *StoreRegistry {
	return &StoreRegistry{store: s}
}

func nodeKey(region, nodeID string) string {
	return keyPrefix + region + "/" + nodeID
}

func (r *StoreRegistry) Register(ctx context.Context, node NodeInfo, leaseID int64) error {
	data, err := json.Marshal(node)
	if err != nil {
		return fmt.Errorf("marshal node: %w", err)
	}
	if err := r.store.PutWithLease(ctx, nodeKey(node.Region, node.NodeID), data, leaseID); err != nil {
		return fmt.Errorf("register node: %w", err)
	}
	return nil
}

func (r *StoreRegistry) Deregister(ctx context.Context, region, nodeID string) error {
	if err := r.store.Delete(ctx, nodeKey(region, nodeID)); err != nil {
		return fmt.Errorf("deregister node: %w", err)
	}
	return nil
}

func (r *StoreRegistry) List(ctx context.Context, region string) ([]NodeInfo, error) {
	prefix := keyPrefix + region + "/"
	entries, err := r.store.GetPrefix(ctx, prefix)
	if err != nil {
		return nil, fmt.Errorf("list nodes: %w", err)
	}
	nodes := make([]NodeInfo, 0, len(entries))
	for _, data := range entries {
		var node NodeInfo
		if err := json.Unmarshal(data, &node); err != nil {
			continue // skip malformed entries
		}
		nodes = append(nodes, node)
	}
	return nodes, nil
}

func (r *StoreRegistry) Update(ctx context.Context, node NodeInfo, leaseID int64) error {
	return r.Register(ctx, node, leaseID)
}
