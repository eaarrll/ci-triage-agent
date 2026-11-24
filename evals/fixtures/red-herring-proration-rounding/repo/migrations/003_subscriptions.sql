create table subscriptions (
  id text primary key,
  customer_id text not null references customers (id),
  plan_id text not null references plans (id),
  period_start timestamptz not null,
  period_end timestamptz not null
);
