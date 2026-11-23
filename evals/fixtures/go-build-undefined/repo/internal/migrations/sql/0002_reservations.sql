CREATE TABLE reservations (
    order_id   text        NOT NULL,
    sku        text        NOT NULL REFERENCES stock (sku),
    quantity   integer     NOT NULL CHECK (quantity > 0),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (order_id, sku)
);

CREATE INDEX reservations_sku_expires_at ON reservations (sku, expires_at);
