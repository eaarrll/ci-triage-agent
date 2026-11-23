// Package inventory reserves stock for orders.
package inventory

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// ErrInsufficientStock is returned when a reservation asks for more than is available.
var ErrInsufficientStock = errors.New("insufficient stock")

// Reservation holds stock for an order until it is paid or expires.
type Reservation struct {
	OrderID   string
	SKU       string
	Quantity  int
	ExpiresAt time.Time
}

// Store persists stock levels and reservations.
type Store interface {
	Available(ctx context.Context, sku string) (int, error)
	Reserve(ctx context.Context, r Reservation) error
}

// Service applies the reservation rules on top of a Store.
type Service struct {
	store       Store
	ttl         time.Duration
	maxPerOrder int
	now         func() time.Time
}

// NewService returns a Service that holds stock for ttl and caps each order at maxPerOrder units.
func NewService(store Store, ttl time.Duration, maxPerOrder int) *Service {
	return &Service{store: store, ttl: ttl, maxPerOrder: maxPerOrder, now: time.Now}
}

// Reserve holds qty units of sku for orderID.
func (s *Service) Reserve(ctx context.Context, orderID, sku string, qty int) (Reservation, error) {
	if qty <= 0 || qty > s.maxPerOrder {
		return Reservation{}, fmt.Errorf("quantity %d outside 1..%d", qty, s.maxPerOrder)
	}
	available, err := s.store.Available(ctx, sku)
	if err != nil {
		return Reservation{}, fmt.Errorf("available %s: %w", sku, err)
	}
	if available < qty {
		return Reservation{}, fmt.Errorf("%s: want %d, have %d: %w", sku, qty, available, ErrInsufficientStock)
	}
	r := Reservation{OrderID: orderID, SKU: sku, Quantity: qty, ExpiresAt: s.now().Add(s.ttl)}
	if err := s.store.Reserve(ctx, r); err != nil {
		return Reservation{}, fmt.Errorf("reserve %s: %w", sku, err)
	}
	return r, nil
}
