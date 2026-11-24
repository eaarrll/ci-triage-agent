create table customers (
  id text primary key,
  email text not null,
  created_at timestamptz not null default now()
);
