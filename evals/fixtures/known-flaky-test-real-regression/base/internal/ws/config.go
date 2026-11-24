package ws

import "time"

// Config controls how a Client connects to the upstream hub.
type Config struct {
	URL           string
	ReconnectBase time.Duration
	ReconnectMax  time.Duration
	PingInterval  time.Duration
}

// DefaultConfig returns the settings used in production.
func DefaultConfig(url string) Config {
	return Config{
		URL:           url,
		ReconnectBase: 250 * time.Millisecond,
		ReconnectMax:  30 * time.Second,
		PingInterval:  20 * time.Second,
	}
}
