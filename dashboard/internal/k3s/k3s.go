package k3s

import (
	"context"
	"fmt"
	"time"

	"github.com/bwalia/wslproxy/dashboard/internal/mcp"
)

// ClusterStatus represents the k3s cluster state.
type ClusterStatus struct {
	Available    bool      `json:"available"`
	Version      string    `json:"version,omitempty"`
	NodeCount    int       `json:"node_count"`
	IngressReady bool      `json:"ingress_ready"`
	LastChecked  time.Time `json:"last_checked"`
}

// IngressRule represents a configured ingress rule.
type IngressRule struct {
	Host        string `json:"host"`
	Path        string `json:"path"`
	ServiceName string `json:"service_name"`
	ServicePort int    `json:"service_port"`
	TLS         bool   `json:"tls"`
}

// Manager handles k3s cluster operations via MCP.
type Manager struct {
	mcpClient *mcp.Client
}

// NewManager creates a k3s manager.
func NewManager(mcpClient *mcp.Client) *Manager {
	return &Manager{mcpClient: mcpClient}
}

// GetClusterStatus checks cluster status via MCP health resource.
func (m *Manager) GetClusterStatus(ctx context.Context) (*ClusterStatus, error) {
	res, err := m.mcpClient.GetResource(ctx, "health", nil)
	if err != nil {
		return &ClusterStatus{
			Available:   false,
			LastChecked: time.Now(),
		}, fmt.Errorf("k3s: fetching health resource: %w", err)
	}

	status := &ClusterStatus{
		Available:   true,
		LastChecked: time.Now(),
	}

	if v, ok := res.Attributes["version"].(string); ok {
		status.Version = v
	}
	if n, ok := res.Attributes["node_count"].(float64); ok {
		status.NodeCount = int(n)
	}
	if ir, ok := res.Attributes["ingress_ready"].(bool); ok {
		status.IngressReady = ir
	}

	return status, nil
}

// ListIngressRules retrieves ingress rules via MCP.
func (m *Manager) ListIngressRules(ctx context.Context) ([]IngressRule, error) {
	res, err := m.mcpClient.GetResource(ctx, "servers", nil)
	if err != nil {
		return nil, fmt.Errorf("k3s: fetching servers resource: %w", err)
	}

	items, ok := res.Attributes["items"].([]interface{})
	if !ok {
		return []IngressRule{}, nil
	}

	rules := make([]IngressRule, 0, len(items))
	for _, item := range items {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		rule := IngressRule{}
		if h, ok := m["host"].(string); ok {
			rule.Host = h
		}
		if p, ok := m["path"].(string); ok {
			rule.Path = p
		}
		if sn, ok := m["service_name"].(string); ok {
			rule.ServiceName = sn
		}
		if sp, ok := m["service_port"].(float64); ok {
			rule.ServicePort = int(sp)
		}
		if tls, ok := m["tls"].(bool); ok {
			rule.TLS = tls
		}
		rules = append(rules, rule)
	}
	return rules, nil
}

// InstallIngress creates a change request to install ingress controller.
func (m *Manager) InstallIngress(ctx context.Context) (*mcp.ToolResult, error) {
	validateResult, err := m.mcpClient.ExecuteTool(ctx, "validate_config", map[string]interface{}{
		"component": "ingress",
	})
	if err != nil {
		return nil, fmt.Errorf("k3s: validating ingress config: %w", err)
	}
	return validateResult, nil
}
