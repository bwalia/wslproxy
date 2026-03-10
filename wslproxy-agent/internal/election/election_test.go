package election

import (
	"context"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/wslproxy/wslproxy/wslproxy-agent/internal/store"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
}

func TestElector_SingleNode_BecomesLeader(t *testing.T) {
	s := store.NewMockStore()
	defer s.Close()

	cfg := Config{NodeID: "node-1", Region: "eu", LeaseTTL: 15 * time.Second, RetryDelay: 100 * time.Millisecond}
	e := NewStoreElector(cfg, s, testLogger())

	stateChanges := make(chan ElectionState, 10)
	e.OnStateChange(func(state ElectionState) {
		stateChanges <- state
	})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	go e.Run(ctx)

	// Wait for leader transition
	select {
	case state := <-stateChanges:
		if state != StateLeader {
			t.Fatalf("expected StateLeader, got %v", state)
		}
	case <-ctx.Done():
		t.Fatal("timed out waiting for leader election")
	}

	if !e.IsLeader() {
		t.Fatal("expected IsLeader() == true")
	}

	leader := e.Leader()
	if leader == nil {
		t.Fatal("expected leader info")
	}
	if leader.NodeID != "node-1" {
		t.Fatalf("expected leader node-1, got %s", leader.NodeID)
	}
}

func TestElector_TwoNodes_OnlyOneLeader(t *testing.T) {
	s := store.NewMockStore()
	defer s.Close()

	cfg1 := Config{NodeID: "node-1", Region: "eu", LeaseTTL: 15 * time.Second, RetryDelay: 100 * time.Millisecond}
	cfg2 := Config{NodeID: "node-2", Region: "eu", LeaseTTL: 15 * time.Second, RetryDelay: 100 * time.Millisecond}

	e1 := NewStoreElector(cfg1, s, testLogger())
	e2 := NewStoreElector(cfg2, s, testLogger())

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	state1 := make(chan ElectionState, 10)
	e1.OnStateChange(func(st ElectionState) { state1 <- st })

	go e1.Run(ctx)

	// Wait for e1 to become leader
	select {
	case st := <-state1:
		if st != StateLeader {
			t.Fatalf("expected node-1 to be leader, got %v", st)
		}
	case <-ctx.Done():
		t.Fatal("timed out")
	}

	// Start e2 — should become follower
	go e2.Run(ctx)
	time.Sleep(500 * time.Millisecond)

	if e2.IsLeader() {
		t.Fatal("node-2 should be follower while node-1 is leader")
	}
	if !e1.IsLeader() {
		t.Fatal("node-1 should still be leader")
	}
}

func TestElector_LeaderResign_NewElection(t *testing.T) {
	s := store.NewMockStore()
	defer s.Close()

	cfg1 := Config{NodeID: "node-1", Region: "eu", LeaseTTL: 500 * time.Millisecond, RetryDelay: 100 * time.Millisecond}
	cfg2 := Config{NodeID: "node-2", Region: "eu", LeaseTTL: 500 * time.Millisecond, RetryDelay: 100 * time.Millisecond}

	e1 := NewStoreElector(cfg1, s, testLogger())
	e2 := NewStoreElector(cfg2, s, testLogger())

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	state1 := make(chan ElectionState, 10)
	e1.OnStateChange(func(st ElectionState) { state1 <- st })

	go e1.Run(ctx)
	<-state1 // wait for e1 leader

	// Start e2 and give it time to enter the watch loop
	go e2.Run(ctx)
	time.Sleep(500 * time.Millisecond)

	// Resign e1 — deletes leader key, revokes lease
	_ = e1.Resign(ctx)

	// e2 should eventually become leader (via watch event or retry loop)
	deadline := time.After(5 * time.Second)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-deadline:
			t.Fatal("timed out waiting for node-2 to become leader after node-1 resign")
		case <-ticker.C:
			if e2.IsLeader() {
				leader := e2.Leader()
				if leader != nil && leader.NodeID == "node-2" {
					return // success
				}
			}
		}
	}
}
