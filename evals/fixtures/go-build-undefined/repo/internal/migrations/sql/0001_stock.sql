CREATE TABLE stock (
    sku     text PRIMARY KEY,
    on_hand integer NOT NULL CHECK (on_hand >= 0)
);
