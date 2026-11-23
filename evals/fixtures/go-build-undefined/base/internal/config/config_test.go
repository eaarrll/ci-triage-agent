package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

const minimal = "database_url: postgres://inventory@localhost:5432/inventory?sslmode=disable\n"

func writeConfig(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestParseConfigDefaults(t *testing.T) {
	cfg, err := ParseConfig(writeConfig(t, minimal))
	if err != nil {
		t.Fatalf("ParseConfig: %v", err)
	}
	if cfg.HTTPAddr != ":8080" || cfg.Reservation.TTL != 15*time.Minute || cfg.Reservation.MaxPerOrder != 50 {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
}

func TestParseConfigRequiresDatabaseURL(t *testing.T) {
	if _, err := ParseConfig(writeConfig(t, "http_addr: :9090\n")); err == nil {
		t.Fatal("expected an error without database_url")
	}
}
