package ui_test

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/bwalia/wslproxy/dashboard/internal/auth"
	"github.com/bwalia/wslproxy/dashboard/internal/k3s"
	"github.com/bwalia/wslproxy/dashboard/internal/mcp"
	"github.com/bwalia/wslproxy/dashboard/internal/observability"
	"github.com/bwalia/wslproxy/dashboard/internal/ui"
	"github.com/bwalia/wslproxy/dashboard/internal/workflows"
)

// newE2EMCPServer returns a mock MCP server for end-to-end testing.
func newE2EMCPServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()

	mux.HandleFunc("/mcp/manifest", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mcp.Manifest{
			Name: "wslproxy-mcp", Version: "1.0.0",
			Description:  "WSLProxy MCP server",
			Capabilities: []string{"resources", "tools", "schemas"},
		})
	})

	mux.HandleFunc("/mcp/resources", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]mcp.ResourceSummary{
			{ID: "servers", Type: "servers", URI: "/mcp/resources/servers"},
			{ID: "health", Type: "health", URI: "/mcp/resources/health"},
			{ID: "metrics", Type: "metrics", URI: "/mcp/resources/metrics"},
		})
	})

	mux.HandleFunc("/mcp/resources/servers", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mcp.Resource{
			Type: "servers", ID: "servers",
			Attributes: map[string]interface{}{
				"items": []interface{}{
					map[string]interface{}{"host": "example.com", "path": "/", "service_name": "web", "service_port": float64(8080), "tls": true},
				},
			},
		})
	})

	mux.HandleFunc("/mcp/resources/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mcp.Resource{
			Type: "health", ID: "health",
			Attributes: map[string]interface{}{
				"status":        "healthy",
				"uptime":        "48h",
				"workers":       float64(4),
				"version":       "1.25.3",
				"node_count":    float64(3),
				"ingress_ready": true,
			},
		})
	})

	mux.HandleFunc("/mcp/resources/metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mcp.Resource{
			Type: "metrics", ID: "metrics",
			Attributes: map[string]interface{}{
				"total_requests":     float64(50000),
				"active_connections": float64(10),
				"error_rate":         0.01,
				"avg_latency_ms":     8.5,
			},
		})
	})

	mux.HandleFunc("/mcp/tools", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]mcp.Tool{
			{Name: "validate_config", Description: "Validate config", ReadOnlySafe: true},
			{Name: "add_route", Description: "Add server route", ReadOnlySafe: false},
		})
	})

	mux.HandleFunc("/mcp/tools/validate_config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mcp.ToolResult{Success: true, Output: map[string]interface{}{"valid": true}})
	})

	mux.HandleFunc("/mcp/tools/add_route", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mcp.ToolResult{Success: true, Output: map[string]interface{}{"added": true}})
	})

	mux.HandleFunc("/mcp/tools/get_logs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(mcp.ToolResult{
			Success: true,
			Output: map[string]interface{}{
				"entries": []interface{}{
					map[string]interface{}{"timestamp": "2024-01-15T10:30:00Z", "level": "error", "message": "test error", "source": "nginx"},
				},
			},
		})
	})

	return httptest.NewServer(mux)
}

