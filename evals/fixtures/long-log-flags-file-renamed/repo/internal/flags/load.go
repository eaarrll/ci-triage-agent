package flags

import (
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"

	"gopkg.in/yaml.v3"
)

// DefaultPath is used when FEATURE_FLAGS_FILE is not set.
const DefaultPath = "config/feature-flags.yaml"

// Set is an immutable set of feature flags.
type Set struct {
	enabled map[string]bool
}

// Load reads the flag file named by FEATURE_FLAGS_FILE, or DefaultPath. A missing file is not an
// error: every flag is off, which is the safe default for production.
func Load(logger *slog.Logger) (*Set, error) {
	path := os.Getenv("FEATURE_FLAGS_FILE")
	if path == "" {
		path = DefaultPath
	}
	raw, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		logger.Warn("feature flags file not found; every flag defaults to off", "path", path)
		return &Set{enabled: map[string]bool{}}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read feature flags: %w", err)
	}
	enabled := map[string]bool{}
	if err := yaml.Unmarshal(raw, &enabled); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	logger.Info("feature flags loaded", "path", path, "enabled", countTrue(enabled))
	return &Set{enabled: enabled}, nil
}

// Enabled reports whether a flag is on.
func (s *Set) Enabled(name string) bool {
	return s.enabled[name]
}

func countTrue(m map[string]bool) int {
	n := 0
	for _, v := range m {
		if v {
			n++
		}
	}
	return n
}
