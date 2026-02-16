package observability

import (
	"context"
	"fmt"
	"time"

	"github.com/bwalia/wslproxy/dashboard/internal/mcp"
)

// HealthStatus represents gateway health.
type HealthStatus struct {
	Status    string    `json:"status"`
	Uptime    string    `json:"uptime,omitempty"`
	Workers   int       `json:"workers,omitempty"`
	CheckedAt time.Time `json:"checked_at"`
}

// MetricsSummary provides traffic metrics.
type MetricsSummary struct {
	TotalRequests  int64            `json:"total_requests"`
	ActiveConns    int64            `json:"active_connections"`
	ErrorRate      float64          `json:"error_rate"`
	AvgLatencyMs   float64          `json:"avg_latency_ms"`
	RequestMethods map[string]int64 `json:"request_methods,omitempty"`
	StatusCodes    map[string]int64 `json:"status_codes,omitempty"`
	CollectedAt    time.Time        `json:"collected_at"`
}

// LogEntry represents a log line.
type LogEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Level     string    `json:"level"`
	Message   string    `json:"message"`
	Source    string    `json:"source,omitempty"`
}

// Observer provides observability data via MCP.
type Observer struct {
	mcpClient *mcp.Client
}

// NewObserver creates an observer.
func NewObserver(mcpClient *mcp.Client) *Observer {
	return &Observer{mcpClient: mcpClient}
}

// GetHealth returns current health status.
func (o *Observer) GetHealth(ctx context.Context) (*HealthStatus, error) {
	res, err := o.mcpClient.GetResource(ctx, "health", nil)
	if err != nil {
		return &HealthStatus{
			Status:    "unknown",
			CheckedAt: time.Now(),
		}, fmt.Errorf("observability: fetching health resource: %w", err)
	}

	hs := &HealthStatus{
		Status:    "healthy",
		CheckedAt: time.Now(),
	}
	if s, ok := res.Attributes["status"].(string); ok {
		hs.Status = s
	}
	if u, ok := res.Attributes["uptime"].(string); ok {
		hs.Uptime = u
	}
	if w, ok := res.Attributes["workers"].(float64); ok {
		hs.Workers = int(w)
	}
	return hs, nil
}

// GetMetrics returns metrics summary.
func (o *Observer) GetMetrics(ctx context.Context) (*MetricsSummary, error) {
	res, err := o.mcpClient.GetResource(ctx, "metrics", nil)
	if err != nil {
		return &MetricsSummary{
			CollectedAt: time.Now(),
		}, fmt.Errorf("observability: fetching metrics resource: %w", err)
	}

	ms := &MetricsSummary{
		CollectedAt: time.Now(),
	}
	if tr, ok := res.Attributes["total_requests"].(float64); ok {
		ms.TotalRequests = int64(tr)
	}
	if ac, ok := res.Attributes["active_connections"].(float64); ok {
		ms.ActiveConns = int64(ac)
	}
	if er, ok := res.Attributes["error_rate"].(float64); ok {
		ms.ErrorRate = er
	}
	if al, ok := res.Attributes["avg_latency_ms"].(float64); ok {
		ms.AvgLatencyMs = al
	}
	if rm, ok := res.Attributes["request_methods"].(map[string]interface{}); ok {
		ms.RequestMethods = make(map[string]int64, len(rm))
		for k, v := range rm {
			if n, ok := v.(float64); ok {
				ms.RequestMethods[k] = int64(n)
			}
		}
	}
	if sc, ok := res.Attributes["status_codes"].(map[string]interface{}); ok {
		ms.StatusCodes = make(map[string]int64, len(sc))
		for k, v := range sc {
			if n, ok := v.(float64); ok {
				ms.StatusCodes[k] = int64(n)
			}
		}
	}
	return ms, nil
}

// GetLogs returns recent error logs (via MCP tool).
func (o *Observer) GetLogs(ctx context.Context) ([]LogEntry, error) {
	result, err := o.mcpClient.ExecuteTool(ctx, "get_logs", map[string]interface{}{
		"level": "error",
		"limit": 100,
	})
	if err != nil {
		return nil, fmt.Errorf("observability: fetching logs: %w", err)
	}
	if !result.Success {
		return nil, fmt.Errorf("observability: get_logs failed: %s", result.Error)
	}

	rawEntries, ok := result.Output["entries"].([]interface{})
	if !ok {
		return []LogEntry{}, nil
	}

	entries := make([]LogEntry, 0, len(rawEntries))
	for _, raw := range rawEntries {
		m, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		entry := LogEntry{
			Timestamp: time.Now(),
		}
		if ts, ok := m["timestamp"].(string); ok {
			if t, err := time.Parse(time.RFC3339, ts); err == nil {
				entry.Timestamp = t
			}
		}
		if l, ok := m["level"].(string); ok {
			entry.Level = l
		}
		if msg, ok := m["message"].(string); ok {
			entry.Message = msg
		}
		if src, ok := m["source"].(string); ok {
			entry.Source = src
		}
		entries = append(entries, entry)
	}
	return entries, nil
}
