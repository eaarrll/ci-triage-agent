create table if not exists stock (
  sku text not null,
  warehouse text not null,
  on_hand integer not null check (on_hand >= 0),
  primary key (sku, warehouse)
);
