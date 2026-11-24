package ws

import (
	"testing"
	"time"
)

func TestBackoffDelay(t *testing.T) {
	b := Backoff{Base: 250 * time.Millisecond, Max: 30 * time.Second}
	want := []time.Duration{250 * time.Millisecond, 500 * time.Millisecond, time.Second, 2 * time.Second}
	for attempt, w := range want {
		if got := b.Delay(attempt); got != w {
			t.Errorf("Delay(%d) = %s, want %s", attempt, got, w)
		}
	}
	if got := b.Delay(20); got != 30*time.Second {
		t.Errorf("Delay(20) = %s, want the 30s cap", got)
	}
}