// newCookieClient creates an http.Client that stores and sends cookies automatically.
func newCookieClient() *http.Client {
	jar, _ := cookiejar.New(nil)
	return &http.Client{
		Jar: jar,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

// loginAndGetCookie authenticates and returns the session cookie value.
func loginAndGetCookie(t *testing.T, dashURL, username, password string, client *http.Client) string {
	t.Helper()

	form := url.Values{}
	form.Set("username", username)
	form.Set("password", password)

	resp, err := client.Post(dashURL+"/login", "application/x-www-form-urlencoded", strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatalf("login POST failed: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusFound {
		t.Fatalf("expected redirect (302) on login, got %d", resp.StatusCode)
	}

	for _, c := range resp.Cookies() {
		if c.Name == auth.CookieName {
			return c.Value
		}
	}
	t.Fatal("session cookie not found after login")
	return ""
}

// doAuthGet performs a GET request with the session cookie and returns the response.
func doAuthGet(t *testing.T, client *http.Client, dashURL, path, cookie string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, dashURL+path, nil)
	if err != nil {
		t.Fatalf("creating request: %v", err)
	}
	req.AddCookie(&http.Cookie{Name: auth.CookieName, Value: cookie})
	req.Header.Set("Accept", "text/html")

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("GET %s failed: %v", path, err)
	}
	return resp
}

// doAuthPost performs a POST request with the session cookie and form data.
func doAuthPost(t *testing.T, client *http.Client, dashURL, path, cookie string, form url.Values) *http.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, dashURL+path, strings.NewReader(form.Encode()))
	if err != nil {
		t.Fatalf("creating request: %v", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(&http.Cookie{Name: auth.CookieName, Value: cookie})
	req.Header.Set("Accept", "text/html")

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("POST %s failed: %v", path, err)
	}
	return resp
}

