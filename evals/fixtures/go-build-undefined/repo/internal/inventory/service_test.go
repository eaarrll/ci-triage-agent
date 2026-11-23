package inventory

import (
	"context"
	"errors"
	"testing"
	"time"
)

type fakeStore struct {
	available int
	reserved  []Reservation
}

func (f *fakeStore) Available(context.Context, string) (int, error) { return f.available, nil }

func (f *fakeStore) Reserve(_ context.Context, r Reservation) error {
	f.reserved = append(f.reserved, r)
	return nil
}

func TestReserveSetsExpiry(t *testing.T) {
	store := &fakeStore{available: 10}
	svc := NewService(store, 15*time.Minute, 50)
	svc.now = func() time.Time { return time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC) }

	r, err := svc.Reserve(context.Background(), "ord_1", "TEE-BLK-M", 2)
	if err != nil {
		t.Fatal(err)
	}
	if want := time.Date(2026, 1, 1, 12, 15, 0, 0, time.UTC); !r.ExpiresAt.Equal(want) {
		t.Fatalf("ExpiresAt = %v, want %v", r.ExpiresAt, want)
	}
}

func TestReserveInsufficientStock(t *testing.T) {
	svc := NewService(&fakeStore{available: 1}, time.Minute, 50)
	if _, err := svc.Reserve(context.Background(), "ord_2", "MUG-12OZ", 3); !errors.Is(err, ErrInsufficientStock) {
		t.Fatalf("err = %v, want ErrInsufficientStock", err)
	}
}
