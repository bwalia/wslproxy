package agent

import (
	"fmt"
	"os"
	"time"
)

// Config holds the agent configuration.
type Config struct {
	NodeID         string
	Region         string
	ClusterName    string
	ListenAddr     string
	EtcdEndpoints  []string
	WSLProxyURL    string
	ConfigDir      string
	ElectionTTL    time.Duration
	HealthInterval time.Duration
	PollInterval   time.Duration
	Standalone     bool // run without etcd (single-node mode)
}

// DefaultConfig returns a config with sensible defaults.
func DefaultConfig() Config {
	hostname, _ := os.Hostname()
	return Config{
		NodeID:         hostname,
		Region:         "default",
		ClusterName:    "wslproxy",
		ListenAddr:     ":9090",
		EtcdEndpoints:  []string{"localhost:2379"},
		WSLProxyURL:    "http://localhost:8080",
		ConfigDir:      "/opt/nginx/data",
		ElectionTTL:    15 * time.Second,
		HealthInterval: 5 * time.Second,
		PollInterval:   30 * time.Second,
		Standalone:     false,
	}
}

// Validate checks that the config is valid.
func (c Config) Validate() error {
	if c.NodeID == "" {
		return fmt.Errorf("node-id is required")
	}
	if c.Region == "" {
		return fmt.Errorf("region is required")
	}
	if c.WSLProxyURL == "" {
		return fmt.Errorf("wslproxy-url is required")
	}
	if c.ConfigDir == "" {
		return fmt.Errorf("config-dir is required")
	}
	if !c.Standalone && len(c.EtcdEndpoints) == 0 {
		return fmt.Errorf("etcd-endpoints required when not in standalone mode")
	}
	return nil
}
