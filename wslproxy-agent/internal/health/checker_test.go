package health

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
}

func TestHealthChecker_HealthyResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"healthy","response":"pong","timestamp":"2026-03-08T10:00:00Z"}`))
	}))
	defer srv.Close()

	checker := NewHealthChecker(srv.URL, testLogger())
	result := checker.Check(context.Background())

	if result.Status != "healthy" {
		t.Fatalf("expected healthy, got %s", result.Status)
	}
	if result.ProxyHealth == nil {
		t.Fatal("expected proxy health response")
	}
	if result.ProxyHealth.Response != "pong" {
		t.Fatalf("expected pong, got %s", result.ProxyHealth.Response)
	}
}

func TestHealthChecker_UnhealthyStatus(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"unhealthy","response":"pong","timestamp":"2026-03-08T10:00:00Z"}`))
	}))
	defer srv.Close()

	checker := NewHealthChecker(srv.URL, testLogger())
	result := checker.Check(context.Background())

	if result.Status != "unhealthy" {
		t.Fatalf("expected unhealthy, got %s", result.Status)
	}
}

func TestHealthChecker_ServerDown(t *testing.T) {
	checker := NewHealthChecker("http://127.0.0.1:1", testLogger(),
		WithHTTPClient(&http.Client{Timeout: 500 * time.Millisecond}))
	result := checker.Check(context.Background())

	if result.Status != "unhealthy" {
		t.Fatalf("expected unhealthy when server is down, got %s", result.Status)
	}
	if result.Error == "" {
		t.Fatal("expected error message")
	}
}

func TestHealthChecker_Non200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte("not ready"))
	}))
	defer srv.Close()

	checker := NewHealthChecker(srv.URL, testLogger())
	result := checker.Check(context.Background())

	if result.Status != "unhealthy" {
		t.Fatalf("expected unhealthy for 503, got %s", result.Status)
	}
}

func TestHealthChecker_RunUpdatesHealth(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"healthy","response":"pong","timestamp":"2026-03-08T10:00:00Z"}`))
	}))
	defer srv.Close()

	checker := NewHealthChecker(srv.URL, testLogger(), WithInterval(100*time.Millisecond))

	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	go checker.Run(ctx)
	time.Sleep(250 * time.Millisecond)

	h := checker.Health()
	if h.Status != "healthy" {
		t.Fatalf("expected healthy after run, got %s (error: %s)", h.Status, h.Error)
	}
}
