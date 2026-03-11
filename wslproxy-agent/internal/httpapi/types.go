package httpapi

import (
	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/configsync"
	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/election"
	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/noderegistry"
)

// ClusterStatusResponse is returned by GET /api/v1/cluster/status.
type ClusterStatusResponse struct {
	ClusterName   string               `json:"cluster_name"`
	Region        string               `json:"region"`
	Leader        *election.LeaderInfo  `json:"leader"`
	NodeCount     int                   `json:"node_count"`
	ConfigVersion int64                 `json:"config_version"`
	ConfigInSync  bool                  `json:"config_in_sync"`
	SyncState     configsync.SyncState  `json:"sync_state"`
	IsLeader      bool                  `json:"is_leader"`
}

// NodeListResponse is returned by GET /api/v1/nodes.
type NodeListResponse struct {
	Region string                  `json:"region"`
	Nodes  []noderegistry.NodeInfo `json:"nodes"`
	Count  int                     `json:"count"`
}
