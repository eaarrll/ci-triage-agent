package api

import (
	"log/slog"
	"net/http"

	"github.com/example-org/checkout-svc/internal/flags"
)

// NewRouter wires every route. Flag-gated routes are only registered when their flag is on, so a
// disabled feature answers 404 exactly as if it did not exist.
func NewRouter(h *Handlers, f *flags.Set, logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", h.Health)
	mux.HandleFunc("POST /v1/carts", h.CreateCart)
	mux.HandleFunc("GET /v1/carts/{id}", h.GetCart)
	mux.HandleFunc("POST /v1/carts/{id}/items", h.AddItem)
	mux.HandleFunc("POST /v1/checkout", h.Checkout)
	mux.HandleFunc("GET /v1/orders/{id}", h.GetOrder)

	if f.Enabled("checkout_v2") {
		mux.HandleFunc("POST /v2/checkout", h.CheckoutV2)
		mux.HandleFunc("GET /v2/checkout/{id}", h.GetCheckoutV2)
	}
	if f.Enabled("saved_carts") {
		mux.HandleFunc("GET /v1/carts/saved", h.ListSavedCarts)
		mux.HandleFunc("POST /v1/carts/{id}/save", h.SaveCart)
	}
	if f.Enabled("gift_cards") {
		mux.HandleFunc("POST /v1/gift-cards", h.IssueGiftCard)
		mux.HandleFunc("GET /v1/gift-cards/{code}", h.GetGiftCard)
	}
	return withRequestLog(mux, logger)
}
