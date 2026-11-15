-- Razorpay / UPI payment order tracking (no card numbers, CVV, or UPI PIN/VPA stored).
alter table fee_payment_orders add column if not exists provider varchar(24) not null default 'mock';
alter table fee_payment_orders add column if not exists provider_order_id varchar(128);
alter table fee_payment_orders add column if not exists step_up_verified boolean not null default false;
alter table fee_payment_orders add column if not exists payment_id varchar(96);
create index if not exists idx_order_provider_id on fee_payment_orders (provider_order_id);
