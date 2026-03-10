package health

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/noderegistry"
	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/store"
)

func TestReporter_ReportOnce(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"healthy","response":"pong","timestamp":"2026-03-08T10:00:00Z"}`))
	}))
	defer srv.Close()

	s := store.NewMockStore()
	defer s.Close()
	ctx := context.Background()

	leaseID, _ := s.GrantLease(ctx, 15)
	checker := NewHealthChecker(srv.URL, testLogger())
	_ = checker.Check(ctx) // populate initial health

	reporter := NewReporter(checker, s, "node-1", "eu-west-1", leaseID, testLogger())
	if err := reporter.ReportOnce(ctx); err != nil {
		t.Fatalf("report once: %v", err)
	}

	// Verify node was written
	data, err := s.Get(ctx, "/wslproxy/nodes/eu-west-1/node-1")
	if err != nil {
		t.Fatalf("get node: %v", err)
	}

	var node noderegistry.NodeInfo
	if err := json.Unmarshal(data, &node); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if node.NodeID != "node-1" {
		t.Fatalf("expected node-1, got %s", node.NodeID)
	}
	if node.Region != "eu-west-1" {
		t.Fatalf("expected eu-west-1, got %s", node.Region)
	}
}
