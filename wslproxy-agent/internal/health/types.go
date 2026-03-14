package health

import "time"

// NodeHealth represents the health state of a WSLproxy node.
type NodeHealth struct {
	Status        string                  `json:"status"`          // "healthy", "unhealthy", "unknown"
	ConfigLoaded  bool                    `json:"config_loaded"`
	ConfigVersion int64                   `json:"config_version"`
	LastCheck     time.Time               `json:"last_check"`
	ProxyHealth   *ProxyHealthResponse    `json:"proxy_health,omitempty"`
	Error         string                  `json:"error,omitempty"`
}

// ProxyHealthResponse matches the JSON returned by WSLproxy's /health endpoint (ping.lua).
type ProxyHealthResponse struct {
	Status    string `json:"status"`
	Response  string `json:"response"`
	Timestamp string `json:"timestamp"`
}
