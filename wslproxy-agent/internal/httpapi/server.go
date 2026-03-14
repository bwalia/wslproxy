package httpapi

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/configsync"
	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/election"
	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/health"
	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/noderegistry"
	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/store"
)

// ServerDeps holds the dependencies for the HTTP API.
type ServerDeps struct {
	Store       store.Store
	Registry    noderegistry.Registry
	Elector     election.Elector
	Checker     *health.HealthChecker
	Syncer      *configsync.Syncer
	ClusterName string
	Region      string
	Logger      *slog.Logger
}

// NewRouter creates the HTTP router with all API routes.
func NewRouter(deps ServerDeps) http.Handler {
	h := &handlers{deps: deps}
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(middleware.RealIP)

	r.Get("/healthz", h.handleHealthz)
	r.Get("/readyz", h.handleReadyz)

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/cluster/status", h.handleClusterStatus)
		r.Get("/nodes", h.handleNodeList)
	})

	return r
}
