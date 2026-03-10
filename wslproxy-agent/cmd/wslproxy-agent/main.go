package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/agent"
	"github.com/wslproxy/wslproxy/wslproxy-agent/pkg/version"
)

func main() {
	cfg := agent.DefaultConfig()

	flag.StringVar(&cfg.NodeID, "node-id", envOrDefault("NODE_ID", cfg.NodeID), "Unique node identifier")
	flag.StringVar(&cfg.Region, "region", envOrDefault("REGION", cfg.Region), "Cluster region")
	flag.StringVar(&cfg.ClusterName, "cluster-name", envOrDefault("CLUSTER_NAME", cfg.ClusterName), "Cluster name")
	flag.StringVar(&cfg.ListenAddr, "listen-addr", envOrDefault("LISTEN_ADDR", cfg.ListenAddr), "Agent HTTP listen address")
	etcdEndpoints := flag.String("etcd-endpoints", envOrDefault("ETCD_ENDPOINTS", "localhost:2379"), "Comma-separated etcd endpoints")
	flag.StringVar(&cfg.WSLProxyURL, "wslproxy-url", envOrDefault("WSLPROXY_URL", cfg.WSLProxyURL), "WSLproxy health check URL")
	flag.StringVar(&cfg.ConfigDir, "config-dir", envOrDefault("CONFIG_DIR", cfg.ConfigDir), "Local config directory")
	flag.DurationVar(&cfg.ElectionTTL, "election-ttl", cfg.ElectionTTL, "Leader election lease TTL")
	flag.DurationVar(&cfg.HealthInterval, "health-interval", cfg.HealthInterval, "Health check interval")
	flag.BoolVar(&cfg.Standalone, "standalone", cfg.Standalone, "Run without etcd (single-node mode)")
	showVersion := flag.Bool("version", false, "Show version and exit")

	flag.Parse()

	if *showVersion {
		slog.Info("wslproxy-agent", "version", version.Version, "commit", version.Commit, "build_date", version.BuildDate)
		os.Exit(0)
	}

	cfg.EtcdEndpoints = strings.Split(*etcdEndpoints, ",")

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	logger.Info("wslproxy-agent starting",
		"version", version.Version,
		"commit", version.Commit,
		"node_id", cfg.NodeID,
		"region", cfg.Region,
	)

	a := agent.New(cfg, logger)

	ctx, cancel := context.WithCancel(context.Background())

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-quit
		logger.Info("shutdown signal received")
		cancel()
	}()

	if err := a.Start(ctx); err != nil && ctx.Err() == nil {
		logger.Error("agent failed", "error", err)
		os.Exit(1)
	}

	// Graceful stop with timeout
	stopCtx, stopCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer stopCancel()
	a.Stop(stopCtx)

	logger.Info("wslproxy-agent stopped")
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
