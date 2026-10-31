-- Hybrid demo (plan/DEMO-HYBRID.md): the scenario runs in mock mode, but each payment is a real mainnet
-- BRC-29 payment from the visitor's own BSV Desktop to the provider's wallet. There is no backend:
-- the payer's browser inserts the hand-off row here, the provider's browser reads it, verifies the BEEF
-- with SPV and calls internalizeAction, then inserts a receipt. The chain stays the source of truth.
--
-- Public by design (anon may insert and read). Nothing here can move money: the BEEF and the derivation
-- data only let the provider's wallet, which holds the key, claim its own output. A forged row fails SPV
-- or internalizeAction in the provider's browser. Rows cannot be updated or deleted through the API.

create table demo_payments (
  txid               text primary key check (txid ~ '^[0-9a-f]{64}$'),
  scenario           text not null check (length(scenario) between 1 and 64),
  session            text not null check (length(session) between 1 and 64),
  payer_identity     text not null check (payer_identity ~ '^0[23][0-9a-f]{64}$'),
  provider_identity  text not null check (provider_identity ~ '^0[23][0-9a-f]{64}$'),
  vout               integer not null check (vout between 0 and 1000),
  satoshis           bigint not null check (satoshis between 1 and 1000000),
  derivation_prefix  text not null check (length(derivation_prefix) between 1 and 128),
  derivation_suffix  text not null check (length(derivation_suffix) between 1 and 128),
  -- AtomicBEEF (BRC-95) as hex; 400 kB is far above a payment with its ancestry
  beef               text not null check (beef ~ '^[0-9a-f]+$' and length(beef) <= 400000),
  note               text check (length(note) <= 280),
  created_at         timestamptz not null default now()
);
create index on demo_payments (scenario, session, created_at);
create index on demo_payments (provider_identity, created_at);

-- Written by the provider's browser after internalizeAction succeeded. A display hint only:
-- the provider's wallet balance and WhatsOnChain are the proof.
create table demo_receipts (
  txid               text primary key references demo_payments (txid),
  provider_identity  text not null check (provider_identity ~ '^0[23][0-9a-f]{64}$'),
  created_at         timestamptz not null default now()
);

alter table demo_payments enable row level security;
alter table demo_receipts enable row level security;
create policy read_all on demo_payments for select to anon, authenticated using (true);
create policy read_all on demo_receipts for select to anon, authenticated using (true);
create policy insert_all on demo_payments for insert to anon, authenticated with check (true);
-- a receipt must name the provider the payment was made to
create policy insert_own on demo_receipts for insert to anon, authenticated
  with check (exists (select 1 from demo_payments p where p.txid = demo_receipts.txid and p.provider_identity = demo_receipts.provider_identity));

revoke update, delete, truncate on demo_payments, demo_receipts from anon, authenticated;

alter publication supabase_realtime add table demo_payments;
alter publication supabase_realtime add table demo_receipts;
