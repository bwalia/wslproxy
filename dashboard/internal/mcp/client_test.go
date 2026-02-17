package mcp

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// newTestServer creates an httptest.Server that mocks all MCP endpoints.
func newTestServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()

	mux.HandleFunc("/mcp/manifest", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, Manifest{
			Name:         "wslproxy",
			Version:      "1.0.0",
			Description:  "WSLProxy MCP server",
			Capabilities: []string{"resources", "tools", "schemas"},
			Meta:         map[string]string{"env": "test"},
		})
	})

	mux.HandleFunc("/mcp/capabilities", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, Capabilities{
			Resources: []ResourceDeclaration{{ID: "servers", Type: "collection", Category: "config"}},
			Tools:     []ToolDeclaration{{Name: "validate_config", Description: "Validate config", ReadOnlySafe: true}},
		})
	})

	mux.HandleFunc("/mcp/resources", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, []ResourceSummary{
			{ID: "servers", Type: "servers", URI: "/mcp/resources/servers"},
			{ID: "rules", Type: "rules", URI: "/mcp/resources/rules", Category: "routing"},
		})
	})

	mux.HandleFunc("/mcp/resources/servers", func(w http.ResponseWriter, r *http.Request) {
		profileID := r.URL.Query().Get("profile_id")
		attrs := map[string]interface{}{"count": float64(3)}
		if profileID != "" {
			attrs["profile_id"] = profileID
		}
		writeJSON(w, Resource{
			Type: "servers", ID: "servers",
			Attributes: attrs,
		})
	})

	mux.HandleFunc("/mcp/resources/notfound", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		writeJSON(w, MCPError{Message: "resource not found", Details: "id=notfound"})
	})

	mux.HandleFunc("/mcp/tools", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, []Tool{
			{Name: "validate_config", Description: "Validate configuration", ReadOnlySafe: true},
			{Name: "reload_config", Description: "Reload configuration", ReadOnlySafe: false},
		})
	})

	mux.HandleFunc("/mcp/tools/validate_config", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var input map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, MCPError{Message: "bad request"})
			return
		}
		writeJSON(w, ToolResult{Success: true, Output: map[string]interface{}{"valid": true}})
	})

	mux.HandleFunc("/mcp/schemas", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, []SchemaSummary{
			{Name: "server", Type: "object", Version: "1.0"},
		})
	})

	mux.HandleFunc("/mcp/schemas/server", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, Schema{
			Name: "server", Type: "object", Version: "1.0",
			Properties: map[string]interface{}{"host": map[string]interface{}{"type": "string"}},
		})
	})

	// Auth-checking endpoint.
	mux.HandleFunc("/mcp/auth-check", func(w http.ResponseWriter, r *http.Request) {
		apiKey := r.Header.Get("X-MCP-API-Key")
		bearer := r.Header.Get("Authorization")
		if apiKey == "" || bearer == "" {
			w.WriteHeader(http.StatusUnauthorized)
			writeJSON(w, MCPError{Message: "unauthorized"})
			return
		}
		writeJSON(w, map[string]string{"api_key": apiKey, "authorization": bearer})
	})

	// Error endpoints for status code testing.
	mux.HandleFunc("/mcp/error/401", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w, MCPError{Message: "unauthorized", Details: "invalid key"})
	})

	mux.HandleFunc("/mcp/error/500", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, MCPError{Message: "internal error"})
	})

	return httptest.NewServer(mux)
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestNewClient(t *testing.T) {
	c := NewClient("http://localhost:8080", "test-key")
	if c.baseURL != "http://localhost:8080" {
		t.Fatalf("unexpected baseURL: %s", c.baseURL)
	}
	if c.apiKey != "test-key" {
		t.Fatalf("unexpected apiKey: %s", c.apiKey)
	}
	if c.httpClient == nil {
		t.Fatal("httpClient should not be nil")
	}

	// Trailing slash stripped.
	c2 := NewClient("http://localhost:8080/", "k")
	if c2.baseURL != "http://localhost:8080" {
		t.Fatalf("trailing slash not trimmed: %s", c2.baseURL)
	}

	// WithTimeout option.
	c3 := NewClient("http://localhost", "k", WithTimeout(5*time.Second))
	if c3.httpClient.Timeout != 5*time.Second {
		t.Fatalf("unexpected timeout: %v", c3.httpClient.Timeout)
	}

	// WithHTTPClient option.
	custom := &http.Client{Timeout: 99 * time.Second}
	c4 := NewClient("http://localhost", "k", WithHTTPClient(custom))
	if c4.httpClient != custom {
		t.Fatal("custom HTTP client not set")
	}
}

