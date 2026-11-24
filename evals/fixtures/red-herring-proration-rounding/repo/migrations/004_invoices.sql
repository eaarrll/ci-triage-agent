create table invoice_lines (
  id bigserial primary key,
  subscription_id text not null references subscriptions (id),
  description text not null,
  amount_cents integer not null
);
