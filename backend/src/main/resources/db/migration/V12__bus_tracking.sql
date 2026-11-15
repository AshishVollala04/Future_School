-- Live bus tracking: private driver links (only the token's hash is stored) and trips.
-- A trip keeps only the bus's latest position while live; it is cleared when the trip ends.
create table if not exists bus_tracker_links (
    id varchar(64) not null,
    school_id varchar(64) not null,
    route_id varchar(64) not null,
    token_hash varchar(64) not null,
    created_by varchar(64) not null,
    created_at varchar(40) not null,
    revoked boolean not null,
    primary key (id)
);
create unique index if not exists uk_bus_link_token on bus_tracker_links (token_hash);

create table if not exists bus_trips (
    id varchar(64) not null,
    school_id varchar(64) not null,
    route_id varchar(64) not null,
    direction varchar(16) not null,
    status varchar(16) not null,
    started_at bigint not null,
    ended_at bigint,
    last_lat double precision,
    last_lng double precision,
    last_accuracy double precision,
    last_at bigint,
    primary key (id)
);
create index if not exists idx_bus_trip_route_status on bus_trips (route_id, status);
