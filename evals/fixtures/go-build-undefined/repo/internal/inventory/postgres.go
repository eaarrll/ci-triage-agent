package inventory

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type postgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore returns a Store backed by the stock and reservations tables.
func NewPostgresStore(pool *pgxpool.Pool) Store {
	return &postgresStore{pool: pool}
}

func (p *postgresStore) Available(ctx context.Context, sku string) (int, error) {
	var n int
	err := p.pool.QueryRow(ctx, `
		SELECT s.on_hand - COALESCE(SUM(r.quantity) FILTER (WHERE r.expires_at > now()), 0)
		FROM stock s LEFT JOIN reservations r ON r.sku = s.sku
		WHERE s.sku = $1
		GROUP BY s.on_hand`, sku).Scan(&n)
	return n, err
}

func (p *postgresStore) Reserve(ctx context.Context, r Reservation) error {
	_, err := p.pool.Exec(ctx,
		`INSERT INTO reservations (order_id, sku, quantity, expires_at) VALUES ($1, $2, $3, $4)`,
		r.OrderID, r.SKU, r.Quantity, r.ExpiresAt)
	return err
}
