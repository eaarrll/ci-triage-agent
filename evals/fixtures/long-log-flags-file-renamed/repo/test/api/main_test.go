//go:build integration

package api_test

import (
	"log/slog"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/example-org/checkout-svc/internal/api"
	"github.com/example-org/checkout-svc/internal/flags"
	"github.com/example-org/checkout-svc/internal/store"
)

var server *httptest.Server

func TestMain(m *testing.M) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	f, err := flags.Load(logger)
	if err != nil {
		logger.Error("load flags", "err", err)
		os.Exit(1)
	}
	db := store.MustOpen(os.Getenv("DATABASE_URL"))
	server = httptest.NewServer(api.NewRouter(api.NewHandlers(db), f, logger))
	code := m.Run()
	server.Close()
	os.Exit(code)
}
