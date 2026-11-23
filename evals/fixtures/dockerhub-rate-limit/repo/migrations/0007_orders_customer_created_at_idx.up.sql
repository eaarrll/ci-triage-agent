CREATE INDEX IF NOT EXISTS orders_customer_created_at_id_idx
    ON orders (customer_id, created_at DESC, id DESC);
