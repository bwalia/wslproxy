package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func testDeps() ServerDeps {
	return ServerDeps{
		ClusterName: "test-cluster",
		Region:      "eu-west-1",
		Logger:      slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn})),
	}
}

func TestHandleHealthz(t *testing.T) {
	router := NewRouter(testDeps())
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["status"] != "ok" {
		t.Fatalf("expected status ok, got %s", resp["status"])
	}
}

func TestHandleReadyz_NotReady(t *testing.T) {
	router := NewRouter(testDeps())
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when deps are nil, got %d", w.Code)
	}
}

func TestHandleClusterStatus(t *testing.T) {
	router := NewRouter(testDeps())
	req := httptest.NewRequest(http.MethodGet, "/api/v1/cluster/status", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp ClusterStatusResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.ClusterName != "test-cluster" {
		t.Fatalf("expected test-cluster, got %s", resp.ClusterName)
	}
	if resp.Region != "eu-west-1" {
		t.Fatalf("expected eu-west-1, got %s", resp.Region)
	}
}

func TestHandleNodeList_Empty(t *testing.T) {
	router := NewRouter(testDeps())
	req := httptest.NewRequest(http.MethodGet, "/api/v1/nodes", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["region"] != "eu-west-1" {
		t.Fatalf("expected eu-west-1, got %v", resp["region"])
	}
}
