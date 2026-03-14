package health

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

// CheckerOption configures a HealthChecker.
type CheckerOption func(*HealthChecker)

// WithInterval sets the health check polling interval.
func WithInterval(d time.Duration) CheckerOption {
	return func(c *HealthChecker) { c.interval = d }
}

// WithHTTPClient sets a custom HTTP client.
func WithHTTPClient(client *http.Client) CheckerOption {
	return func(c *HealthChecker) { c.httpClient = client }
}

// HealthChecker polls a WSLproxy /health endpoint.
type HealthChecker struct {
	proxyURL   string
	interval   time.Duration
	httpClient *http.Client
	logger     *slog.Logger

	mu     sync.RWMutex
	health NodeHealth
}

// NewHealthChecker creates a health checker for the given WSLproxy URL.
func NewHealthChecker(proxyURL string, logger *slog.Logger, opts ...CheckerOption) *HealthChecker {
	c := &HealthChecker{
		proxyURL:   proxyURL,
		interval:   5 * time.Second,
		httpClient: &http.Client{Timeout: 3 * time.Second},
		logger:     logger,
		health:     NodeHealth{Status: "unknown"},
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// Check performs a single health check and returns the result.
func (c *HealthChecker) Check(ctx context.Context) NodeHealth {
	url := c.proxyURL + "/health"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return NodeHealth{Status: "unhealthy", Error: fmt.Sprintf("create request: %v", err), LastCheck: time.Now()}
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return NodeHealth{Status: "unhealthy", Error: fmt.Sprintf("request failed: %v", err), LastCheck: time.Now()}
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return NodeHealth{Status: "unhealthy", Error: fmt.Sprintf("read body: %v", err), LastCheck: time.Now()}
	}

	if resp.StatusCode != http.StatusOK {
		return NodeHealth{Status: "unhealthy", Error: fmt.Sprintf("status %d: %s", resp.StatusCode, body), LastCheck: time.Now()}
	}

	var proxyResp ProxyHealthResponse
	if err := json.Unmarshal(body, &proxyResp); err != nil {
		return NodeHealth{Status: "unhealthy", Error: fmt.Sprintf("parse JSON: %v", err), LastCheck: time.Now()}
	}

	status := "healthy"
	if proxyResp.Status != "healthy" && proxyResp.Status != "" {
		status = proxyResp.Status
	}

	return NodeHealth{
		Status:       status,
		ConfigLoaded: true,
		LastCheck:    time.Now(),
		ProxyHealth:  &proxyResp,
	}
}

// Run starts the background health check loop. Blocks until ctx is cancelled.
func (c *HealthChecker) Run(ctx context.Context) {
	ticker := time.NewTicker(c.interval)
	defer ticker.Stop()

	// Immediate first check
	h := c.Check(ctx)
	c.mu.Lock()
	c.health = h
	c.mu.Unlock()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			h := c.Check(ctx)
			c.mu.Lock()
			c.health = h
			c.mu.Unlock()
			if h.Status != "healthy" {
				c.logger.Warn("health check unhealthy", "status", h.Status, "error", h.Error)
			}
		}
	}
}

// Health returns the most recent health check result.
func (c *HealthChecker) Health() NodeHealth {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.health
}
