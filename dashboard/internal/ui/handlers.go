package ui

import (
	"encoding/json"
	"html/template"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/bwalia/wslproxy/dashboard/internal/auth"
	"github.com/bwalia/wslproxy/dashboard/internal/k3s"
	"github.com/bwalia/wslproxy/dashboard/internal/mcp"
	"github.com/bwalia/wslproxy/dashboard/internal/observability"
	"github.com/bwalia/wslproxy/dashboard/internal/rbac"
	"github.com/bwalia/wslproxy/dashboard/internal/workflows"
)

// PageData is the common data passed to every template.
type PageData struct {
	Title    string
	User     *auth.User
	ReadOnly bool
	Content  interface{}
	Error    string
	Success  string
}

// Handler serves the web UI.
type Handler struct {
	templates map[string]*template.Template
	mcpClient *mcp.Client
	authStore *auth.Store
	workflow  *workflows.Engine
	k3sMgr   *k3s.Manager
	observer  *observability.Observer
	logger    *slog.Logger
}

// Config holds dependencies for constructing a Handler.
type Config struct {
	TemplatesDir string
	StaticDir    string
	MCPClient    *mcp.Client
	AuthStore    *auth.Store
	Workflow     *workflows.Engine
	K3sManager   *k3s.Manager
	Observer     *observability.Observer
	Logger       *slog.Logger
}

// NewHandler parses templates and returns a ready-to-use Handler.
func NewHandler(cfg Config) (*Handler, error) {
	layoutFile := filepath.Join(cfg.TemplatesDir, "layout.html")

	// Parse each page template together with the layout so that
	// "content" block definitions do not collide across pages.
	templates := make(map[string]*template.Template)

	entries, err := os.ReadDir(cfg.TemplatesDir)
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".html") || name == "layout.html" {
			continue
		}
		pageFile := filepath.Join(cfg.TemplatesDir, name)
		t, err := template.ParseFiles(layoutFile, pageFile)
		if err != nil {
			return nil, err
		}
		templates[name] = t
	}

	// login.html is self-contained but still register it
	if _, ok := templates["login.html"]; !ok {
		t, err := template.ParseFiles(filepath.Join(cfg.TemplatesDir, "login.html"))
		if err != nil {
			return nil, err
		}
		templates["login.html"] = t
	}

	logger := cfg.Logger
	if logger == nil {
		logger = slog.Default()
	}

	return &Handler{
		templates: templates,
		mcpClient: cfg.MCPClient,
		authStore: cfg.AuthStore,
		workflow:  cfg.Workflow,
		k3sMgr:   cfg.K3sManager,
		observer:  cfg.Observer,
		logger:    logger,
	}, nil
}

// Routes returns a chi.Router with all UI routes mounted.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()

	// --- public routes ---
	r.Get("/login", h.handleLogin)
	r.Post("/login", h.handleLoginPost)
	r.Get("/logout", h.handleLogout)

	// --- protected routes ---
	r.Group(func(r chi.Router) {
		r.Use(auth.Middleware(h.authStore))

		r.Get("/", h.handleDashboard)

		r.Get("/config", h.handleConfig)
		r.Get("/config/{resource}", h.handleConfigResource)

		r.Get("/routes", h.handleRoutes)
		r.Post("/routes/add", h.handleAddRoute)

		r.Get("/ingress", h.handleIngress)

		r.Get("/metrics", h.handleMetrics)
		r.Get("/logs", h.handleLogs)

		r.Get("/workflows", h.handleWorkflows)
		r.Get("/workflows/{id}", h.handleWorkflowDetail)
		r.Post("/workflows/{id}/approve", h.handleApprove)
		r.Post("/workflows/{id}/reject", h.handleReject)
		r.Post("/workflows/{id}/apply", h.handleApply)

		r.Get("/audit", h.handleAudit)
		r.Get("/health", h.handleHealth)
	})

	return r
}

