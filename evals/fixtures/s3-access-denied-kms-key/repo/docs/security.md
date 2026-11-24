# Security notes

- SEC-112: customer-facing buckets use a customer-managed KMS key with rotation enabled.
- Deploy roles are assumed through GitHub OIDC and are limited to `main`.
