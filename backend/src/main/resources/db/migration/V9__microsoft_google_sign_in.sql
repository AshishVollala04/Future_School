-- Microsoft / Google sign-in for Principal and Admin (OIDC code flow with PKCE).
-- Links are by the provider's permanent subject, never by the email text.
create table if not exists identity_links (
    id varchar(64) not null,
    provider varchar(16) not null,
    subject varchar(200) not null,
    account_id varchar(64) not null,
    email varchar(200),
    created_at bigint not null,
    primary key (id)
);
create unique index if not exists uk_identity_link_subject on identity_links (provider, subject);
create index if not exists idx_identity_link_account on identity_links (account_id);

-- Sign-ins in progress: single use, 10 minutes.
create table if not exists idp_login_states (
    state varchar(64) not null,
    provider varchar(16) not null,
    nonce varchar(64) not null,
    code_verifier varchar(128) not null,
    invite_token varchar(64),
    expires_at bigint not null,
    used boolean not null,
    primary key (state)
);

-- A first factor from Microsoft/Google that will link the identity once the email code is entered.
alter table auth_tickets add column if not exists pending_idp_provider varchar(16);
alter table auth_tickets add column if not exists pending_idp_subject varchar(200);
alter table auth_tickets add column if not exists pending_idp_email varchar(200);