func TestE2E_AddRouteApproveApplyFlow(t *testing.T) {
	// 1. Set up mock MCP server
	mcpSrv := newE2EMCPServer(t)
	defer mcpSrv.Close()

	// 2. Initialize all dashboard components
	mcpClient := mcp.NewClient(mcpSrv.URL, "test-key")
	authStore := auth.NewStore()
	wfEngine := workflows.NewEngine()
	k3sMgr := k3s.NewManager(mcpClient)
	observer := observability.NewObserver(mcpClient)

	// Add admin user
	if err := authStore.AddUser("admin", "admin123", "admin"); err != nil {
		t.Fatalf("AddUser failed: %v", err)
	}

	handler, err := ui.NewHandler(ui.Config{
		TemplatesDir: "../../web/templates",
		MCPClient:    mcpClient,
		AuthStore:    authStore,
		Workflow:     wfEngine,
		K3sManager:   k3sMgr,
		Observer:     observer,
		Logger:       slog.Default(),
	})
	if err != nil {
		t.Fatalf("NewHandler failed: %v", err)
	}

	dashSrv := httptest.NewServer(handler.Routes())
	defer dashSrv.Close()

	client := newCookieClient()

	// 3. Authenticate
	cookie := loginAndGetCookie(t, dashSrv.URL, "admin", "admin123", client)
	if cookie == "" {
		t.Fatal("no session cookie received")
	}

	// 4. Navigate to dashboard (GET /)
	resp := doAuthGet(t, client, dashSrv.URL, "/", cookie)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET / expected 200, got %d", resp.StatusCode)
	}

	// 5. Navigate to routes (GET /routes)
	resp = doAuthGet(t, client, dashSrv.URL, "/routes", cookie)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /routes expected 200, got %d", resp.StatusCode)
	}

	// 6. Submit add route form (POST /routes/add)
	form := url.Values{}
	form.Set("server_name", "newapp.example.com")
	form.Set("listen", "443")
	form.Set("upstream", "http://newapp:9090")

	resp = doAuthPost(t, client, dashSrv.URL, "/routes/add", cookie, form)
	resp.Body.Close()
	if resp.StatusCode != http.StatusFound {
		t.Fatalf("POST /routes/add expected 302 redirect, got %d", resp.StatusCode)
	}
	loc := resp.Header.Get("Location")
	if loc != "/workflows" {
		t.Fatalf("expected redirect to /workflows, got %q", loc)
	}

	// 7. List workflows — verify the new change request appears
	requests := wfEngine.ListRequests()
	if len(requests) == 0 {
		t.Fatal("expected at least one change request after adding route")
	}
	cr := requests[0]
	if cr.Status != workflows.StatusPending {
		t.Errorf("expected status 'pending', got %q", cr.Status)
	}
	if cr.ToolName != "add_route" {
		t.Errorf("expected tool 'add_route', got %q", cr.ToolName)
	}
	if !strings.Contains(cr.Title, "newapp.example.com") {
		t.Errorf("expected title to contain 'newapp.example.com', got %q", cr.Title)
	}

	resp = doAuthGet(t, client, dashSrv.URL, "/workflows", cookie)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /workflows expected 200, got %d", resp.StatusCode)
	}

	// 8. Approve the request
	approveForm := url.Values{}
	approveForm.Set("reason", "Looks good")

	resp = doAuthPost(t, client, dashSrv.URL, "/workflows/"+cr.ID+"/approve", cookie, approveForm)
	resp.Body.Close()
	if resp.StatusCode != http.StatusFound {
		t.Fatalf("POST approve expected 302, got %d", resp.StatusCode)
	}

	updatedCR, ok := wfEngine.GetRequest(cr.ID)
	if !ok {
		t.Fatal("change request not found after approval")
	}
	if updatedCR.Status != workflows.StatusApproved {
		t.Errorf("expected status 'approved', got %q", updatedCR.Status)
	}
	if updatedCR.ApprovedBy != "admin" {
		t.Errorf("expected approved by 'admin', got %q", updatedCR.ApprovedBy)
	}

	// 9. Apply the request
	resp = doAuthPost(t, client, dashSrv.URL, "/workflows/"+cr.ID+"/apply", cookie, url.Values{})
	resp.Body.Close()
	if resp.StatusCode != http.StatusFound {
		t.Fatalf("POST apply expected 302, got %d", resp.StatusCode)
	}

	appliedCR, ok := wfEngine.GetRequest(cr.ID)
	if !ok {
		t.Fatal("change request not found after apply")
	}
	if appliedCR.Status != workflows.StatusApplied {
		t.Errorf("expected status 'applied', got %q", appliedCR.Status)
	}
	if appliedCR.ApplyResult == nil {
		t.Error("expected apply result to be populated")
	} else if !appliedCR.ApplyResult.Success {
		t.Error("expected apply result to be successful")
	}

	// 10. Check audit log (GET /audit)
	resp = doAuthGet(t, client, dashSrv.URL, "/audit", cookie)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /audit expected 200, got %d", resp.StatusCode)
	}

	auditLog := wfEngine.GetAuditLog()
	if len(auditLog) < 3 {
		t.Fatalf("expected at least 3 audit entries (create, approve, apply), got %d", len(auditLog))
	}

	auditActions := make(map[string]bool)
	for _, entry := range auditLog {
		auditActions[entry.What] = true
	}
	for _, expected := range []string{"create_request", "approve", "apply"} {
		if !auditActions[expected] {
			t.Errorf("audit log missing expected action %q", expected)
		}
	}

	// 11. Check health endpoint (GET /health)
	resp = doAuthGet(t, client, dashSrv.URL, "/health", cookie)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET /health expected 200, got %d", resp.StatusCode)
	}
	defer resp.Body.Close()

	var healthResp observability.HealthStatus
	if err := json.NewDecoder(resp.Body).Decode(&healthResp); err != nil {
		t.Fatalf("failed to decode health JSON: %v", err)
	}
	if healthResp.Status != "healthy" {
		t.Errorf("expected health status 'healthy', got %q", healthResp.Status)
	}
}

