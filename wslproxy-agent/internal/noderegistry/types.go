package noderegistry

import "time"

// NodeInfo represents a registered WSLproxy node in the cluster.
type NodeInfo struct {
	NodeID        string    `json:"node_id"`
	Region        string    `json:"region"`
	Address       string    `json:"address"`
	Port          int       `json:"port"`
	Status        string    `json:"status"`         // "healthy", "unhealthy", "starting"
	Role          string    `json:"role"`            // "leader", "follower"
	ConfigVersion int64     `json:"config_version"`
	Version       string    `json:"version"`
	StartedAt     time.Time `json:"started_at"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
}
