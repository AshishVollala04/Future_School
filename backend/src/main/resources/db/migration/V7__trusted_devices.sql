-- Teacher PIN sign-in on a trusted device: the SMS code is needed only the first time on a
-- device, on a new device, or to reset a forgotten PIN. Only a SHA-256 hash of the device
-- token is stored. Nothing is deleted: devices are revoked.
create table if not exists trusted_devices (
    id varchar(64) not null,
    token_hash varchar(64) not null,
    account_id varchar(64) not null,
    membership_id varchar(64) not null,
    label varchar(120),
    created_at bigint not null,
    last_used_at bigint,
    expires_at bigint not null,
    revoked boolean not null,
    primary key (id)
);
create unique index if not exists uk_trusted_device_token on trusted_devices (token_hash);
create index if not exists idx_trusted_device_account on trusted_devices (account_id);
