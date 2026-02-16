package mcp_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bwalia/wslproxy/dashboard/internal/mcp"
)

// newIntegrationMCPServer creates a mock MCP server with realistic WSLProxy responses.
func newIntegrationMCPServer(t *testing.T, requireAuth bool) *httptest.Server {
	t.Helper()
	const validAPIKey = "integration-test-key"

	mux := http.NewServeMux()

	authCheck := func(w http.ResponseWriter, r *http.Request) bool {
		if !requireAuth {
			return true
		}
		if r.Header.Get("X-MCP-API-Key") != validAPIKey {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{"message": "unauthorized"})
			return false
		}
		return true
	}

	mux.HandleFunc("/mcp/manifest", func(w http.ResponseWriter, r *http.Request) {
		if !authCheck(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mcp.Manifest{
			Name:         "wslproxy-mcp",
			Version:      "1.0.0",
			Description:  "WSLProxy Model Context Protocol server",
			Capabilities: []string{"resources", "tools", "schemas"},
			Meta:         map[string]string{"env": "integration-test"},
		})
	})

	mux.HandleFunc("/mcp/capabilities", func(w http.ResponseWriter, r *http.Request) {
		if !authCheck(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mcp.Capabilities{
			Resources: []mcp.ResourceDeclaration{
				{ID: "servers", Type: "collection", Category: "config"},
				{ID: "rules", Type: "collection", Category: "routing"},
				{ID: "upstreams", Type: "collection", Category: "config"},
				{ID: "profiles", Type: "collection", Category: "config"},
				{ID: "ssl", Type: "singleton", Category: "security"},
				{ID: "cache", Type: "singleton", Category: "performance"},
				{ID: "health", Type: "singleton", Category: "observability"},
				{ID: "metrics", Type: "singleton", Category: "observability"},
				{ID: "settings", Type: "singleton", Category: "config"},
			},
			Tools: []mcp.ToolDeclaration{
				{Name: "validate_config", Description: "Validate nginx configuration", ReadOnlySafe: true},
				{Name: "get_error_logs", Description: "Retrieve recent error logs", ReadOnlySafe: true},
				{Name: "reload_config", Description: "Reload nginx configuration", ReadOnlySafe: false},
			},
		})
	})

	mux.HandleFunc("/mcp/resources", func(w http.ResponseWriter, r *http.Request) {
		if !authCheck(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]mcp.ResourceSummary{
			{ID: "servers", Type: "servers", URI: "/mcp/resources/servers", Category: "config"},
			{ID: "rules", Type: "rules", URI: "/mcp/resources/rules", Category: "routing"},
			{ID: "upstreams", Type: "upstreams", URI: "/mcp/resources/upstreams", Category: "config"},
			{ID: "profiles", Type: "profiles", URI: "/mcp/resources/profiles", Category: "config"},
			{ID: "ssl", Type: "ssl", URI: "/mcp/resources/ssl", Category: "security"},
			{ID: "cache", Type: "cache", URI: "/mcp/resources/cache", Category: "performance"},
			{ID: "health", Type: "health", URI: "/mcp/resources/health", Category: "observability"},
			{ID: "metrics", Type: "metrics", URI: "/mcp/resources/metrics", Category: "observability"},
			{ID: "settings", Type: "settings", URI: "/mcp/resources/settings", Category: "config"},
		})
	})

	mux.HandleFunc("/mcp/resources/servers", func(w http.ResponseWriter, r *http.Request) {
		if !authCheck(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mcp.Resource{
			Type: "servers", ID: "servers",
			Attributes: map[string]interface{}{
				"items": []interface{}{
					map[string]interface{}{"host": "example.com", "path": "/", "service_name": "web", "service_port": float64(8080), "tls": true},
					map[string]interface{}{"host": "api.example.com", "path": "/v1", "service_name": "api", "service_port": float64(3000), "tls": true},
				},
			},
		})
	})

	mux.HandleFunc("/mcp/resources/health", func(w http.ResponseWriter, r *http.Request) {
		if !authCheck(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mcp.Resource{
			Type: "health", ID: "health",
			Attributes: map[string]interface{}{
				"status":        "healthy",
				"uptime":        "72h15m",
				"workers":       float64(4),
				"version":       "1.25.3",
				"node_count":    float64(3),
				"ingress_ready": true,
			},
		})
	})

	mux.HandleFunc("/mcp/resources/metrics", func(w http.ResponseWriter, r *http.Request) {
		if !authCheck(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mcp.Resource{
			Type: "metrics", ID: "metrics",
			Attributes: map[string]interface{}{
				"total_requests":     float64(150000),
				"active_connections": float64(42),
				"error_rate":         0.02,
				"avg_latency_ms":     12.5,
				"request_methods":    map[string]interface{}{"GET": float64(120000), "POST": float64(30000)},
				"status_codes":       map[string]interface{}{"200": float64(140000), "404": float64(5000), "500": float64(5000)},
			},
		})
	})

	mux.HandleFunc("/mcp/tools", func(w http.ResponseWriter, r *http.Request) {
		if !authCheck(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]mcp.Tool{
			{Name: "validate_config", Description: "Validate nginx configuration", ReadOnlySafe: true, InputSchema: map[string]interface{}{"type": "object"}},
			{Name: "get_error_logs", Description: "Retrieve recent error logs", ReadOnlySafe: true},
			{Name: "reload_config", Description: "Reload nginx configuration", ReadOnlySafe: false},
		})
	})

	mux.HandleFunc("/mcp/tools/validate_config", func(w http.ResponseWriter, r *http.Request) {
		if !authCheck(w, r) {
			return
		}
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var input map[string]interface{}
		json.NewDecoder(r.Body).Decode(&input)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mcp.ToolResult{
			Success: true,
			Output:  map[string]interface{}{"valid": true, "message": "Configuration is valid"},
		})
	})

	mux.HandleFunc("/mcp/tools/add_route", func(w http.ResponseWriter, r *http.Request) {
		if !authCheck(w, r) {
			return
		}
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var input map[string]interface{}
		json.NewDecoder(r.Body).Decode(&input)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mcp.ToolResult{
			Success: true,
			Output:  map[string]interface{}{"added": true},
		})
	})

	mux.HandleFunc("/mcp/tools/get_logs", func(w http.ResponseWriter, r *http.Request) {
		if !authCheck(w, r) {
			return
		}
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mcp.ToolResult{
			Success: true,
			Output: map[string]interface{}{
				"entries": []interface{}{
					map[string]interface{}{"timestamp": "2024-01-15T10:30:00Z", "level": "error", "message": "upstream timeout", "source": "nginx"},
				},
			},
		})
	})

	mux.HandleFunc("/mcp/schemas", func(w http.ResponseWriter, r *http.Request) {
		if !authCheck(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]mcp.SchemaSummary{
			{Name: "servers", Type: "object", Version: "1.0"},
			{Name: "rules", Type: "object", Version: "1.0"},
		})
	})

	mux.HandleFunc("/mcp/schemas/servers", func(w http.ResponseWriter, r *http.Request) {
		if !authCheck(w, r) {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mcp.Schema{
			Name: "servers", Type: "object", Version: "1.0",
			Properties: map[string]interface{}{
				"host":         map[string]interface{}{"type": "string"},
				"listen":       map[string]interface{}{"type": "integer"},
				"upstream":     map[string]interface{}{"type": "string"},
				"server_name":  map[string]interface{}{"type": "string"},
				"ssl_enabled":  map[string]interface{}{"type": "boolean"},
			},
		})
	})

	return httptest.NewServer(mux)
}

