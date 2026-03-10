package configsync

import "time"

// ConfigVersion represents a configuration version in the store.
type ConfigVersion struct {
	Version   int64  `json:"version"`
	Checksum  string `json:"checksum"`
	Timestamp string `json:"timestamp"`
	Author    string `json:"author,omitempty"`
	Message   string `json:"message,omitempty"`
}

// SyncState tracks the current sync status of this node.
type SyncState struct {
	CurrentVersion int64     `json:"current_version"`
	LastSyncTime   time.Time `json:"last_sync_time"`
	InSync         bool      `json:"in_sync"`
	Error          string    `json:"error,omitempty"`
}
