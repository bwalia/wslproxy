package election

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/store"
)

const leaderKeyPrefix = "/wslproxy/leader/"

// Elector manages leader election for a region.
type Elector interface {
	// Run starts the election loop. Blocks until ctx is cancelled.
	Run(ctx context.Context) error
	// IsLeader returns whether this node is the current leader.
	IsLeader() bool
	// Leader returns the current leader info. Returns nil if no leader.
	Leader() *LeaderInfo
	// State returns the current election state.
	State() ElectionState
	// OnStateChange registers a callback for leader/follower transitions.
	OnStateChange(fn func(ElectionState))
	// Resign gives up leadership if this node is the leader.
	Resign(ctx context.Context) error
}

// Config holds election configuration.
type Config struct {
	NodeID     string
	Region     string
	LeaseTTL   time.Duration // default 15s
	RetryDelay time.Duration // delay between election attempts, default 2s
}

// StoreElector implements leader election using a Store backend.
type StoreElector struct {
	config    Config
	store     store.Store
	logger    *slog.Logger
	mu        sync.RWMutex
	state     ElectionState
	leader    *LeaderInfo
	leaseID   int64
	resigned  bool
	callbacks []func(ElectionState)
}

// NewStoreElector creates a new elector.
func NewStoreElector(cfg Config, s store.Store, logger *slog.Logger) *StoreElector {
	if cfg.LeaseTTL == 0 {
		cfg.LeaseTTL = 15 * time.Second
	}
	if cfg.RetryDelay == 0 {
		cfg.RetryDelay = 2 * time.Second
	}
	return &StoreElector{
		config: cfg,
		store:  s,
		logger: logger,
		state:  StateFollower,
	}
}

func (e *StoreElector) leaderKey() string {
	return leaderKeyPrefix + e.config.Region
}

func (e *StoreElector) Run(ctx context.Context) error {
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// If this node just resigned, back off longer to let others win
		e.mu.RLock()
		wasResigned := e.resigned
		e.mu.RUnlock()
		if wasResigned {
			e.mu.Lock()
			e.resigned = false
			e.mu.Unlock()
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(e.config.LeaseTTL):
			}
			continue
		}

		err := e.campaign(ctx)
		if err != nil && ctx.Err() == nil {
			e.logger.Warn("election campaign error, retrying", "error", err)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(e.config.RetryDelay):
		}
	}
}

func (e *StoreElector) campaign(ctx context.Context) error {
	// Grant a new lease
	ttlSec := int64(e.config.LeaseTTL.Seconds())
	leaseID, err := e.store.GrantLease(ctx, ttlSec)
	if err != nil {
		return fmt.Errorf("grant lease: %w", err)
	}

	e.mu.Lock()
	e.leaseID = leaseID
	e.mu.Unlock()

	// Start keepalive
	doneCh, err := e.store.KeepAliveLease(ctx, leaseID)
	if err != nil {
		_ = e.store.RevokeLease(ctx, leaseID)
		return fmt.Errorf("keepalive: %w", err)
	}

	// Attempt to become leader
	info := LeaderInfo{
		NodeID:    e.config.NodeID,
		ElectedAt: time.Now().UTC(),
	}
	infoBytes, _ := json.Marshal(info)

	ok, err := e.store.CAS(ctx, e.leaderKey(), nil, infoBytes, leaseID)
	if err != nil {
		_ = e.store.RevokeLease(ctx, leaseID)
		return fmt.Errorf("CAS: %w", err)
	}

	if ok {
		e.transition(StateLeader, &info)
		e.logger.Info("elected as leader", "node_id", e.config.NodeID, "region", e.config.Region)

		// Hold leadership until lease/keepalive fails or context cancelled
		select {
		case <-ctx.Done():
			_ = e.resign(ctx)
			return ctx.Err()
		case <-doneCh:
			e.transition(StateFollower, nil)
			e.logger.Warn("lost leadership (keepalive failed)", "node_id", e.config.NodeID)
			return nil
		}
	}

	// Not elected — revoke our unused lease, then watch for leader key changes
	_ = e.store.RevokeLease(ctx, leaseID)
	e.updateLeaderFromStore(ctx)
	e.transition(StateFollower, e.Leader())

	// Watch the leader key prefix for deletion (indicating leader died/resigned)
	watchCh, err := e.store.Watch(ctx, leaderKeyPrefix)
	if err != nil {
		return fmt.Errorf("watch leader key: %w", err)
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case evt, ok := <-watchCh:
			if !ok {
				return nil // Watch channel closed, retry
			}
			if evt.Key != e.leaderKey() {
				continue
			}
			if evt.Type == store.EventDelete {
				e.logger.Info("leader key deleted, attempting election", "node_id", e.config.NodeID)
				return nil // Retry campaign
			}
			if evt.Type == store.EventPut {
				var leader LeaderInfo
				if json.Unmarshal(evt.Value, &leader) == nil {
					e.mu.Lock()
					e.leader = &leader
					e.mu.Unlock()
				}
			}
		}
	}
}

func (e *StoreElector) updateLeaderFromStore(ctx context.Context) {
	data, err := e.store.Get(ctx, e.leaderKey())
	if err != nil {
		return
	}
	var info LeaderInfo
	if json.Unmarshal(data, &info) == nil {
		e.mu.Lock()
		e.leader = &info
		e.mu.Unlock()
	}
}

func (e *StoreElector) transition(newState ElectionState, leader *LeaderInfo) {
	e.mu.Lock()
	oldState := e.state
	e.state = newState
	e.leader = leader
	callbacks := make([]func(ElectionState), len(e.callbacks))
	copy(callbacks, e.callbacks)
	e.mu.Unlock()

	if oldState != newState {
		for _, fn := range callbacks {
			fn(newState)
		}
	}
}

func (e *StoreElector) IsLeader() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.state == StateLeader
}

func (e *StoreElector) Leader() *LeaderInfo {
	e.mu.RLock()
	defer e.mu.RUnlock()
	if e.leader == nil {
		return nil
	}
	info := *e.leader
	return &info
}

func (e *StoreElector) State() ElectionState {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.state
}

func (e *StoreElector) OnStateChange(fn func(ElectionState)) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.callbacks = append(e.callbacks, fn)
}

func (e *StoreElector) Resign(ctx context.Context) error {
	return e.resign(ctx)
}

func (e *StoreElector) resign(ctx context.Context) error {
	e.mu.RLock()
	leaseID := e.leaseID
	isLeader := e.state == StateLeader
	e.mu.RUnlock()

	if !isLeader {
		return nil
	}

	e.logger.Info("resigning leadership", "node_id", e.config.NodeID)
	_ = e.store.Delete(ctx, e.leaderKey())
	if leaseID != 0 {
		_ = e.store.RevokeLease(ctx, leaseID)
	}
	e.mu.Lock()
	e.resigned = true
	e.mu.Unlock()
	e.transition(StateFollower, nil)
	return nil
}
