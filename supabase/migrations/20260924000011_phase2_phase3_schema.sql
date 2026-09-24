-- CarSwipe schema, part 11: Phase 2 and Phase 3 tables.
--   Phase 2: self-serve dealers, team invites, dealer feeds, billing (Stripe),
--            promoted listings, counteroffers, demand insights keys
--   Phase 3: private sellers (routing, moderation, photo hashes, phone
--            verification), inspections, finance and insurance quotes,
--            trade-in estimates, the document vault and storage buckets

-- Profiles and dealerships -----------------------------------------------------
alter table public.profiles
  add column phone_verified_at timestamptz,
  -- Max vehicle price from the buyer's budget (TN out-the-door math), kept by
  -- the insights job. Used only for aggregated, k-anonymous demand reports.
  add column budget_max_price numeric(10, 2);

-- Changing the phone number drops its verification unless the server sets a
-- new verification time in the same update.
create or replace function public.reset_phone_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone is distinct from old.phone and new.phone_verified_at is not distinct from old.phone_verified_at then
    new.phone_verified_at := null;
  end if;
  return new;
end;
$$;
create trigger profiles_phone_verification before update of phone on public.profiles
  for each row execute function public.reset_phone_verification();

alter table public.dealerships
  add column phone_verified_at timestamptz,
  add column created_by uuid references public.profiles (id) on delete set null,
  -- MVP dealers invoiced by hand are exempt from metered billing.
  add column billing_exempt boolean not null default false;

-- Listings: moderation, promotion, snap-to-list output ---------------------------
alter table public.listings
  add column review_status text not null default 'approved'
    check (review_status in ('draft', 'pending', 'approved', 'rejected', 'removed')),
  -- {flags: [{code, severity, detail}], decision, reason, decided_by, decided_at}
  add column moderation jsonb not null default '{}',
  add column risk_score real,
  add column promoted_until timestamptz,
  add column listing_ai jsonb,
  add column stock_number text,
  add column published_at timestamptz;
create index listings_private_seller_idx on public.listings (private_seller_id) where private_seller_id is not null;
create index listings_review_idx on public.listings (review_status, created_at) where review_status = 'pending';
create index listings_promoted_idx on public.listings (promoted_until) where promoted_until is not null;

alter table public.listing_photos
  add column storage_path text,
  -- 64-bit perceptual hash (dHash) for duplicate / stolen photo checks.
  add column phash bit(64),
  add column quality jsonb;
create index listing_photos_phash_idx on public.listing_photos (listing_id) where phash is not null;

drop policy "active listings are public" on public.listings;
create policy "active listings are public" on public.listings for select to anon, authenticated
  using (
    is_active
    or (select public.is_dealer_member(dealership_id))
    or (select public.is_admin())
    or private_seller_id = (select auth.uid())
    -- Buyers keep seeing cars they liked after they sell ("Sold" + "See similar").
    or exists (select 1 from public.interests i where i.listing_id = listings.id and i.user_id = (select auth.uid()))
  );

create index swipes_listing_idx on public.swipes (listing_id, received_at) where undone_at is null;

-- Private-seller routing: an interest, offer or conversation belongs to a
-- dealership or to a private seller, never both.
alter table public.interests
  add column seller_user_id uuid references public.profiles (id) on delete cascade,
  add column purchase_prompted_days integer[] not null default '{}',
  -- Match-to-keys checklist: {"test_drive": true, "insurance": true, ...}
  add column journey jsonb not null default '{}';
create index interests_seller_status_idx on public.interests (seller_user_id, status, created_at desc)
  where seller_user_id is not null;

alter table public.offers
  alter column dealership_id drop not null,
  add column seller_user_id uuid references public.profiles (id) on delete cascade,
  add column lender text check (length(lender) <= 120),
  add column down_payment numeric(10, 2),
  add constraint offers_one_seller check (num_nonnulls(dealership_id, seller_user_id) = 1);
