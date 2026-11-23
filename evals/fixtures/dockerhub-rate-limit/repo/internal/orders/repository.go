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

// ListByCustomer returns up to limit orders, newest first, strictly after the cursor when one is given.
func (r *Repository) ListByCustomer(ctx context.Context, customerID string, after *Cursor, limit int) ([]Order, error) {
	where := "customer_id = $1"
	args := []any{customerID, limit}
	if after != nil {
		where += " AND (created_at, id) < ($3, $4)"
		args = append(args, after.CreatedAt, after.ID)
	}
	rows, err := r.db.Query(ctx, `
		SELECT id, customer_id, status, total_cents, currency, created_at
		FROM orders
		WHERE `+where+`
		ORDER BY created_at DESC, id DESC
		LIMIT $2`, args...)
	if err != nil {
		return nil, fmt.Errorf("list orders: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Order])
}
