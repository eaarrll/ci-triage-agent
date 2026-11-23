package orders

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Order struct {
	ID         int64     `json:"id"`
	CustomerID string    `json:"customer_id"`
	Status     string    `json:"status"`
	TotalCents int64     `json:"total_cents"`
	Currency   string    `json:"currency"`
	CreatedAt  time.Time `json:"created_at"`
}

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) ListByCustomer(ctx context.Context, customerID string, limit int) ([]Order, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, customer_id, status, total_cents, currency, created_at
		FROM orders
		WHERE customer_id = $1
		ORDER BY created_at DESC, id DESC
		LIMIT $2`, customerID, limit)
	if err != nil {
		return nil, fmt.Errorf("list orders: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Order])
}
