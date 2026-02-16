package observability

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

func TestGetHealth(t *testing.T) {
	srv, client := newMockMCPServer(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/mcp/resources/health") {
			http.NotFound(w, r)
			return
		}
		resp := map[string]interface{}{
			"type": "health",
			"id":   "health",
			"attributes": map[string]interface{}{
				"status":  "healthy",
				"uptime":  "48h12m",
				"workers": float64(4),
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})
	defer srv.Close()

	obs := NewObserver(client)
	health, err := obs.GetHealth(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if health.Status != "healthy" {
		t.Fatalf("expected status 'healthy', got %s", health.Status)
	}
	if health.Uptime != "48h12m" {
		t.Fatalf("expected uptime '48h12m', got %s", health.Uptime)
	}
	if health.Workers != 4 {
		t.Fatalf("expected 4 workers, got %d", health.Workers)
	}
	if health.CheckedAt.IsZero() {
		t.Fatal("expected CheckedAt to be set")
	}
}

func TestGetMetrics(t *testing.T) {
	srv, client := newMockMCPServer(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/mcp/resources/metrics") {
			http.NotFound(w, r)
			return
		}
		resp := map[string]interface{}{
			"type": "metrics",
			"id":   "metrics",
			"attributes": map[string]interface{}{
				"total_requests":     float64(150000),
				"active_connections": float64(42),
				"error_rate":         0.02,
				"avg_latency_ms":     12.5,
				"request_methods": map[string]interface{}{
					"GET":  float64(120000),
					"POST": float64(30000),
				},
				"status_codes": map[string]interface{}{
					"200": float64(140000),
					"404": float64(5000),
					"500": float64(5000),
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})
	defer srv.Close()

	obs := NewObserver(client)
	metrics, err := obs.GetMetrics(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if metrics.TotalRequests != 150000 {
		t.Fatalf("expected 150000 requests, got %d", metrics.TotalRequests)
	}
	if metrics.ActiveConns != 42 {
		t.Fatalf("expected 42 connections, got %d", metrics.ActiveConns)
	}
	if metrics.ErrorRate != 0.02 {
		t.Fatalf("expected error rate 0.02, got %f", metrics.ErrorRate)
	}
	if metrics.AvgLatencyMs != 12.5 {
		t.Fatalf("expected latency 12.5, got %f", metrics.AvgLatencyMs)
	}
	if len(metrics.RequestMethods) != 2 {
		t.Fatalf("expected 2 methods, got %d", len(metrics.RequestMethods))
	}
	if metrics.RequestMethods["GET"] != 120000 {
		t.Fatalf("expected GET 120000, got %d", metrics.RequestMethods["GET"])
	}
	if len(metrics.StatusCodes) != 3 {
		t.Fatalf("expected 3 status codes, got %d", len(metrics.StatusCodes))
	}
	if metrics.CollectedAt.IsZero() {
		t.Fatal("expected CollectedAt to be set")
	}
}

func TestGetLogs(t *testing.T) {
	srv, client := newMockMCPServer(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/mcp/tools/get_logs") {
			http.NotFound(w, r)
			return
		}
		resp := map[string]interface{}{
			"success": true,
			"output": map[string]interface{}{
				"entries": []interface{}{
					map[string]interface{}{
						"timestamp": "2024-01-15T10:30:00Z",
						"level":     "error",
						"message":   "upstream connection refused",
						"source":    "nginx",
					},
					map[string]interface{}{
						"timestamp": "2024-01-15T10:31:00Z",
						"level":     "error",
						"message":   "SSL handshake failed",
						"source":    "proxy",
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})
	defer srv.Close()

	obs := NewObserver(client)
	logs, err := obs.GetLogs(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(logs) != 2 {
		t.Fatalf("expected 2 log entries, got %d", len(logs))
	}
	if logs[0].Level != "error" {
		t.Fatalf("expected level 'error', got %s", logs[0].Level)
	}
	if logs[0].Message != "upstream connection refused" {
		t.Fatalf("unexpected message: %s", logs[0].Message)
	}
	if logs[0].Source != "nginx" {
		t.Fatalf("expected source 'nginx', got %s", logs[0].Source)
	}
	if logs[1].Message != "SSL handshake failed" {
		t.Fatalf("unexpected message: %s", logs[1].Message)
	}
}
