package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLoginAndList(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/user/login", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{"accessToken": "jwt-test-token"},
			"status": 200,
		})
	})
	mux.HandleFunc("/api/rules", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": []map[string]any{{"id": "r1", "name": "rule-one"}},
			"total": 1,
		})
	})
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := NewClient(srv.URL, "", "prod", false)
	tok, err := c.Login("admin@example.com", "secret")
	if err != nil {
		t.Fatal(err)
	}
	if tok != "jwt-test-token" {
		t.Fatalf("token=%q", tok)
	}
	items, err := c.ListResources("rules")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("len=%d", len(items))
	}
	if ResourceID(items[0]) != "r1" {
		t.Fatalf("id=%s", ResourceID(items[0]))
	}
	m, code, _, err := c.Health()
	if err != nil || code != 200 {
		t.Fatalf("health err=%v code=%d", err, code)
	}
	if m["status"] != "ok" {
		t.Fatalf("body=%v", m)
	}
}

func TestResourceID(t *testing.T) {
	if ResourceID(json.RawMessage(`{"id":"host:x.com"}`)) != "host:x.com" {
		t.Fatal("expected host id")
	}
}
