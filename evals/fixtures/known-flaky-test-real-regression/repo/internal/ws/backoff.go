package ws

import "time"

// Backoff computes capped exponential reconnect delays.
type Backoff struct {
	Base time.Duration
	Max  time.Duration
}

// Delay returns the wait before reconnect attempt n (0-based): Base * 2^n, capped at Max.
func (b Backoff) Delay(attempt int) time.Duration {
	d := b.Base
	for i := 0; i < attempt && d < b.Max; i++ {
		d *= 2
	}
	if d > b.Max {
		return b.Max
	}
	return d
}
