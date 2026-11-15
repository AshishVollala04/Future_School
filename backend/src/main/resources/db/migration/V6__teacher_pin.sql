-- Teacher sign-in PIN (optional, 4 digits, asked after the SMS OTP).
-- Only a BCrypt hash is stored, never the PIN. 5 wrong PINs lock it until the school Admin resets it.
alter table school_memberships add column if not exists pin_hash varchar(100);
alter table school_memberships add column if not exists pin_failed_attempts integer not null default 0;
alter table school_memberships add column if not exists pin_updated_at bigint;
