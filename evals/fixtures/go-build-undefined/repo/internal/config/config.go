// Package config loads the inventory service configuration.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
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

// LoadConfig reads the YAML file at path, applies INVENTORY_* environment
// overrides and validates the result.
func LoadConfig(path string) (*Config, error) {
	cfg := defaults()
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}
	if err := applyEnv(&cfg, os.LookupEnv); err != nil {
		return nil, err
	}
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func applyEnv(cfg *Config, lookup func(string) (string, bool)) error {
	if v, ok := lookup("INVENTORY_HTTP_ADDR"); ok {
		cfg.HTTPAddr = v
	}
	if v, ok := lookup("INVENTORY_DATABASE_URL"); ok {
		cfg.DatabaseURL = v
	}
	if v, ok := lookup("INVENTORY_RESERVATION_TTL"); ok {
		ttl, err := time.ParseDuration(v)
		if err != nil {
			return fmt.Errorf("INVENTORY_RESERVATION_TTL: %w", err)
		}
		cfg.Reservation.TTL = ttl
	}
	if v, ok := lookup("INVENTORY_RESERVATION_MAX_PER_ORDER"); ok {
		n, err := strconv.Atoi(v)
		if err != nil {
			return fmt.Errorf("INVENTORY_RESERVATION_MAX_PER_ORDER: %w", err)
		}
		cfg.Reservation.MaxPerOrder = n
	}
	return nil
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
