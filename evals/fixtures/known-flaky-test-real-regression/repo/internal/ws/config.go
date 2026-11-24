package ws

import (
	"os"
	"strconv"
	"time"
)

// Config controls how a Client connects to the upstream hub.
type Config struct {
	URL           string
	ReconnectBase time.Duration
	ReconnectMax  time.Duration
	PingInterval  time.Duration
}

// DefaultConfig returns the settings used in production. The reconnect backoff can be tuned
// per deployment with WS_RECONNECT_BASE_MS and WS_RECONNECT_MAX_MS.
func DefaultConfig(url string) Config {
	return Config{
		URL:           url,
		ReconnectBase: envDuration("WS_RECONNECT_BASE_MS", 250, time.Second),
		ReconnectMax:  envDuration("WS_RECONNECT_MAX_MS", 30_000, time.Millisecond),
		PingInterval:  20 * time.Second,
	}
}

// envDuration reads a positive integer from the environment (def when unset or invalid) and
// scales it by unit.
func envDuration(key string, def int64, unit time.Duration) time.Duration {
	n := def
	if raw, ok := os.LookupEnv(key); ok {
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil && parsed > 0 {
			n = parsed
		}
	}
	return time.Duration(n) * unit
}
