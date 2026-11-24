package ws

import (
	"context"
	"sync"
	"time"

	"github.com/coder/websocket"
)

type State string

const (
	StateConnecting State = "connecting"
	StateConnected  State = "connected"
	StateBackoff    State = "backoff"
	StateClosed     State = "closed"
)

// Client keeps one websocket connection to the hub open, reconnecting with backoff.
type Client struct {
	cfg     Config
	backoff Backoff

	mu          sync.Mutex
	state       State
	nextAttempt time.Time
	conn        *websocket.Conn
}

func NewClient(cfg Config) *Client {
	return &Client{cfg: cfg, backoff: Backoff{Base: cfg.ReconnectBase, Max: cfg.ReconnectMax}, state: StateConnecting}
}

// Run connects and reconnects until ctx is cancelled.
func (c *Client) Run(ctx context.Context) {
	for attempt := 0; ctx.Err() == nil; {
		conn, _, err := websocket.Dial(ctx, c.cfg.URL, nil)
		if err == nil {
			attempt = 0
			c.setConnected(conn)
			c.readUntilClosed(ctx, conn)
		}
		if ctx.Err() != nil {
			break
		}
		delay := c.backoff.Delay(attempt)
		attempt++
		c.setBackoff(delay)
		select {
		case <-ctx.Done():
		case <-time.After(delay):
		}
	}
	c.setState(StateClosed)
}

func (c *Client) readUntilClosed(ctx context.Context, conn *websocket.Conn) {
	for {
		if _, _, err := conn.Read(ctx); err != nil {
			return
		}
	}
}

func (c *Client) setConnected(conn *websocket.Conn) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.conn, c.state = conn, StateConnected
}

func (c *Client) setBackoff(delay time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.state, c.nextAttempt = StateBackoff, time.Now().Add(delay)
}

func (c *Client) setState(s State) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.state = s
}

// State reports the connection state.
func (c *Client) State() State {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.state
}

// NextAttempt is the time left until the next reconnect attempt while in backoff.
func (c *Client) NextAttempt() time.Duration {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.state != StateBackoff {
		return 0
	}
	return time.Until(c.nextAttempt)
}
