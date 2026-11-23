package orders

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"time"
)

var ErrInvalidCursor = errors.New("invalid cursor")

// Cursor is the keyset position of the last order on a page.
type Cursor struct {
	CreatedAt time.Time `json:"t"`
	ID        int64     `json:"i"`
}

func (c Cursor) Encode() string {
	b, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(b)
}

// DecodeCursor parses an opaque cursor; an empty string means "first page".
func DecodeCursor(s string) (*Cursor, error) {
	if s == "" {
		return nil, nil
	}
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, ErrInvalidCursor
	}
	var c Cursor
	if err := json.Unmarshal(b, &c); err != nil || c.ID <= 0 || c.CreatedAt.IsZero() {
		return nil, ErrInvalidCursor
	}
	return &c, nil
}

// NextCursor returns the cursor for the page after this one, or "" when this is the last page.
func NextCursor(page []Order, limit int) string {
	if len(page) < limit {
		return ""
	}
	last := page[len(page)-1]
	return Cursor{CreatedAt: last.CreatedAt, ID: last.ID}.Encode()
}
