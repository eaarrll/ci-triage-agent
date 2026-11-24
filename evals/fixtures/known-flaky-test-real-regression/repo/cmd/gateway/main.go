package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"

	"github.com/example-org/realtime-gateway/internal/ws"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	c := ws.NewClient(ws.DefaultConfig(os.Getenv("HUB_URL")))
	slog.Info("connecting to hub", "url", os.Getenv("HUB_URL"))
	c.Run(ctx)
}
