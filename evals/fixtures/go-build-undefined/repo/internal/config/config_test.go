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

func TestLoadConfigDefaults(t *testing.T) {
	cfg, err := LoadConfig(writeConfig(t, minimal))
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.HTTPAddr != ":8080" || cfg.Reservation.TTL != 15*time.Minute || cfg.Reservation.MaxPerOrder != 50 {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
}

func TestLoadConfigEnvOverrides(t *testing.T) {
	t.Setenv("INVENTORY_RESERVATION_TTL", "2m")
	t.Setenv("INVENTORY_RESERVATION_MAX_PER_ORDER", "5")

	cfg, err := LoadConfig(writeConfig(t, minimal))
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.Reservation.TTL != 2*time.Minute || cfg.Reservation.MaxPerOrder != 5 {
		t.Fatalf("overrides not applied: %+v", cfg.Reservation)
	}
}

func TestLoadConfigRejectsBadOverride(t *testing.T) {
	t.Setenv("INVENTORY_RESERVATION_TTL", "soon")

	if _, err := LoadConfig(writeConfig(t, minimal)); err == nil {
		t.Fatal("expected an error for an unparsable TTL")
	}
}

func TestLoadConfigRequiresDatabaseURL(t *testing.T) {
	if _, err := LoadConfig(writeConfig(t, "http_addr: :9090\n")); err == nil {
		t.Fatal("expected an error without database_url")
	}
}
