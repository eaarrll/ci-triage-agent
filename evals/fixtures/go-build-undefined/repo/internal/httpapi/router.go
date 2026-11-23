// Package httpapi exposes the inventory service over HTTP.
package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/example-org/inventory-svc/internal/inventory"
)

type reserveRequest struct {
	OrderID  string `json:"order_id"`
	SKU      string `json:"sku"`
	Quantity int    `json:"quantity"`
}

// NewRouter wires the HTTP routes.
func NewRouter(svc *inventory.Service, logger *slog.Logger) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.Recoverer)
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	r.Handle("/metrics", promhttp.Handler())
	r.Post("/reservations", func(w http.ResponseWriter, req *http.Request) {
		var body reserveRequest
		if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		res, err := svc.Reserve(req.Context(), body.OrderID, body.SKU, body.Quantity)
		switch {
		case errors.Is(err, inventory.ErrInsufficientStock):
			http.Error(w, err.Error(), http.StatusConflict)
			return
		case err != nil:
			logger.Error("reserve", "err", err, "order_id", body.OrderID)
			http.Error(w, "reservation failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(res)
	})
	return r
}
