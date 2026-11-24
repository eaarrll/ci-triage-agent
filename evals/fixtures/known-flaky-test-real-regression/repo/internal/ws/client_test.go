package ws

import (
	"context"
	"testing"
	"time"

	"github.com/example-org/realtime-gateway/internal/hub/hubtest"
)

func TestClientConnects(t *testing.T) {
	srv := hubtest.New(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	c := NewClient(DefaultConfig(srv.URL()))
	go c.Run(ctx)
	srv.WaitForConnections(t, 1, time.Second)
}

// TestClientReconnect drops the server side of the connection and expects the client to come
// back on its first backoff step (250ms with the default config).
//
// Known flaky on loaded CI runners: see docs/flaky-tests.md (#188).
func TestClientReconnect(t *testing.T) {
	srv := hubtest.New(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	c := NewClient(DefaultConfig(srv.URL()))
	go c.Run(ctx)
	srv.WaitForConnections(t, 1, time.Second)

	n := srv.DropAll()
	t.Logf("server dropped %d connection(s)", n)

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if srv.Connections() == 1 && c.State() == StateConnected {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("client did not reconnect within 2s (state=%s, next attempt in %s)", c.State(), c.NextAttempt().Round(time.Second))
}
