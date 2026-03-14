package store

import (
	"context"
	"fmt"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
)

// EtcdStore implements Store using an etcd v3 client.
type EtcdStore struct {
	client *clientv3.Client
}

// NewEtcdStore creates a new etcd-backed store.
func NewEtcdStore(endpoints []string, dialTimeout time.Duration) (*EtcdStore, error) {
	client, err := clientv3.New(clientv3.Config{
		Endpoints:   endpoints,
		DialTimeout: dialTimeout,
	})
	if err != nil {
		return nil, fmt.Errorf("etcd connect: %w", err)
	}
	return &EtcdStore{client: client}, nil
}

func (s *EtcdStore) Get(ctx context.Context, key string) ([]byte, error) {
	resp, err := s.client.Get(ctx, key)
	if err != nil {
		return nil, fmt.Errorf("etcd get: %w", err)
	}
	if len(resp.Kvs) == 0 {
		return nil, ErrKeyNotFound
	}
	return resp.Kvs[0].Value, nil
}

func (s *EtcdStore) GetPrefix(ctx context.Context, prefix string) (map[string][]byte, error) {
	resp, err := s.client.Get(ctx, prefix, clientv3.WithPrefix())
	if err != nil {
		return nil, fmt.Errorf("etcd get prefix: %w", err)
	}
	result := make(map[string][]byte, len(resp.Kvs))
	for _, kv := range resp.Kvs {
		result[string(kv.Key)] = kv.Value
	}
	return result, nil
}

func (s *EtcdStore) Put(ctx context.Context, key string, value []byte) error {
	_, err := s.client.Put(ctx, key, string(value))
	if err != nil {
		return fmt.Errorf("etcd put: %w", err)
	}
	return nil
}

func (s *EtcdStore) PutWithLease(ctx context.Context, key string, value []byte, leaseID int64) error {
	_, err := s.client.Put(ctx, key, string(value), clientv3.WithLease(clientv3.LeaseID(leaseID)))
	if err != nil {
		return fmt.Errorf("etcd put with lease: %w", err)
	}
	return nil
}

func (s *EtcdStore) Delete(ctx context.Context, key string) error {
	_, err := s.client.Delete(ctx, key)
	if err != nil {
		return fmt.Errorf("etcd delete: %w", err)
	}
	return nil
}

func (s *EtcdStore) Watch(ctx context.Context, prefix string) (<-chan WatchEvent, error) {
	ch := make(chan WatchEvent, 64)
	wch := s.client.Watch(ctx, prefix, clientv3.WithPrefix())

	go func() {
		defer close(ch)
		for resp := range wch {
			for _, ev := range resp.Events {
				var evType EventType
				switch ev.Type {
				case clientv3.EventTypePut:
					evType = EventPut
				case clientv3.EventTypeDelete:
					evType = EventDelete
				}
				ch <- WatchEvent{
					Type:  evType,
					Key:   string(ev.Kv.Key),
					Value: ev.Kv.Value,
				}
			}
		}
	}()

	return ch, nil
}

func (s *EtcdStore) GrantLease(ctx context.Context, ttlSeconds int64) (int64, error) {
	resp, err := s.client.Grant(ctx, ttlSeconds)
	if err != nil {
		return 0, fmt.Errorf("etcd grant lease: %w", err)
	}
	return int64(resp.ID), nil
}

func (s *EtcdStore) KeepAliveLease(ctx context.Context, leaseID int64) (<-chan struct{}, error) {
	kaCh, err := s.client.KeepAlive(ctx, clientv3.LeaseID(leaseID))
	if err != nil {
		return nil, fmt.Errorf("etcd keepalive: %w", err)
	}

	doneCh := make(chan struct{})
	go func() {
		defer close(doneCh)
		for range kaCh {
			// Consume keepalive responses; channel closes on failure
		}
	}()

	return doneCh, nil
}

func (s *EtcdStore) RevokeLease(ctx context.Context, leaseID int64) error {
	_, err := s.client.Revoke(ctx, clientv3.LeaseID(leaseID))
	if err != nil {
		return fmt.Errorf("etcd revoke lease: %w", err)
	}
	return nil
}

func (s *EtcdStore) CAS(ctx context.Context, key string, expected []byte, value []byte, leaseID int64) (bool, error) {
	var cmp clientv3.Cmp
	if expected == nil {
		// Key must not exist (create revision == 0)
		cmp = clientv3.Compare(clientv3.CreateRevision(key), "=", 0)
	} else {
		cmp = clientv3.Compare(clientv3.Value(key), "=", string(expected))
	}

	putOpt := clientv3.OpPut(key, string(value), clientv3.WithLease(clientv3.LeaseID(leaseID)))
	resp, err := s.client.Txn(ctx).If(cmp).Then(putOpt).Commit()
	if err != nil {
		return false, fmt.Errorf("etcd txn: %w", err)
	}
	return resp.Succeeded, nil
}

func (s *EtcdStore) Close() error {
	return s.client.Close()
}