func TestIntegration_FullDiscoveryFlow(t *testing.T) {
	srv := newIntegrationMCPServer(t, false)
	defer srv.Close()

	client := mcp.NewClient(srv.URL, "integration-test-key")
	ctx := context.Background()

	// Step 1: Get manifest
	manifest, err := client.GetManifest(ctx)
	if err != nil {
		t.Fatalf("GetManifest failed: %v", err)
	}
	if manifest.Name != "wslproxy-mcp" {
		t.Errorf("expected name 'wslproxy-mcp', got %q", manifest.Name)
	}
	if manifest.Version != "1.0.0" {
		t.Errorf("expected version '1.0.0', got %q", manifest.Version)
	}

	// Step 2: Get capabilities
	caps, err := client.GetCapabilities(ctx)
	if err != nil {
		t.Fatalf("GetCapabilities failed: %v", err)
	}
	if len(caps.Resources) != 9 {
		t.Errorf("expected 9 resource declarations, got %d", len(caps.Resources))
	}
	if len(caps.Tools) != 3 {
		t.Errorf("expected 3 tool declarations, got %d", len(caps.Tools))
	}

	// Step 3: List resources
	resources, err := client.ListResources(ctx)
	if err != nil {
		t.Fatalf("ListResources failed: %v", err)
	}
	if len(resources) != 9 {
		t.Errorf("expected 9 resources, got %d", len(resources))
	}

	// Verify all expected resource IDs are present
	expectedIDs := map[string]bool{
		"servers": false, "rules": false, "upstreams": false, "profiles": false,
		"ssl": false, "cache": false, "health": false, "metrics": false, "settings": false,
	}
	for _, r := range resources {
		if _, ok := expectedIDs[r.ID]; ok {
			expectedIDs[r.ID] = true
		}
	}
	for id, found := range expectedIDs {
		if !found {
			t.Errorf("resource %q not found in list", id)
		}
	}

	// Step 4: Get specific resource
	serversRes, err := client.GetResource(ctx, "servers", nil)
	if err != nil {
		t.Fatalf("GetResource(servers) failed: %v", err)
	}
	if serversRes.Type != "servers" {
		t.Errorf("expected type 'servers', got %q", serversRes.Type)
	}
	items, ok := serversRes.Attributes["items"].([]interface{})
	if !ok {
		t.Fatal("expected 'items' attribute to be a list")
	}
	if len(items) != 2 {
		t.Errorf("expected 2 server items, got %d", len(items))
	}
}