// render executes a named template with the given page data.
func (h *Handler) render(w http.ResponseWriter, name string, data PageData) {
	t, ok := h.templates[name]
	if !ok {
		h.logger.Error("template not found", "template", name)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := t.ExecuteTemplate(w, name, data); err != nil {
		h.logger.Error("template render failed", "template", name, "error", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
}

func (h *Handler) currentUser(r *http.Request) *auth.User {
	u, _ := auth.UserFromContext(r.Context())
	return u
}

// ---------------------------------------------------------------------------
// Auth handlers
// ---------------------------------------------------------------------------

func (h *Handler) handleLogin(w http.ResponseWriter, r *http.Request) {
	h.render(w, "login.html", PageData{Title: "Login"})
}

func (h *Handler) handleLoginPost(w http.ResponseWriter, r *http.Request) {
	username := r.FormValue("username")
	password := r.FormValue("password")

	sess, err := h.authStore.Authenticate(username, password)
	if err != nil {
		h.render(w, "login.html", PageData{Title: "Login", Error: "Invalid username or password"})
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     auth.CookieName,
		Value:    sess.Token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(auth.SessionDuration.Seconds()),
	})
	http.Redirect(w, r, "/", http.StatusFound)
}

func (h *Handler) handleLogout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(auth.CookieName); err == nil {
		h.authStore.Logout(c.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:   auth.CookieName,
		Value:  "",
		Path:   "/",
		MaxAge: -1,
	})
	http.Redirect(w, r, "/login", http.StatusFound)
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

type dashboardContent struct {
	Health  *observability.HealthStatus
	Metrics *observability.MetricsSummary
	Audit   []workflows.AuditEntry
}

func (h *Handler) handleDashboard(w http.ResponseWriter, r *http.Request) {
	user := h.currentUser(r)
	ctx := r.Context()

	health, _ := h.observer.GetHealth(ctx)
	metrics, _ := h.observer.GetMetrics(ctx)
	audit := h.workflow.GetAuditLog()

	// Show last 10 audit entries
	if len(audit) > 10 {
		audit = audit[len(audit)-10:]
	}

	h.render(w, "dashboard.html", PageData{
		Title:    "Dashboard",
		User:     user,
		ReadOnly: h.workflow.IsReadOnly(),
		Content: dashboardContent{
			Health:  health,
			Metrics: metrics,
			Audit:   audit,
		},
	})
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

func (h *Handler) handleConfig(w http.ResponseWriter, r *http.Request) {
	user := h.currentUser(r)
	if !rbac.Can(user, rbac.ActionViewConfig) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	resources, err := h.mcpClient.ListResources(r.Context())
	errMsg := ""
	if err != nil {
		h.logger.Error("list resources failed", "error", err)
		errMsg = "Could not load resources: " + err.Error()
	}

	h.render(w, "config.html", PageData{
		Title:    "Configuration",
		User:     user,
		ReadOnly: h.workflow.IsReadOnly(),
		Content:  resources,
		Error:    errMsg,
	})
}

type configDetailContent struct {
	ResourceID string
	Resource   *mcp.Resource
}

func (h *Handler) handleConfigResource(w http.ResponseWriter, r *http.Request) {
	user := h.currentUser(r)
	if !rbac.Can(user, rbac.ActionViewConfig) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	resID := chi.URLParam(r, "resource")
	res, err := h.mcpClient.GetResource(r.Context(), resID, nil)
	errMsg := ""
	if err != nil {
		h.logger.Error("get resource failed", "resource", resID, "error", err)
		errMsg = "Could not load resource: " + err.Error()
	}

	h.render(w, "config_detail.html", PageData{
		Title:    "Config: " + resID,
		User:     user,
		ReadOnly: h.workflow.IsReadOnly(),
		Content:  configDetailContent{ResourceID: resID, Resource: res},
		Error:    errMsg,
	})
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

func (h *Handler) handleRoutes(w http.ResponseWriter, r *http.Request) {
	user := h.currentUser(r)
	if !rbac.Can(user, rbac.ActionViewConfig) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	res, err := h.mcpClient.GetResource(r.Context(), "servers", nil)
	errMsg := ""
	if err != nil {
		h.logger.Error("get servers resource failed", "error", err)
		errMsg = "Could not load routes: " + err.Error()
	}

	h.render(w, "routes.html", PageData{
		Title:    "Routes",
		User:     user,
		ReadOnly: h.workflow.IsReadOnly(),
		Content:  res,
		Error:    errMsg,
	})
}

func (h *Handler) handleAddRoute(w http.ResponseWriter, r *http.Request) {
	user := h.currentUser(r)
	if !rbac.Can(user, rbac.ActionEditConfig) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	input := map[string]interface{}{
		"server_name": r.FormValue("server_name"),
		"listen":      r.FormValue("listen"),
		"upstream":    r.FormValue("upstream"),
	}

	_, err := h.workflow.CreateRequest(
		"Add route: "+r.FormValue("server_name"),
		"Add new server route via dashboard",
		"add_route",
		input,
		user.Username,
	)
	if err != nil {
		h.logger.Error("create route request failed", "error", err)
		h.render(w, "routes.html", PageData{
			Title: "Routes", User: user, ReadOnly: h.workflow.IsReadOnly(),
			Error: "Could not create change request: " + err.Error(),
		})
		return
	}

	http.Redirect(w, r, "/workflows", http.StatusFound)
}

// ---------------------------------------------------------------------------
// Ingress
// ---------------------------------------------------------------------------

type ingressContent struct {
	Status *k3s.ClusterStatus
	Rules  []k3s.IngressRule
}

func (h *Handler) handleIngress(w http.ResponseWriter, r *http.Request) {
	user := h.currentUser(r)
	ctx := r.Context()

	status, _ := h.k3sMgr.GetClusterStatus(ctx)
	rules, err := h.k3sMgr.ListIngressRules(ctx)
	errMsg := ""
	if err != nil {
		h.logger.Error("list ingress rules failed", "error", err)
		errMsg = "Could not load ingress rules: " + err.Error()
	}

	h.render(w, "ingress.html", PageData{
		Title:    "Ingress",
		User:     user,
		ReadOnly: h.workflow.IsReadOnly(),
		Content:  ingressContent{Status: status, Rules: rules},
		Error:    errMsg,
	})
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

func (h *Handler) handleMetrics(w http.ResponseWriter, r *http.Request) {
	user := h.currentUser(r)
	if !rbac.Can(user, rbac.ActionViewMetrics) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	metrics, err := h.observer.GetMetrics(r.Context())
	errMsg := ""
	if err != nil {
		h.logger.Error("get metrics failed", "error", err)
		errMsg = "Could not load metrics: " + err.Error()
	}

	h.render(w, "metrics.html", PageData{
		Title:    "Metrics",
		User:     user,
		ReadOnly: h.workflow.IsReadOnly(),
		Content:  metrics,
		Error:    errMsg,
	})
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

func (h *Handler) handleLogs(w http.ResponseWriter, r *http.Request) {
	user := h.currentUser(r)
	if !rbac.Can(user, rbac.ActionViewLogs) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	logs, err := h.observer.GetLogs(r.Context())
	errMsg := ""
	if err != nil {
		h.logger.Error("get logs failed", "error", err)
		errMsg = "Could not load logs: " + err.Error()
	}

	h.render(w, "logs.html", PageData{
		Title:    "Logs",
		User:     user,
		ReadOnly: h.workflow.IsReadOnly(),
		Content:  logs,
		Error:    errMsg,
	})
}

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

func (h *Handler) handleWorkflows(w http.ResponseWriter, r *http.Request) {
	user := h.currentUser(r)
	requests := h.workflow.ListRequests()

	h.render(w, "workflows.html", PageData{
		Title:    "Workflows",
		User:     user,
		ReadOnly: h.workflow.IsReadOnly(),
		Content:  requests,
	})
}

func (h *Handler) handleWorkflowDetail(w http.ResponseWriter, r *http.Request) {
	user := h.currentUser(r)
	id := chi.URLParam(r, "id")

	cr, ok := h.workflow.GetRequest(id)
	if !ok {
		http.NotFound(w, r)
		return
	}

	h.render(w, "workflow_detail.html", PageData{
		Title:    "Workflow: " + cr.Title,
		User:     user,
		ReadOnly: h.workflow.IsReadOnly(),
		Content:  cr,
	})
}

func (h *Handler) handleApprove(w http.ResponseWriter, r *http.Request) {
	user := h.currentUser(r)
	if !rbac.Can(user, rbac.ActionApproveChanges) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	id := chi.URLParam(r, "id")
	reason := r.FormValue("reason")
	if err := h.workflow.Approve(id, user.Username, reason); err != nil {
		h.logger.Error("approve failed", "id", id, "error", err)
		cr, _ := h.workflow.GetRequest(id)
		h.render(w, "workflow_detail.html", PageData{
			Title: "Workflow", User: user, ReadOnly: h.workflow.IsReadOnly(),
			Content: cr, Error: "Approve failed: " + err.Error(),
		})
		return
	}
	http.Redirect(w, r, "/workflows/"+id, http.StatusFound)
}

func (h *Handler) handleReject(w http.ResponseWriter, r *http.Request) {
	user := h.currentUser(r)
	if !rbac.Can(user, rbac.ActionApproveChanges) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	id := chi.URLParam(r, "id")
	reason := r.FormValue("reason")
	if err := h.workflow.Reject(id, user.Username, reason); err != nil {
		h.logger.Error("reject failed", "id", id, "error", err)
		cr, _ := h.workflow.GetRequest(id)
		h.render(w, "workflow_detail.html", PageData{
			Title: "Workflow", User: user, ReadOnly: h.workflow.IsReadOnly(),
			Content: cr, Error: "Reject failed: " + err.Error(),
		})
		return
	}
	http.Redirect(w, r, "/workflows/"+id, http.StatusFound)
}

func (h *Handler) handleApply(w http.ResponseWriter, r *http.Request) {
	user := h.currentUser(r)
	if !rbac.Can(user, rbac.ActionApplyConfig) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	id := chi.URLParam(r, "id")
	cr, ok := h.workflow.GetRequest(id)
	if !ok {
		http.NotFound(w, r)
		return
	}

	result, err := h.mcpClient.ExecuteTool(r.Context(), cr.ToolName, cr.Input)
	if err != nil {
		h.logger.Error("apply tool execution failed", "id", id, "error", err)
		h.render(w, "workflow_detail.html", PageData{
			Title: "Workflow", User: user, ReadOnly: h.workflow.IsReadOnly(),
			Content: cr, Error: "Apply failed: " + err.Error(),
		})
		return
	}

	if err := h.workflow.MarkApplied(id, result); err != nil {
		h.logger.Error("mark applied failed", "id", id, "error", err)
	}

	http.Redirect(w, r, "/workflows/"+id, http.StatusFound)
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

func (h *Handler) handleAudit(w http.ResponseWriter, r *http.Request) {
	user := h.currentUser(r)
	entries := h.workflow.GetAuditLog()

	h.render(w, "audit.html", PageData{
		Title:    "Audit Log",
		User:     user,
		ReadOnly: h.workflow.IsReadOnly(),
		Content:  entries,
	})
}

// ---------------------------------------------------------------------------
// Health (JSON API)
// ---------------------------------------------------------------------------

func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	health, err := h.observer.GetHealth(r.Context())
	if err != nil {
		h.logger.Error("health check failed", "error", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(health)
}
