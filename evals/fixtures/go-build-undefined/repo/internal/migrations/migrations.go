// Package migrations applies the embedded SQL migrations in order.
package migrations

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"

	"github.com/jackc/pgx/v5"
)

//go:embed sql/*.sql
var files embed.FS

// Up applies every migration that has not run yet and returns how many it applied.
func Up(ctx context.Context, conn *pgx.Conn) (int, error) {
	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)`); err != nil {
		return 0, err
	}
	names, err := fs.Glob(files, "sql/*.sql")
	if err != nil {
		return 0, err
	}
	sort.Strings(names)
	applied := 0
	for _, name := range names {
		tag, err := conn.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`, name)
		if err != nil {
			return applied, err
		}
		if tag.RowsAffected() == 0 {
			continue
		}
		body, err := files.ReadFile(name)
		if err != nil {
			return applied, err
		}
		if _, err := conn.Exec(ctx, string(body)); err != nil {
			return applied, fmt.Errorf("%s: %w", name, err)
		}
		applied++
	}
	return applied, nil
}
