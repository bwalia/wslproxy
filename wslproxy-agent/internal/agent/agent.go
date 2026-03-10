package agent

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/configsync"
	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/election"
	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/health"
	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/httpapi"
	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/noderegistry"
	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/store"
)

// Agent orchestrates all HA cluster components.
type Agent struct {
	config   Config
	logger   *slog.Logger
	store    store.Store
	registry *noderegistry.StoreRegistry
	elector  *election.StoreElector
	checker  *health.HealthChecker
	reporter *health.Reporter
	syncer   *configsync.Syncer
	writer   *configsync.ConfigWriter
	httpSrv  *http.Server
	leaseID  int64
}

// New creates a new Agent with the given config.
func New(cfg Config, logger *slog.Logger) *Agent {
	return &Agent{
		config: cfg,
		logger: logger,
	}
}

// Start initializes all components and starts the agent. Blocks until ctx is cancelled.
func (a *Agent) Start(ctx context.Context) error {
	if err := a.config.Validate(); err != nil {
		return fmt.Errorf("invalid config: %w", err)
	}

	a.logger.Info("starting wslproxy-agent",
		"node_id", a.config.NodeID,
		"region", a.config.Region,
		"standalone", a.config.Standalone,
	)

	// Initialize store
	if a.config.Standalone {
		a.store = store.NewMockStore()
		a.logger.Info("running in standalone mode (no etcd)")
	} else {
		etcdStore, err := store.NewEtcdStore(a.config.EtcdEndpoints, 5*time.Second)
		if err != nil {
			return fmt.Errorf("connect to etcd: %w", err)
		}
		a.store = etcdStore
		a.logger.Info("connected to etcd", "endpoints", a.config.EtcdEndpoints)
	}

	// Grant a lease for this node's registration
	leaseID, err := a.store.GrantLease(ctx, int64(a.config.ElectionTTL.Seconds()))
	if err != nil {
		return fmt.Errorf("grant lease: %w", err)
	}
	a.leaseID = leaseID

	// Start keepalive
	_, err = a.store.KeepAliveLease(ctx, leaseID)
	if err != nil {
		return fmt.Errorf("keepalive: %w", err)
	}

	// Initialize components
	a.registry = noderegistry.NewStoreRegistry(a.store)
	a.checker = health.NewHealthChecker(a.config.WSLProxyURL, a.logger,
		health.WithInterval(a.config.HealthInterval))
	a.reporter = health.NewReporter(a.checker, a.store, a.config.NodeID, a.config.Region, leaseID, a.logger)
	a.writer = configsync.NewConfigWriter(a.config.ConfigDir)
	a.syncer = configsync.NewSyncer(a.store, a.writer, a.logger)

	a.elector = election.NewStoreElector(election.Config{
		NodeID:     a.config.NodeID,
		Region:     a.config.Region,
		LeaseTTL:   a.config.ElectionTTL,
		RetryDelay: 2 * time.Second,
	}, a.store, a.logger)

	a.elector.OnStateChange(func(state election.ElectionState) {
		a.logger.Info("election state changed", "state", state.String(), "node_id", a.config.NodeID)
	})

	// Register node
	node := noderegistry.NodeInfo{
		NodeID:    a.config.NodeID,
		Region:    a.config.Region,
		Address:   a.config.ListenAddr,
		Port:      8080,
		Status:    "starting",
		Role:      "follower",
		StartedAt: time.Now().UTC(),
	}
	if err := a.registry.Register(ctx, node, leaseID); err != nil {
		a.logger.Error("failed to register node", "error", err)
	}

	// Start background goroutines
	go a.checker.Run(ctx)
	go a.reporter.Run(ctx)
	go a.elector.Run(ctx)
	go func() {
		if err := a.syncer.Run(ctx); err != nil && ctx.Err() == nil {
			a.logger.Error("config syncer stopped", "error", err)
		}
	}()

	// Start HTTP API
	router := httpapi.NewRouter(httpapi.ServerDeps{
		Store:       a.store,
		Registry:    a.registry,
		Elector:     a.elector,
		Checker:     a.checker,
		Syncer:      a.syncer,
		ClusterName: a.config.ClusterName,
		Region:      a.config.Region,
		Logger:      a.logger,
	})

	a.httpSrv = &http.Server{
		Addr:         a.config.ListenAddr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		a.logger.Info("agent HTTP API listening", "addr", a.config.ListenAddr)
		if err := a.httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			a.logger.Error("HTTP server error", "error", err)
		}
	}()

	// Block until context cancelled
	<-ctx.Done()
	return nil
}

// Stop gracefully shuts down the agent.
func (a *Agent) Stop(ctx context.Context) {
	a.logger.Info("stopping agent", "node_id", a.config.NodeID)

	// Resign leadership
	if a.elector != nil {
		_ = a.elector.Resign(ctx)
	}

	// Deregister node
	if a.registry != nil {
		_ = a.registry.Deregister(ctx, a.config.Region, a.config.NodeID)
	}

	// Revoke lease
	if a.store != nil && a.leaseID != 0 {
		_ = a.store.RevokeLease(ctx, a.leaseID)
	}

	// Shutdown HTTP server
	if a.httpSrv != nil {
		_ = a.httpSrv.Shutdown(ctx)
	}

	// Close store
	if a.store != nil {
		_ = a.store.Close()
	}

	a.logger.Info("agent stopped")
}