create index offers_seller_idx on public.offers (seller_user_id, created_at desc) where seller_user_id is not null;

alter table public.conversations
  alter column dealership_id drop not null,
  add column seller_user_id uuid references public.profiles (id) on delete cascade,
  add constraint conversations_one_seller check (num_nonnulls(dealership_id, seller_user_id) = 1);

alter table public.messages drop constraint messages_sender_role_check;
alter table public.messages add constraint messages_sender_role_check
  check (sender_role in ('buyer', 'dealer', 'seller', 'system'));
alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check
  check (kind in ('text', 'test_drive_proposal', 'phone_share', 'system', 'document', 'safety'));

alter table public.purchases add column seller_user_id uuid references public.profiles (id) on delete set null;

alter table public.lead_deliveries drop constraint lead_deliveries_channel_check;
alter table public.lead_deliveries add constraint lead_deliveries_channel_check
  check (channel in ('inbox', 'email_adf', 'saved', 'seller_inbox'));

drop policy "buyer or dealer reads interest" on public.interests;
create policy "buyer or seller reads interest" on public.interests for select to authenticated
  using (
    user_id = (select auth.uid())
    or seller_user_id = (select auth.uid())
    or (select public.is_dealer_member(dealership_id))
    or (select public.is_admin())
  );

drop policy "buyer or dealer reads offers" on public.offers;
create policy "buyer or seller reads offers" on public.offers for select to authenticated
  using (
    seller_user_id = (select auth.uid())
    or (select public.is_dealer_member(dealership_id))
    or exists (select 1 from public.interests i where i.id = interest_id and i.user_id = (select auth.uid()))
    or (select public.is_admin())
  );

drop policy "participants read conversations" on public.conversations;
create policy "participants read conversations" on public.conversations for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or seller_user_id = (select auth.uid())
    or (select public.is_dealer_member(dealership_id))
  );

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and (c.buyer_id = auth.uid() or c.seller_user_id = auth.uid() or public.is_dealer_member(c.dealership_id))
  );
$$;

-- Counteroffers (negotiator v2) ---------------------------------------------------
create table public.counteroffers (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  interest_id uuid not null references public.interests (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  amount_otd numeric(10, 2) not null check (amount_otd > 0),
  body text check (length(body) <= 2000),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'superseded')),
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index counteroffers_interest_idx on public.counteroffers (interest_id, created_at desc);

-- Phone verification (Twilio Verify, or a dev code in dev_outbox) ----------------
create table public.phone_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  purpose text not null check (purpose in ('profile', 'dealership')),
  dealership_id uuid references public.dealerships (id) on delete cascade,
  channel text not null check (channel in ('twilio', 'dev')),
  code_hash text,
  attempts integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'expired', 'failed')),
  expires_at timestamptz not null default now() + interval '10 minutes',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index phone_verifications_user_idx on public.phone_verifications (user_id, created_at desc);

