create table plans (
  id text primary key,
  price_cents integer not null check (price_cents >= 0)
);
