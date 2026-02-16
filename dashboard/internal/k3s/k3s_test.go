package k3s

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bwalia/wslproxy/dashboard/internal/mcp"
)

func newMockMCPServer(handler http.HandlerFunc) (*httptest.Server, *mcp.Client) {
	srv := httptest.NewServer(handler)
	client := mcp.NewClient(srv.URL, "test-key")
	return srv, client
}

func TestGetClusterStatus(t *testing.T) {
	srv, client := newMockMCPServer(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/mcp/resources/health") {
			http.NotFound(w, r)
			return
		}
		resp := map[string]interface{}{
			"type": "health",
			"id":   "health",
			"attributes": map[string]interface{}{
				"version":       "v1.28.2+k3s1",
				"node_count":    float64(3),
				"ingress_ready": true,
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})
	defer srv.Close()

	mgr := NewManager(client)
	status, err := mgr.GetClusterStatus(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !status.Available {
		t.Fatal("expected cluster to be available")
	}
	if status.Version != "v1.28.2+k3s1" {
		t.Fatalf("expected version v1.28.2+k3s1, got %s", status.Version)
	}
	if status.NodeCount != 3 {
		t.Fatalf("expected 3 nodes, got %d", status.NodeCount)
	}
	if !status.IngressReady {
		t.Fatal("expected ingress ready")
	}
	if status.LastChecked.IsZero() {
		t.Fatal("expected LastChecked to be set")
	}
}

func TestListIngressRules(t *testing.T) {
	srv, client := newMockMCPServer(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/mcp/resources/servers") {
			http.NotFound(w, r)
			return
		}
		resp := map[string]interface{}{
			"type": "servers",
			"id":   "servers",
			"attributes": map[string]interface{}{
				"items": []interface{}{
					map[string]interface{}{
						"host":         "example.com",
						"path":         "/api",
						"service_name": "api-svc",
						"service_port": float64(8080),
						"tls":          true,
					},
					map[string]interface{}{
						"host":         "app.example.com",
						"path":         "/",
						"service_name": "web-svc",
						"service_port": float64(80),
						"tls":          false,
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})
	defer srv.Close()

	mgr := NewManager(client)
	rules, err := mgr.ListIngressRules(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rules) != 2 {
		t.Fatalf("expected 2 rules, got %d", len(rules))
	}
	if rules[0].Host != "example.com" {
		t.Fatalf("expected host example.com, got %s", rules[0].Host)
	}
	if rules[0].ServicePort != 8080 {
		t.Fatalf("expected port 8080, got %d", rules[0].ServicePort)
	}
	if !rules[0].TLS {
		t.Fatal("expected TLS true for first rule")
	}
	if rules[1].TLS {
		t.Fatal("expected TLS false for second rule")
	}
}
