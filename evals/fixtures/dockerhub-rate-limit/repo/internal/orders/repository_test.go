package orders

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

func newTestRepo(t *testing.T) *Repository {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set")
	}
	pool, err := pgxpool.New(context.Background(), url)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	_, err = pool.Exec(context.Background(), "TRUNCATE orders RESTART IDENTITY")
	require.NoError(t, err)
	return NewRepository(pool)
}

func TestListByCustomerPaginates(t *testing.T) {
	repo := newTestRepo(t)
	ctx := context.Background()
	base := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	for i := range 5 {
		_, err := repo.db.Exec(ctx,
			`INSERT INTO orders (customer_id, total_cents, currency, created_at) VALUES ('c-1', $1, 'EUR', $2)`,
			1000+i, base.Add(time.Duration(i)*time.Hour))
		require.NoError(t, err)
	}

	first, err := repo.ListByCustomer(ctx, "c-1", nil, 2)
	require.NoError(t, err)
	require.Len(t, first, 2)
	require.Equal(t, int64(5), first[0].ID)

	cursor, err := DecodeCursor(NextCursor(first, 2))
	require.NoError(t, err)
	second, err := repo.ListByCustomer(ctx, "c-1", cursor, 2)
	require.NoError(t, err)
	require.Equal(t, []int64{3, 2}, []int64{second[0].ID, second[1].ID})
}
