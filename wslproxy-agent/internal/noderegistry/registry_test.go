package noderegistry

import (
	"context"
	"testing"
	"time"

	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/store"
)

func TestStoreRegistry_RegisterAndList(t *testing.T) {
	s := store.NewMockStore()
	defer s.Close()
	r := NewStoreRegistry(s)
	ctx := context.Background()

	leaseID, _ := s.GrantLease(ctx, 15)

	node := NodeInfo{
		NodeID:    "node-1",
		Region:    "eu-west-1",
		Address:   "10.0.1.10",
		Port:      8080,
		Status:    "healthy",
		Role:      "follower",
		StartedAt: time.Now(),
	}

	if err := r.Register(ctx, node, leaseID); err != nil {
		t.Fatalf("register: %v", err)
	}

	nodes, err := r.List(ctx, "eu-west-1")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(nodes) != 1 {
		t.Fatalf("expected 1 node, got %d", len(nodes))
	}
	if nodes[0].NodeID != "node-1" {
		t.Fatalf("expected node-1, got %s", nodes[0].NodeID)
	}
}

func TestStoreRegistry_Deregister(t *testing.T) {
	s := store.NewMockStore()
	defer s.Close()
	r := NewStoreRegistry(s)
	ctx := context.Background()

	leaseID, _ := s.GrantLease(ctx, 15)

	node := NodeInfo{
		NodeID: "node-1",
		Region: "eu-west-1",
	}
	_ = r.Register(ctx, node, leaseID)
	_ = r.Deregister(ctx, "eu-west-1", "node-1")

	nodes, _ := r.List(ctx, "eu-west-1")
	if len(nodes) != 0 {
		t.Fatalf("expected 0 nodes after deregister, got %d", len(nodes))
	}
}

func TestStoreRegistry_LeaseExpiry(t *testing.T) {
	s := store.NewMockStore()
	defer s.Close()
	r := NewStoreRegistry(s)
	ctx := context.Background()

	leaseID, _ := s.GrantLease(ctx, 15)
	node := NodeInfo{NodeID: "node-1", Region: "eu-west-1"}
	_ = r.Register(ctx, node, leaseID)

	// Simulate lease expiry
	s.ExpireLease(leaseID)

	nodes, _ := r.List(ctx, "eu-west-1")
	if len(nodes) != 0 {
		t.Fatalf("expected 0 nodes after lease expiry, got %d", len(nodes))
	}
}

func TestStoreRegistry_MultipleNodes(t *testing.T) {
	s := store.NewMockStore()
	defer s.Close()
	r := NewStoreRegistry(s)
	ctx := context.Background()

	lease1, _ := s.GrantLease(ctx, 15)
	lease2, _ := s.GrantLease(ctx, 15)

	_ = r.Register(ctx, NodeInfo{NodeID: "node-1", Region: "eu-west-1"}, lease1)
	_ = r.Register(ctx, NodeInfo{NodeID: "node-2", Region: "eu-west-1"}, lease2)
	_ = r.Register(ctx, NodeInfo{NodeID: "node-3", Region: "us-east-1"}, lease1)

	euNodes, _ := r.List(ctx, "eu-west-1")
	if len(euNodes) != 2 {
		t.Fatalf("expected 2 EU nodes, got %d", len(euNodes))
	}

	usNodes, _ := r.List(ctx, "us-east-1")
	if len(usNodes) != 1 {
		t.Fatalf("expected 1 US node, got %d", len(usNodes))
	}
}
