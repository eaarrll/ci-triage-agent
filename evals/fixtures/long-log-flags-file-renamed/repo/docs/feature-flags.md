# Feature flags

| Flag | Gates |
| --- | --- |
| `checkout_v2` | `POST /v2/checkout` and `GET /v2/checkout/{id}` |
| `promo_stacking` | applying more than one promotion to a cart |
| `saved_carts` | `/v1/carts/saved` |
| `gift_cards` | `/v1/gift-cards` and gift card tenders at checkout |

Files: `config/feature-flags.yaml` (production defaults) and `config/feature-flags.test.yaml` (integration tests).
