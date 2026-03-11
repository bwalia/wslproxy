package store

import (
	"context"
	"errors"
)

// EventType represents the type of a watch event.
type EventType int

const (
	EventPut    EventType = iota
	EventDelete
)

// WatchEvent represents a change observed on a key prefix.
type WatchEvent struct {
	Type  EventType
	Key   string
	Value []byte
}

// ErrKeyNotFound is returned when a key does not exist.
var ErrKeyNotFound = errors.New("key not found")

// Store abstracts a distributed key-value store (etcd, Consul, or in-memory mock).
type Store interface {
	// Get retrieves the value for a key. Returns ErrKeyNotFound if missing.
	Get(ctx context.Context, key string) ([]byte, error)

	// GetPrefix retrieves all key-value pairs under a prefix.
	GetPrefix(ctx context.Context, prefix string) (map[string][]byte, error)

	// Put stores a value at a key.
	Put(ctx context.Context, key string, value []byte) error

	// PutWithLease stores a value at a key attached to a lease.
	// The key is automatically deleted when the lease expires.
	PutWithLease(ctx context.Context, key string, value []byte, leaseID int64) error

	// Delete removes a key.
	Delete(ctx context.Context, key string) error

	// Watch watches a key prefix and sends events on the returned channel.
	// The channel is closed when the context is cancelled.
	Watch(ctx context.Context, prefix string) (<-chan WatchEvent, error)

	// GrantLease creates a new lease with the given TTL in seconds.
	// Returns the lease ID.
	GrantLease(ctx context.Context, ttlSeconds int64) (int64, error)

	// KeepAliveLease starts automatic keepalive for a lease.
	// The returned channel is closed if the keepalive fails.
	KeepAliveLease(ctx context.Context, leaseID int64) (<-chan struct{}, error)

	// RevokeLease revokes a lease, deleting all keys attached to it.
	RevokeLease(ctx context.Context, leaseID int64) error

	// CAS performs a compare-and-swap operation.
	// If the key's current value equals expected (nil means key must not exist),
	// it is set to value with the given lease. Returns true if the swap succeeded.
	CAS(ctx context.Context, key string, expected []byte, value []byte, leaseID int64) (bool, error)

	// Close closes the store connection.
	Close() error
}
