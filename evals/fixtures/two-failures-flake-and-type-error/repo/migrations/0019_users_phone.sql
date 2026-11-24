alter table users add column phone text unique;
alter table users alter column email drop not null;
alter table users add constraint users_email_or_phone check (email is not null or phone is not null);