func TestGetManifest(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()
	c := NewClient(srv.URL, "key")

	m, err := c.GetManifest(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if m.Name != "wslproxy" {
		t.Fatalf("unexpected name: %s", m.Name)
	}
	if m.Version != "1.0.0" {
		t.Fatalf("unexpected version: %s", m.Version)
	}
	if len(m.Capabilities) != 3 {
		t.Fatalf("expected 3 capabilities, got %d", len(m.Capabilities))
	}
	if m.Meta["env"] != "test" {
		t.Fatalf("unexpected meta: %v", m.Meta)
	}
}

func TestGetCapabilities(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()
	c := NewClient(srv.URL, "key")

	cap, err := c.GetCapabilities(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(cap.Resources) != 1 || cap.Resources[0].ID != "servers" {
		t.Fatalf("unexpected resources: %+v", cap.Resources)
	}
	if len(cap.Tools) != 1 || cap.Tools[0].Name != "validate_config" {
		t.Fatalf("unexpected tools: %+v", cap.Tools)
	}
}

func TestListResources(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()
	c := NewClient(srv.URL, "key")

	rs, err := c.ListResources(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(rs) != 2 {
		t.Fatalf("expected 2 resources, got %d", len(rs))
	}
	if rs[0].ID != "servers" || rs[1].Category != "routing" {
		t.Fatalf("unexpected resources: %+v", rs)
	}
}

func TestGetResource(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()
	c := NewClient(srv.URL, "key")

	r, err := c.GetResource(context.Background(), "servers", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.ID != "servers" {
		t.Fatalf("unexpected ID: %s", r.ID)
	}
	count, ok := r.Attributes["count"].(float64)
	if !ok || count != 3 {
		t.Fatalf("unexpected attributes: %v", r.Attributes)
	}
}

func TestGetResourceWithParams(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()
	c := NewClient(srv.URL, "key")

	r, err := c.GetResource(context.Background(), "servers", map[string]string{"profile_id": "prod"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if r.Attributes["profile_id"] != "prod" {
		t.Fatalf("expected profile_id=prod, got %v", r.Attributes["profile_id"])
	}
}

func TestListTools(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()
	c := NewClient(srv.URL, "key")

	tools, err := c.ListTools(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(tools) != 2 {
		t.Fatalf("expected 2 tools, got %d", len(tools))
	}
	if tools[0].Name != "validate_config" || tools[1].Name != "reload_config" {
		t.Fatalf("unexpected tools: %+v", tools)
	}
	if !tools[0].ReadOnlySafe {
		t.Fatal("validate_config should be read-only safe")
	}
}

func TestExecuteTool(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()
	c := NewClient(srv.URL, "key")

	result, err := c.ExecuteTool(context.Background(), "validate_config", map[string]interface{}{"file": "nginx.conf"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Success {
		t.Fatal("expected success=true")
	}
	if result.Output["valid"] != true {
		t.Fatalf("unexpected output: %v", result.Output)
	}
}

func TestAuthHeaderSent(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()

	// With API key – should succeed.
	c := NewClient(srv.URL, "my-secret-key")
	resp, err := c.doRequest(context.Background(), http.MethodGet, "/mcp/auth-check", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	var body map[string]string
	json.NewDecoder(resp.Body).Decode(&body)
	if body["api_key"] != "my-secret-key" {
		t.Fatalf("X-MCP-API-Key not sent: %v", body)
	}
	if body["authorization"] != "Bearer my-secret-key" {
		t.Fatalf("Authorization not sent: %v", body)
	}

	// Without API key – should get 401.
	c2 := NewClient(srv.URL, "")
	resp2, err := c2.doRequest(context.Background(), http.MethodGet, "/mcp/auth-check", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp2.StatusCode)
	}
}

func TestErrorHandling(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()
	c := NewClient(srv.URL, "key")

	tests := []struct {
		name       string
		resourceID string
		path       string
		wantCode   int
		wantMsg    string
	}{
		{"404", "notfound", "", http.StatusNotFound, "resource not found"},
		{"401", "", "/mcp/error/401", http.StatusUnauthorized, "unauthorized"},
		{"500", "", "/mcp/error/500", http.StatusInternalServerError, "internal error"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var err error
			if tc.resourceID != "" {
				_, err = c.GetResource(context.Background(), tc.resourceID, nil)
			} else {
				resp, reqErr := c.doRequest(context.Background(), http.MethodGet, tc.path, nil)
				if reqErr != nil {
					t.Fatalf("request error: %v", reqErr)
				}
				err = c.decodeResponse(resp, nil)
			}

			mcpErr, ok := err.(*MCPError)
			if !ok {
				t.Fatalf("expected *MCPError, got %T: %v", err, err)
			}
			if mcpErr.StatusCode != tc.wantCode {
				t.Fatalf("expected status %d, got %d", tc.wantCode, mcpErr.StatusCode)
			}
			if mcpErr.Message != tc.wantMsg {
				t.Fatalf("expected message %q, got %q", tc.wantMsg, mcpErr.Message)
			}
		})
	}
}

func TestContextCancellation(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()
	c := NewClient(srv.URL, "key")

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	_, err := c.GetManifest(ctx)
	if err == nil {
		t.Fatal("expected error from cancelled context")
	}
}

func TestListSchemas(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()
	c := NewClient(srv.URL, "key")

	ss, err := c.ListSchemas(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ss) != 1 || ss[0].Name != "server" {
		t.Fatalf("unexpected schemas: %+v", ss)
	}
}

func TestGetSchema(t *testing.T) {
	srv := newTestServer(t)
	defer srv.Close()
	c := NewClient(srv.URL, "key")

	s, err := c.GetSchema(context.Background(), "server")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if s.Name != "server" || s.Type != "object" || s.Version != "1.0" {
		t.Fatalf("unexpected schema: %+v", s)
	}
	if _, ok := s.Properties["host"]; !ok {
		t.Fatal("expected 'host' property in schema")
	}
}

func TestMCPErrorString(t *testing.T) {
	e1 := &MCPError{StatusCode: 404, Message: "not found"}
	if e1.Error() != "mcp: 404 not found" {
		t.Fatalf("unexpected: %s", e1.Error())
	}

	e2 := &MCPError{StatusCode: 500, Message: "fail", Details: "disk full"}
	if e2.Error() != "mcp: 500 fail: disk full" {
		t.Fatalf("unexpected: %s", e2.Error())
	}
}
