-- Parent sign-in PIN, like teachers: SMS code the first time on a phone (and set a PIN), then the
-- PIN only on that phone. A parent can have children in several schools, so the PIN belongs to
-- the account, not to one school. Only a BCrypt hash is stored.
alter table user_accounts add column if not exists pin_hash varchar(100);
alter table user_accounts add column if not exists pin_failed_attempts integer not null default 0;
alter table user_accounts add column if not exists pin_updated_at bigint;

-- A trusted device is for a teacher or for a parent.
alter table trusted_devices add column if not exists kind varchar(16) not null default 'TEACHER';