func TestIntegration_ResourceTypes(t *testing.T) {
	srv := newIntegrationMCPServer(t, false)
	defer srv.Close()

	client := mcp.NewClient(srv.URL, "integration-test-key")
	ctx := context.Background()

	tests := []struct {
		resourceID string
		wantType   string
		checkAttr  string
	}{
		{"servers", "servers", "items"},
		{"health", "health", "status"},
		{"metrics", "metrics", "total_requests"},
	}

	for _, tc := range tests {
		t.Run(tc.resourceID, func(t *testing.T) {
			res, err := client.GetResource(ctx, tc.resourceID, nil)
			if err != nil {
				t.Fatalf("GetResource(%s) failed: %v", tc.resourceID, err)
			}
			if res.Type != tc.wantType {
				t.Errorf("expected type %q, got %q", tc.wantType, res.Type)
			}
			if res.ID != tc.resourceID {
				t.Errorf("expected ID %q, got %q", tc.resourceID, res.ID)
			}
			if _, ok := res.Attributes[tc.checkAttr]; !ok {
				t.Errorf("expected attribute %q in resource %s", tc.checkAttr, tc.resourceID)
			}
		})
	}
}

func TestIntegration_ToolExecution(t *testing.T) {
	srv := newIntegrationMCPServer(t, false)
	defer srv.Close()

	client := mcp.NewClient(srv.URL, "integration-test-key")
	ctx := context.Background()

	// Step 1: List tools
	tools, err := client.ListTools(ctx)
	if err != nil {
		t.Fatalf("ListTools failed: %v", err)
	}
	if len(tools) != 3 {
		t.Fatalf("expected 3 tools, got %d", len(tools))
	}

	toolNames := make(map[string]bool)
	for _, tool := range tools {
		toolNames[tool.Name] = true
	}
	for _, expected := range []string{"validate_config", "get_error_logs", "reload_config"} {
		if !toolNames[expected] {
			t.Errorf("tool %q not found in list", expected)
		}
	}

	// Step 2: Execute validate_config
	result, err := client.ExecuteTool(ctx, "validate_config", map[string]interface{}{
		"file": "nginx.conf",
	})
	if err != nil {
		t.Fatalf("ExecuteTool(validate_config) failed: %v", err)
	}
	if !result.Success {
		t.Error("expected validate_config to succeed")
	}
	if result.Output["valid"] != true {
		t.Errorf("expected output 'valid'=true, got %v", result.Output["valid"])
	}
	if result.Output["message"] != "Configuration is valid" {
		t.Errorf("unexpected message: %v", result.Output["message"])
	}
}

func TestIntegration_SchemaDiscovery(t *testing.T) {
	srv := newIntegrationMCPServer(t, false)
	defer srv.Close()

	client := mcp.NewClient(srv.URL, "integration-test-key")
	ctx := context.Background()

	// List schemas
	schemas, err := client.ListSchemas(ctx)
	if err != nil {
		t.Fatalf("ListSchemas failed: %v", err)
	}
	if len(schemas) != 2 {
		t.Fatalf("expected 2 schemas, got %d", len(schemas))
	}

	// Get specific schema
	schema, err := client.GetSchema(ctx, "servers")
	if err != nil {
		t.Fatalf("GetSchema(servers) failed: %v", err)
	}
	if schema.Name != "servers" {
		t.Errorf("expected schema name 'servers', got %q", schema.Name)
	}
	if schema.Type != "object" {
		t.Errorf("expected schema type 'object', got %q", schema.Type)
	}
	expectedProps := []string{"host", "listen", "upstream", "server_name", "ssl_enabled"}
	for _, prop := range expectedProps {
		if _, ok := schema.Properties[prop]; !ok {
			t.Errorf("expected property %q in server schema", prop)
		}
	}
}

func TestIntegration_AuthRejection(t *testing.T) {
	srv := newIntegrationMCPServer(t, true)
	defer srv.Close()

	ctx := context.Background()

	// Client without API key should be rejected
	noAuthClient := mcp.NewClient(srv.URL, "")
	_, err := noAuthClient.GetManifest(ctx)
	if err == nil {
		t.Fatal("expected auth error for client without API key")
	}
	mcpErr, ok := err.(*mcp.MCPError)
	if !ok {
		t.Fatalf("expected *mcp.MCPError, got %T: %v", err, err)
	}
	if mcpErr.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", mcpErr.StatusCode)
	}

	// Client with wrong API key should also be rejected
	wrongKeyClient := mcp.NewClient(srv.URL, "wrong-key")
	_, err = wrongKeyClient.ListResources(ctx)
	if err == nil {
		t.Fatal("expected auth error for wrong API key")
	}
	mcpErr, ok = err.(*mcp.MCPError)
	if !ok {
		t.Fatalf("expected *mcp.MCPError, got %T: %v", err, err)
	}
	if mcpErr.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", mcpErr.StatusCode)
	}

	// Client with correct API key should succeed
	authClient := mcp.NewClient(srv.URL, "integration-test-key")
	manifest, err := authClient.GetManifest(ctx)
	if err != nil {
		t.Fatalf("expected success with correct key, got: %v", err)
	}
	if manifest.Name != "wslproxy-mcp" {
		t.Errorf("unexpected manifest name: %s", manifest.Name)
	}
}
