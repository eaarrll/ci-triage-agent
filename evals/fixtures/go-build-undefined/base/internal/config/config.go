// Package config loads the inventory service configuration.
package config

import (
	"errors"
	"fmt"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

// Config is the runtime configuration of the inventory service.
type Config struct {
	HTTPAddr        string            `yaml:"http_addr"`
	DatabaseURL     string            `yaml:"database_url"`
	ShutdownTimeout time.Duration     `yaml:"shutdown_timeout"`
	Reservation     ReservationConfig `yaml:"reservation"`
}

// ReservationConfig controls how long stock stays held for an unpaid order.
type ReservationConfig struct {
	TTL         time.Duration `yaml:"ttl"`
	MaxPerOrder int           `yaml:"max_per_order"`
}

func defaults() Config {
	return Config{
		HTTPAddr:        ":8080",
		ShutdownTimeout: 15 * time.Second,
		Reservation:     ReservationConfig{TTL: 15 * time.Minute, MaxPerOrder: 50},
	}
}

// ParseConfig reads and validates the YAML file at path.
func ParseConfig(path string) (*Config, error) {
	cfg := defaults()
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func (c Config) validate() error {
	var errs []error
	if c.DatabaseURL == "" {
		errs = append(errs, errors.New("database_url is required"))
	}
	if c.Reservation.TTL <= 0 {
		errs = append(errs, errors.New("reservation.ttl must be positive"))
	}
	if c.Reservation.MaxPerOrder <= 0 {
		errs = append(errs, errors.New("reservation.max_per_order must be positive"))
	}
	return errors.Join(errs...)
}
