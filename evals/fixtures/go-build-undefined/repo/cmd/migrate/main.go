package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"

	"github.com/example-org/inventory-svc/internal/config"
	"github.com/example-org/inventory-svc/internal/migrations"
)

func main() {
	configPath := flag.String("config", "config.yaml", "path to the service config file")
	flag.Parse()

	cfg, err := config.LoadConfig(*configPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "migrate:", err)
		os.Exit(1)
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, "migrate: connect:", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	applied, err := migrations.Up(ctx, conn)
	if err != nil {
		fmt.Fprintln(os.Stderr, "migrate:", err)
		os.Exit(1)
	}
	fmt.Printf("migrate: applied %d migration(s)\n", applied)
}
