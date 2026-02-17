package main

import (
	"context"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/bwalia/wslproxy/dashboard/internal/auth"
	"github.com/bwalia/wslproxy/dashboard/internal/k3s"
	"github.com/bwalia/wslproxy/dashboard/internal/mcp"
	"github.com/bwalia/wslproxy/dashboard/internal/observability"
	"github.com/bwalia/wslproxy/dashboard/internal/ui"
	"github.com/bwalia/wslproxy/dashboard/internal/workflows"
)

func main() {
	// Flags
	var (
		addr      = flag.String("addr", ":8090", "Dashboard listen address")
		mcpURL    = flag.String("mcp-url", "http://localhost:8080", "WSLProxy MCP base URL")
		mcpKey    = flag.String("mcp-key", "", "MCP API key (or MCP_API_KEY env)")
		adminPass = flag.String("admin-pass", "", "Initial admin password (or ADMIN_PASSWORD env)")
		readOnly  = flag.Bool("read-only", false, "Start in read-only mode")
	)
	flag.Parse()

	// Logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	// Resolve env vars
	if *mcpKey == "" {
		*mcpKey = os.Getenv("MCP_API_KEY")
	}
	if *adminPass == "" {
		*adminPass = os.Getenv("ADMIN_PASSWORD")
	}
	if *adminPass == "" {
		*adminPass = "admin" // default for development
		logger.Warn("using default admin password, set ADMIN_PASSWORD for production")
	}

	// Initialize MCP client
	mcpClient := mcp.NewClient(*mcpURL, *mcpKey, mcp.WithTimeout(10*time.Second))

	// Initialize auth store with default admin
	authStore := auth.NewStore()
	if err := authStore.AddUser("admin", *adminPass, "admin"); err != nil {
		logger.Error("failed to create admin user", "error", err)
		os.Exit(1)
	}
	// Add default viewer
	_ = authStore.AddUser("viewer", "viewer", "viewer")
	// Add default operator
	_ = authStore.AddUser("operator", "operator", "operator")

	// Initialize workflow engine
	workflowEngine := workflows.NewEngine()
	workflowEngine.SetReadOnly(*readOnly)

	// Initialize k3s manager
	k3sMgr := k3s.NewManager(mcpClient)

	// Initialize observer
	observer := observability.NewObserver(mcpClient)

	// Find templates directory (relative to binary or working dir)
	templatesDir := findDir("web/templates")
	staticDir := findDir("web/static")

	// Initialize UI handler
	handler, err := ui.NewHandler(ui.Config{
		TemplatesDir: templatesDir,
		StaticDir:    staticDir,
		MCPClient:    mcpClient,
		AuthStore:    authStore,
		Workflow:     workflowEngine,
		K3sManager:   k3sMgr,
		Observer:     observer,
		Logger:       logger,
	})
	if err != nil {
		logger.Error("failed to initialize UI handler", "error", err)
		os.Exit(1)
	}

	// Create HTTP server
	srv := &http.Server{
		Addr:         *addr,
		Handler:      handler.Routes(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server
	go func() {
		logger.Info("starting WSLProxy dashboard", "addr", *addr, "mcp_url", *mcpURL, "read_only", *readOnly)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("shutting down dashboard")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("shutdown error", "error", err)
	}
	logger.Info("dashboard stopped")
}

// findDir looks for a directory relative to current dir or executable path
func findDir(rel string) string {
	// Check relative to working directory
	if abs, err := filepath.Abs(rel); err == nil {
		if _, err := os.Stat(abs); err == nil {
			return abs
		}
	}
	// Check relative to executable
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Dir(exe)
		abs := filepath.Join(dir, rel)
		if _, err := os.Stat(abs); err == nil {
			return abs
		}
	}
	return rel
}
