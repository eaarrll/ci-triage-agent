package orders

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCursorRoundTrip(t *testing.T) {
	in := Cursor{CreatedAt: time.Date(2026, 11, 3, 14, 5, 0, 123000, time.UTC), ID: 4812}
	out, err := DecodeCursor(in.Encode())
	require.NoError(t, err)
	assert.True(t, in.CreatedAt.Equal(out.CreatedAt))
	assert.Equal(t, in.ID, out.ID)
}

func TestDecodeCursorRejectsGarbage(t *testing.T) {
	for _, s := range []string{"%%%", "e30", "eyJpIjowfQ"} {
		_, err := DecodeCursor(s)
		assert.ErrorIs(t, err, ErrInvalidCursor, s)
	}
}

func TestNextCursor(t *testing.T) {
	page := []Order{{ID: 3, CreatedAt: time.Unix(300, 0)}, {ID: 2, CreatedAt: time.Unix(200, 0)}}
	assert.Empty(t, NextCursor(page, 3))
	next, err := DecodeCursor(NextCursor(page, 2))
	require.NoError(t, err)
	assert.Equal(t, int64(2), next.ID)
}