-- Dealer feeds (Phase 2) ----------------------------------------------------------
create table public.dealer_feeds (
  dealership_id uuid primary key references public.dealerships (id) on delete cascade,
  url text check (url ~ '^https://'),
  enabled boolean not null default false,
  last_run_at timestamptz,
  last_status text,
  last_stats jsonb not null default '{}',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger dealer_feeds_updated_at before update on public.dealer_feeds
  for each row execute function public.set_updated_at();
alter table public.ingest_runs add column dealership_id uuid references public.dealerships (id) on delete cascade;

-- Billing (Phase 2) ---------------------------------------------------------------
create table public.billing_customers (
  dealership_id uuid primary key references public.dealerships (id) on delete cascade,
  stripe_customer_id text not null unique,
  email text,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id text primary key,
  dealership_id uuid not null references public.dealerships (id) on delete cascade,
  stripe_customer_id text not null,
  product text not null check (product in ('leads', 'insights')),
  status text not null,
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
create index subscriptions_dealership_idx on public.subscriptions (dealership_id, product);

create table public.stripe_events (
  id text primary key,
  type text not null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed', 'ignored')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- One charge per matched lead (never per sale). Reported to a Stripe Billing
-- Meter by the dispatch job.
create table public.lead_charges (
  id uuid primary key default gen_random_uuid(),
  interest_id uuid not null unique references public.interests (id) on delete cascade,
  dealership_id uuid not null references public.dealerships (id) on delete cascade,
  amount_usd numeric(10, 2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'reported', 'failed', 'waived')),
  meter_event_id text,
  attempts integer not null default 0,
  error text,
  reported_at timestamptz,
  created_at timestamptz not null default now()
);
create index lead_charges_pending_idx on public.lead_charges (created_at) where status = 'pending';
create index lead_charges_dealership_idx on public.lead_charges (dealership_id, created_at desc);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  dealership_id uuid not null references public.dealerships (id) on delete cascade,
  days integer not null check (days between 1 and 90),
  amount_usd numeric(10, 2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'active', 'failed', 'dev')),
  checkout_session_id text unique,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.record_lead_charge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'matched' and old.status is distinct from 'matched' and new.dealership_id is not null then
    insert into public.lead_charges (interest_id, dealership_id, amount_usd, status)
    select new.id, new.dealership_id, public.config_number('billing', 'matched_lead_price_usd', 0),
      case when d.billing_exempt then 'waived' else 'pending' end
    from public.dealerships d where d.id = new.dealership_id
    on conflict (interest_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger interests_lead_charge after update of status on public.interests
  for each row execute function public.record_lead_charge();

-- Inspections, finance, insurance, trade-in, vault (Phase 3) -------------------------
create table public.inspection_shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  zip text,
  lat double precision not null,
  lng double precision not null,
  geog extensions.geography(Point, 4326) generated always as
    (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography) stored,
  phone text,
  email text,
  price_usd numeric(10, 2),
  rating numeric(2, 1),
  mobile boolean not null default false,
  is_demo boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index inspection_shops_geog_idx on public.inspection_shops using gist (geog);

create table public.inspection_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  interest_id uuid not null references public.interests (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  shop_id uuid not null references public.inspection_shops (id) on delete cascade,
  windows jsonb not null default '[]',
  notes text check (length(notes) <= 2000),
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger inspection_requests_updated_at before update on public.inspection_requests
  for each row execute function public.set_updated_at();

-- Soft-pull pre-qualification results from a lending partner. CarSwipe never
-- collects SSNs; the partner's hosted flow does. [VERIFY partners]
create table public.finance_prequals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  partner text not null,
  status text not null check (status in ('prequalified', 'declined', 'pending', 'error')),
  max_amount numeric(10, 2),
  apr numeric(5, 2),
  term_months integer,
  credit_tier text,
  reference text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.insurance_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  partner text not null,
  carrier text,
  monthly_premium numeric(10, 2) not null,
  coverage jsonb not null default '{}',
  reference text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.trade_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  vin text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  year integer not null,
  make text not null,
  model text not null,
  trim_level text,
  miles integer not null check (miles >= 0),
  condition text not null check (condition in ('excellent', 'good', 'fair', 'rough')),
  low numeric(10, 2) not null,
  high numeric(10, 2) not null,
  photo_paths text[] not null default '{}',
  notes jsonb not null default '{}',
  source text not null default 'model' check (source in ('model', 'ai')),
  created_at timestamptz not null default now()
);

create table public.vault_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  interest_id uuid references public.interests (id) on delete set null,
  kind text not null check (kind in ('license', 'insurance', 'income', 'trade_title', 'payoff', 'preapproval', 'other')),
  storage_path text not null,
  file_name text not null check (length(file_name) <= 200),
  mime text,
  size_bytes integer check (size_bytes <= 15728640),
  created_at timestamptz not null default now()
);
create index vault_documents_user_idx on public.vault_documents (user_id, created_at desc);

-- Demand insights: a stable key per row so dashboards can link and compare.
alter table public.demand_insights add column key text;
create index demand_insights_dealer_idx on public.demand_insights (dealership_id, period_end desc);
create index demand_insights_market_idx on public.demand_insights (market_id, kind, period_end desc);

-- RLS ------------------------------------------------------------------------------
alter table public.counteroffers enable row level security;
alter table public.phone_verifications enable row level security;
alter table public.dealer_feeds enable row level security;
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.lead_charges enable row level security;
alter table public.promotions enable row level security;
alter table public.inspection_shops enable row level security;
alter table public.inspection_requests enable row level security;
alter table public.finance_prequals enable row level security;
alter table public.insurance_quotes enable row level security;
alter table public.trade_estimates enable row level security;
alter table public.vault_documents enable row level security;

create policy "parties read counteroffers" on public.counteroffers for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or exists (
      select 1 from public.interests i where i.id = interest_id
        and (i.seller_user_id = (select auth.uid()) or public.is_dealer_member(i.dealership_id))
    )
    or (select public.is_admin())
  );

