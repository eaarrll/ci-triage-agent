CREATE TABLE IF NOT EXISTS orders (
    id           BIGSERIAL PRIMARY KEY,
    customer_id  TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'pending',
    total_cents  BIGINT      NOT NULL CHECK (total_cents >= 0),
    currency     CHAR(3)     NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders (customer_id);