func TestE2E_UnauthenticatedRedirect(t *testing.T) {
	mcpSrv := newE2EMCPServer(t)
	defer mcpSrv.Close()

	mcpClient := mcp.NewClient(mcpSrv.URL, "test-key")
	authStore := auth.NewStore()
	wfEngine := workflows.NewEngine()

	handler, err := ui.NewHandler(ui.Config{
		TemplatesDir: "../../web/templates",
		MCPClient:    mcpClient,
		AuthStore:    authStore,
		Workflow:     wfEngine,
		K3sManager:   k3s.NewManager(mcpClient),
		Observer:     observability.NewObserver(mcpClient),
		Logger:       slog.Default(),
	})
	if err != nil {
		t.Fatalf("NewHandler failed: %v", err)
	}

	dashSrv := httptest.NewServer(handler.Routes())
	defer dashSrv.Close()

	client := newCookieClient()

	// Accessing protected routes without authentication should redirect to /login
	protectedPaths := []string{"/", "/routes", "/workflows", "/audit", "/health", "/metrics", "/logs"}
	for _, path := range protectedPaths {
		t.Run("GET"+path, func(t *testing.T) {
			req, _ := http.NewRequest(http.MethodGet, dashSrv.URL+path, nil)
			req.Header.Set("Accept", "text/html")
			resp, err := client.Do(req)
			if err != nil {
				t.Fatalf("GET %s failed: %v", path, err)
			}
			resp.Body.Close()
			if resp.StatusCode != http.StatusFound {
				t.Errorf("GET %s expected 302 redirect, got %d", path, resp.StatusCode)
			}
			loc := resp.Header.Get("Location")
			if loc != "/login" {
				t.Errorf("GET %s expected redirect to /login, got %q", path, loc)
			}
		})
	}
}

func TestE2E_RBACEnforcement(t *testing.T) {
	mcpSrv := newE2EMCPServer(t)
	defer mcpSrv.Close()

	mcpClient := mcp.NewClient(mcpSrv.URL, "test-key")
	authStore := auth.NewStore()
	wfEngine := workflows.NewEngine()

	authStore.AddUser("viewer", "viewer123", "viewer")
	authStore.AddUser("admin", "admin123", "admin")

	handler, err := ui.NewHandler(ui.Config{
		TemplatesDir: "../../web/templates",
		MCPClient:    mcpClient,
		AuthStore:    authStore,
		Workflow:     wfEngine,
		K3sManager:   k3s.NewManager(mcpClient),
		Observer:     observability.NewObserver(mcpClient),
		Logger:       slog.Default(),
	})
	if err != nil {
		t.Fatalf("NewHandler failed: %v", err)
	}

	dashSrv := httptest.NewServer(handler.Routes())
	defer dashSrv.Close()

	client := newCookieClient()

	// Login as viewer
	viewerCookie := loginAndGetCookie(t, dashSrv.URL, "viewer", "viewer123", client)

	// Viewer should be able to view routes
	resp := doAuthGet(t, client, dashSrv.URL, "/routes", viewerCookie)
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Errorf("viewer GET /routes expected 200, got %d", resp.StatusCode)
	}

	// Viewer should NOT be able to add a route (requires config:edit)
	form := url.Values{}
	form.Set("server_name", "test.example.com")
	form.Set("listen", "80")
	form.Set("upstream", "http://test:8080")

	resp = doAuthPost(t, client, dashSrv.URL, "/routes/add", viewerCookie, form)
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("viewer POST /routes/add expected 403, got %d", resp.StatusCode)
	}

	// Admin creates a request, then viewer tries to approve (should fail)
	adminCookie := loginAndGetCookie(t, dashSrv.URL, "admin", "admin123", client)

	form = url.Values{}
	form.Set("server_name", "admin-route.example.com")
	form.Set("listen", "443")
	form.Set("upstream", "http://backend:3000")
	resp = doAuthPost(t, client, dashSrv.URL, "/routes/add", adminCookie, form)
	resp.Body.Close()

	requests := wfEngine.ListRequests()
	if len(requests) == 0 {
		t.Fatal("expected at least one change request")
	}
	crID := requests[0].ID

	// Viewer should NOT be able to approve (requires changes:approve)
	approveForm := url.Values{}
	approveForm.Set("reason", "test")
	resp = doAuthPost(t, client, dashSrv.URL, "/workflows/"+crID+"/approve", viewerCookie, approveForm)
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Errorf("viewer POST approve expected 403, got %d", resp.StatusCode)
	}
}
