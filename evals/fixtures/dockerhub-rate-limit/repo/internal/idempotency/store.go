// Package idempotency remembers responses to POST requests carrying an Idempotency-Key.
package idempotency

import (
	"context"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

type Store struct {
	rdb *redis.Client
	ttl time.Duration
}

func NewStore(rdb *redis.Client, ttl time.Duration) *Store { return &Store{rdb: rdb, ttl: ttl} }

// Get returns the stored response body, or nil if the key has not been seen.
func (s *Store) Get(ctx context.Context, key string) ([]byte, error) {
	b, err := s.rdb.Get(ctx, "idem:"+key).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, nil
	}
	return b, err
}

func (s *Store) Put(ctx context.Context, key string, body []byte) error {
	return s.rdb.SetNX(ctx, "idem:"+key, body, s.ttl).Err()
}
