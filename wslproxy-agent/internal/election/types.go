package election

import "time"

// ElectionState represents whether this node is a leader or follower.
type ElectionState int

const (
	StateFollower ElectionState = iota
	StateLeader
)

func (s ElectionState) String() string {
	switch s {
	case StateLeader:
		return "leader"
	default:
		return "follower"
	}
}

// LeaderInfo identifies the current cluster leader.
type LeaderInfo struct {
	NodeID    string    `json:"node_id"`
	ElectedAt time.Time `json:"elected_at"`
}
