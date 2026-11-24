package ws

import (
	"testing"
	"time"
)

func TestDefaultConfigReadsMaxFromEnv(t *testing.T) {
	t.Setenv("WS_RECONNECT_MAX_MS", "5000")
	if got := DefaultConfig("ws://hub").ReconnectMax; got != 5*time.Second {
		t.Fatalf("ReconnectMax = %s, want 5s", got)
	}
}

func TestDefaultConfigIgnoresInvalidValues(t *testing.T) {
	t.Setenv("WS_RECONNECT_MAX_MS", "soon")
	if got := DefaultConfig("ws://hub").ReconnectMax; got != 30*time.Second {
		t.Fatalf("ReconnectMax = %s, want 30s", got)
	}
}
