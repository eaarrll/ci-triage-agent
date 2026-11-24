# checkout-svc

Carts, promotions and checkout for the Acme storefront.

## Feature flags

Flags live in `config/flags.yaml`; set `FEATURE_FLAGS_FILE` to load another file (CI uses
`config/flags.test.yaml`). A missing file turns every flag off.
