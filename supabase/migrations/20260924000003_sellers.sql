-- CarSwipe schema, part 3: dealerships and their members.

create table public.dealerships (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  address text,
  city text,
  state text not null default 'TN',
  zip text,
  lat double precision,
  lng double precision,
  geog extensions.geography(Point, 4326) generated always as (
    case when lat is null or lng is null then null
    else extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography end
  ) stored,
  phone text,
  website text,
  market_id text references public.markets (id),
  -- How a like reaches this dealer: in-app inbox, ADF email, or nowhere yet
  -- (saved for sales outreach). Public so the deck can rank "matchability".
  lead_channel text not null default 'none' check (lead_channel in ('inbox', 'email', 'none')),
  verified_at timestamptz,
  claimed_at timestamptz,
  response_time_minutes integer,
  rating numeric(2, 1),
  review_count integer not null default 0,
  doc_fee numeric(10, 2),
  accepts_trade_ins boolean not null default true,
  no_haggle boolean not null default false,
  home_delivery boolean not null default false,
  at_home_test_drive boolean not null default false,
  buy_online boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dealerships_geog_idx on public.dealerships using gist (geog);
create trigger dealerships_updated_at before update on public.dealerships
  for each row execute function public.set_updated_at();

-- Contact details that must never be public (lead email, internal notes).
create table public.dealership_private (
  dealership_id uuid primary key references public.dealerships (id) on delete cascade,
  lead_email text,
  lead_email_verified_at timestamptz,
  notes text,
  updated_at timestamptz not null default now()
);

create table public.dealership_members (
  dealership_id uuid not null references public.dealerships (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (dealership_id, user_id)
);
create index dealership_members_user_idx on public.dealership_members (user_id);

create table public.dealership_invites (
  id uuid primary key default gen_random_uuid(),
  dealership_id uuid not null references public.dealerships (id) on delete cascade,
  email extensions.citext not null,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Claim links go out in ADF lead emails so an off-platform dealer can claim
-- their dealership and reply in the app.
create table public.dealership_claim_tokens (
  id uuid primary key default gen_random_uuid(),
  dealership_id uuid not null references public.dealerships (id) on delete cascade,
  token_hash text not null unique,
  interest_id uuid,
  expires_at timestamptz not null default now() + interval '30 days',
  claimed_by uuid references public.profiles (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.is_dealer_member(p_dealership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.dealership_members m
    where m.dealership_id = p_dealership_id and m.user_id = auth.uid()
  );
$$;

alter table public.dealerships enable row level security;
alter table public.dealership_private enable row level security;
alter table public.dealership_members enable row level security;
alter table public.dealership_invites enable row level security;
alter table public.dealership_claim_tokens enable row level security;

create policy "dealerships are public" on public.dealerships for select to anon, authenticated using (true);
create policy "members update their dealership" on public.dealerships for update to authenticated
  using ((select public.is_dealer_member(id)) or (select public.is_admin()))
  with check ((select public.is_dealer_member(id)) or (select public.is_admin()));
revoke update on public.dealerships from authenticated, anon;
grant update (name, address, city, zip, phone, website, doc_fee, accepts_trade_ins, no_haggle,
  home_delivery, at_home_test_drive, buy_online) on public.dealerships to authenticated;

create policy "members read private details" on public.dealership_private for select to authenticated
  using ((select public.is_dealer_member(dealership_id)) or (select public.is_admin()));
create policy "members update private details" on public.dealership_private for update to authenticated
  using ((select public.is_dealer_member(dealership_id)) or (select public.is_admin()))
  with check ((select public.is_dealer_member(dealership_id)) or (select public.is_admin()));

create policy "read memberships" on public.dealership_members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_dealer_member(dealership_id)) or (select public.is_admin()));

create policy "members read invites" on public.dealership_invites for select to authenticated
  using ((select public.is_dealer_member(dealership_id)) or (select public.is_admin()));
create policy "admins read claim tokens" on public.dealership_claim_tokens for select to authenticated
  using ((select public.is_admin()));