create policy "members read feeds" on public.dealer_feeds for select to authenticated
  using ((select public.is_dealer_member(dealership_id)) or (select public.is_admin()));
create policy "members read billing customer" on public.billing_customers for select to authenticated
  using ((select public.is_dealer_member(dealership_id)) or (select public.is_admin()));
create policy "members read subscriptions" on public.subscriptions for select to authenticated
  using ((select public.is_dealer_member(dealership_id)) or (select public.is_admin()));
create policy "admins read stripe events" on public.stripe_events for select to authenticated
  using ((select public.is_admin()));
create policy "members read lead charges" on public.lead_charges for select to authenticated
  using ((select public.is_dealer_member(dealership_id)) or (select public.is_admin()));
create policy "members read promotions" on public.promotions for select to authenticated
  using ((select public.is_dealer_member(dealership_id)) or (select public.is_admin()));

create policy "inspection shops are readable" on public.inspection_shops for select to authenticated using (is_active);
create policy "own inspection requests" on public.inspection_requests for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.interests i where i.id = interest_id and i.seller_user_id = (select auth.uid()))
    or (select public.is_admin())
  );
create policy "own prequals" on public.finance_prequals for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own insurance quotes" on public.insurance_quotes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own trade estimates" on public.trade_estimates for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own vault documents" on public.vault_documents for select to authenticated
  using (user_id = (select auth.uid()));
create policy "add own vault documents" on public.vault_documents for insert to authenticated
  with check (user_id = (select auth.uid()) and storage_path like (select auth.uid())::text || '/%');
create policy "delete own vault documents" on public.vault_documents for delete to authenticated
  using (user_id = (select auth.uid()));
-- phone_verifications, stripe_events writes: service role only.

-- Storage buckets --------------------------------------------------------------------
-- listing-photos is public (seller uploads, licensed to CarSwipe by the terms);
-- vault and trade-photos are private. Every upload goes in "<user id>/...".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('listing-photos', 'listing-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('vault', 'vault', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('trade-photos', 'trade-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "owners upload to their folder" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('listing-photos', 'vault', 'trade-photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "owners read their files" on storage.objects for select to authenticated
  using (
    bucket_id in ('listing-photos', 'vault', 'trade-photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "owners delete their files" on storage.objects for delete to authenticated
  using (
    bucket_id in ('listing-photos', 'vault', 'trade-photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Private sellers see stats for their own listings.
drop policy "dealers read own listing stats" on public.listing_stats_daily;
create policy "sellers read own listing stats" on public.listing_stats_daily for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.listings l where l.id = listing_id
        and (public.is_dealer_member(l.dealership_id) or l.private_seller_id = (select auth.uid()))
    )
  );

create trigger dealerships_phone_verification before update of phone on public.dealerships
  for each row execute function public.reset_phone_verification();
