package store

import (
	"bytes"
	"context"
	"sync"
	"sync/atomic"
)

// MockStore is an in-memory Store implementation for testing.
type MockStore struct {
	mu       sync.RWMutex
	data     map[string]mockEntry
	leases   map[int64]*mockLease
	watchers map[string][]chan WatchEvent
	nextLease atomic.Int64
	closed   bool
}

type mockEntry struct {
	value   []byte
	leaseID int64
}

type mockLease struct {
	ttl       int64
	alive     bool
	keepAlive chan struct{}
}

// NewMockStore creates a new in-memory mock store.
func NewMockStore() *MockStore {
	m := &MockStore{
		data:     make(map[string]mockEntry),
		leases:   make(map[int64]*mockLease),
		watchers: make(map[string][]chan WatchEvent),
	}
	m.nextLease.Store(1000)
	return m
}

func (m *MockStore) Get(_ context.Context, key string) ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	entry, ok := m.data[key]
	if !ok {
		return nil, ErrKeyNotFound
	}
	return entry.value, nil
}

func (m *MockStore) GetPrefix(_ context.Context, prefix string) (map[string][]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make(map[string][]byte)
	for k, v := range m.data {
		if len(k) >= len(prefix) && k[:len(prefix)] == prefix {
			result[k] = v.value
		}
	}
	return result, nil
}

func (m *MockStore) Put(_ context.Context, key string, value []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.data[key] = mockEntry{value: value}
	m.notify(key, value, EventPut)
	return nil
}

func (m *MockStore) PutWithLease(_ context.Context, key string, value []byte, leaseID int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.data[key] = mockEntry{value: value, leaseID: leaseID}
	m.notify(key, value, EventPut)
	return nil
}

func (m *MockStore) Delete(_ context.Context, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.data, key)
	m.notify(key, nil, EventDelete)
	return nil
}

func (m *MockStore) Watch(_ context.Context, prefix string) (<-chan WatchEvent, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	ch := make(chan WatchEvent, 64)
	m.watchers[prefix] = append(m.watchers[prefix], ch)
	return ch, nil
}

func (m *MockStore) GrantLease(_ context.Context, ttlSeconds int64) (int64, error) {
	id := m.nextLease.Add(1)
	m.mu.Lock()
	defer m.mu.Unlock()
	m.leases[id] = &mockLease{ttl: ttlSeconds, alive: true, keepAlive: make(chan struct{})}
	return id, nil
}

func (m *MockStore) KeepAliveLease(_ context.Context, leaseID int64) (<-chan struct{}, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	lease, ok := m.leases[leaseID]
	if !ok {
		return nil, ErrKeyNotFound
	}
	return lease.keepAlive, nil
}

func (m *MockStore) RevokeLease(_ context.Context, leaseID int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	lease, ok := m.leases[leaseID]
	if ok {
		lease.alive = false
		close(lease.keepAlive)
		delete(m.leases, leaseID)
	}

	// Delete all keys with this lease
	for k, v := range m.data {
		if v.leaseID == leaseID {
			delete(m.data, k)
			m.notify(k, nil, EventDelete)
		}
	}
	return nil
}

func (m *MockStore) CAS(_ context.Context, key string, expected []byte, value []byte, leaseID int64) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	entry, exists := m.data[key]

	if expected == nil {
		// Expect key to not exist
		if exists {
			return false, nil
		}
	} else {
		// Expect key to have specific value
		if !exists || !bytes.Equal(entry.value, expected) {
			return false, nil
		}
	}

	m.data[key] = mockEntry{value: value, leaseID: leaseID}
	m.notify(key, value, EventPut)
	return true, nil
}

func (m *MockStore) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closed = true
	for _, watchers := range m.watchers {
		for _, ch := range watchers {
			close(ch)
		}
	}
	m.watchers = make(map[string][]chan WatchEvent)
	return nil
}

// notify sends watch events to all watchers whose prefix matches the key.
// Must be called with mu held.
func (m *MockStore) notify(key string, value []byte, eventType EventType) {
	evt := WatchEvent{Type: eventType, Key: key, Value: value}
	for prefix, watchers := range m.watchers {
		if len(key) >= len(prefix) && key[:len(prefix)] == prefix {
			for _, ch := range watchers {
				select {
				case ch <- evt:
				default:
					// Drop if channel is full
				}
			}
		}
	}
}

// ExpireLease simulates a lease expiry for testing.
func (m *MockStore) ExpireLease(leaseID int64) {
	_ = m.RevokeLease(context.Background(), leaseID)
}
