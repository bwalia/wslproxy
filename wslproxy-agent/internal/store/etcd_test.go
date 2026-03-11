package store

import (
	"context"
	"testing"
	"time"
)

// Tests use the MockStore since we can't guarantee an etcd instance in unit tests.
// Integration tests against real etcd are in the deploy/ test suite.

func TestMockStore_GetPut(t *testing.T) {
	s := NewMockStore()
	defer s.Close()
	ctx := context.Background()

	// Get non-existent key
	_, err := s.Get(ctx, "/test/key1")
	if err != ErrKeyNotFound {
		t.Fatalf("expected ErrKeyNotFound, got %v", err)
	}

	// Put and get
	if err := s.Put(ctx, "/test/key1", []byte("value1")); err != nil {
		t.Fatalf("put: %v", err)
	}
	val, err := s.Get(ctx, "/test/key1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if string(val) != "value1" {
		t.Fatalf("expected value1, got %s", val)
	}
}

func TestMockStore_GetPrefix(t *testing.T) {
	s := NewMockStore()
	defer s.Close()
	ctx := context.Background()

	_ = s.Put(ctx, "/nodes/eu/node-1", []byte("n1"))
	_ = s.Put(ctx, "/nodes/eu/node-2", []byte("n2"))
	_ = s.Put(ctx, "/nodes/us/node-3", []byte("n3"))

	result, err := s.GetPrefix(ctx, "/nodes/eu/")
	if err != nil {
		t.Fatalf("get prefix: %v", err)
	}
	if len(result) != 2 {
		t.Fatalf("expected 2 keys, got %d", len(result))
	}
}

func TestMockStore_Delete(t *testing.T) {
	s := NewMockStore()
	defer s.Close()
	ctx := context.Background()

	_ = s.Put(ctx, "/test/key1", []byte("value1"))
	_ = s.Delete(ctx, "/test/key1")

	_, err := s.Get(ctx, "/test/key1")
	if err != ErrKeyNotFound {
		t.Fatalf("expected ErrKeyNotFound after delete, got %v", err)
	}
}

func TestMockStore_CAS_CreateIfNotExists(t *testing.T) {
	s := NewMockStore()
	defer s.Close()
	ctx := context.Background()

	leaseID, _ := s.GrantLease(ctx, 15)

	// CAS on non-existent key (expected=nil) should succeed
	ok, err := s.CAS(ctx, "/leader/eu", nil, []byte("node-1"), leaseID)
	if err != nil {
		t.Fatalf("cas: %v", err)
	}
	if !ok {
		t.Fatal("expected CAS to succeed on empty key")
	}

	// Second CAS with expected=nil should fail (key now exists)
	ok, err = s.CAS(ctx, "/leader/eu", nil, []byte("node-2"), leaseID)
	if err != nil {
		t.Fatalf("cas: %v", err)
	}
	if ok {
		t.Fatal("expected CAS to fail when key exists")
	}

	// Verify value is still node-1
	val, _ := s.Get(ctx, "/leader/eu")
	if string(val) != "node-1" {
		t.Fatalf("expected node-1, got %s", val)
	}
}

func TestMockStore_CAS_SwapExisting(t *testing.T) {
	s := NewMockStore()
	defer s.Close()
	ctx := context.Background()

	leaseID, _ := s.GrantLease(ctx, 15)
	_ = s.Put(ctx, "/leader/eu", []byte("node-1"))

	// CAS with correct expected value
	ok, _ := s.CAS(ctx, "/leader/eu", []byte("node-1"), []byte("node-2"), leaseID)
	if !ok {
		t.Fatal("expected CAS to succeed with matching value")
	}

	val, _ := s.Get(ctx, "/leader/eu")
	if string(val) != "node-2" {
		t.Fatalf("expected node-2, got %s", val)
	}

	// CAS with wrong expected value
	ok, _ = s.CAS(ctx, "/leader/eu", []byte("node-1"), []byte("node-3"), leaseID)
	if ok {
		t.Fatal("expected CAS to fail with wrong expected value")
	}
}

func TestMockStore_LeaseRevoke(t *testing.T) {
	s := NewMockStore()
	defer s.Close()
	ctx := context.Background()

	leaseID, _ := s.GrantLease(ctx, 15)
	_ = s.PutWithLease(ctx, "/nodes/eu/node-1", []byte("data"), leaseID)

	// Key should exist
	_, err := s.Get(ctx, "/nodes/eu/node-1")
	if err != nil {
		t.Fatalf("expected key to exist, got %v", err)
	}

	// Revoke lease
	_ = s.RevokeLease(ctx, leaseID)

	// Key should be gone
	_, err = s.Get(ctx, "/nodes/eu/node-1")
	if err != ErrKeyNotFound {
		t.Fatalf("expected ErrKeyNotFound after lease revoke, got %v", err)
	}
}

func TestMockStore_Watch(t *testing.T) {
	s := NewMockStore()
	defer s.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	ch, err := s.Watch(ctx, "/nodes/")
	if err != nil {
		t.Fatalf("watch: %v", err)
	}

	// Write after watch
	_ = s.Put(ctx, "/nodes/eu/node-1", []byte("data"))

	select {
	case evt := <-ch:
		if evt.Type != EventPut {
			t.Fatalf("expected EventPut, got %v", evt.Type)
		}
		if evt.Key != "/nodes/eu/node-1" {
			t.Fatalf("expected key /nodes/eu/node-1, got %s", evt.Key)
		}
	case <-ctx.Done():
		t.Fatal("timed out waiting for watch event")
	}

	// Delete should also trigger
	_ = s.Delete(ctx, "/nodes/eu/node-1")

	select {
	case evt := <-ch:
		if evt.Type != EventDelete {
			t.Fatalf("expected EventDelete, got %v", evt.Type)
		}
	case <-ctx.Done():
		t.Fatal("timed out waiting for delete event")
	}
}

func TestMockStore_ExpireLease(t *testing.T) {
	s := NewMockStore()
	defer s.Close()
	ctx := context.Background()

	leaseID, _ := s.GrantLease(ctx, 15)
	_, _ = s.CAS(ctx, "/leader/eu", nil, []byte("node-1"), leaseID)

	// Simulate lease expiry
	s.ExpireLease(leaseID)

	_, err := s.Get(ctx, "/leader/eu")
	if err != ErrKeyNotFound {
		t.Fatalf("expected key deleted after lease expiry, got %v", err)
	}
}
