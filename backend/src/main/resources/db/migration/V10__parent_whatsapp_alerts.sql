-- WhatsApp alerts to parents: an outbox of alerts, per-school settings, and parent opt-outs.
create table if not exists parent_alerts (
    id varchar(64) not null,
    school_id varchar(64) not null,
    kind varchar(24) not null,
    student_id varchar(64) not null,
    student_name varchar(128) not null,
    recipient_mobile varchar(16),
    channel varchar(16) not null,
    params_json varchar(1000) not null,
    preview varchar(1000) not null,
    status varchar(16) not null,
    attempts integer not null,
    not_before bigint not null,
    provider_ref varchar(128),
    error varchar(300),
    dedupe_key varchar(200) not null,
    created_by varchar(64) not null,
    created_at varchar(40) not null,
    sent_at varchar(40),
    primary key (id)
);
create unique index if not exists uk_alert_school_dedupe on parent_alerts (school_id, dedupe_key);
create index if not exists idx_alert_status on parent_alerts (status, not_before);

create table if not exists alert_settings (
    id varchar(80) not null,
    school_id varchar(64) not null,
    absence_alerts boolean not null,
    fee_reminders boolean not null,
    updated_by varchar(64),
    updated_at varchar(40),
    primary key (id)
);

create table if not exists alert_opt_outs (
    id varchar(80) not null,
    school_id varchar(64) not null,
    account_id varchar(64) not null,
    created_at varchar(40) not null,
    primary key (id)
);
