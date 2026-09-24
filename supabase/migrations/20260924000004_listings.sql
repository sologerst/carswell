-- CarSwipe schema, part 4: listings, photos, embeddings, AI enrichment, price
-- history, VIN decodes and market price stats.

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  vin text not null check (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  source text not null check (source in ('fixture', 'marketcheck', 'dealer_feed', 'private')),
  source_id text,
  source_url text,
  market_id text references public.markets (id),
  dealership_id uuid references public.dealerships (id) on delete set null,
  seller_type text not null default 'dealer' check (seller_type in ('dealer', 'private')),
  private_seller_id uuid references public.profiles (id) on delete set null,

  year integer not null check (year between 1980 and 2100),
  make text not null,
  model text not null,
  trim_level text,
  body_style text not null check (body_style in ('sedan', 'hatchback', 'coupe', 'convertible', 'wagon',
    'compact_suv', 'midsize_suv', 'three_row_suv', 'minivan', 'pickup')),
  condition text not null default 'used' check (condition in ('new', 'used', 'cpo')),
  price numeric(10, 2) not null check (price > 0),
  msrp numeric(10, 2),
  miles integer not null default 0 check (miles >= 0),

  exterior_color text,
  exterior_color_family text,
  interior_color text,
  interior_material text check (interior_material in ('cloth', 'leather', 'synthetic_leather', 'other')),

  fuel_type text not null default 'gas' check (fuel_type in ('gas', 'diesel', 'hybrid', 'plugin_hybrid', 'electric')),
  drivetrain text check (drivetrain in ('fwd', 'rwd', 'awd', '4wd')),
  transmission text check (transmission in ('automatic', 'manual', 'cvt')),
  engine text,
  cylinders integer,
  horsepower integer,
  mpg_city integer,
  mpg_hwy integer,
  ev_range_mi integer,
  seats integer,
  third_row boolean,
  doors integer,
  length_in integer,
  towing_lbs integer,

  -- Canonical feature keys (see src/lib/criteria/features.ts).
  features text[] not null default '{}',
  -- True when features come from build data (VIN/OEM), so a Must-have feature
  -- can be a hard filter. False means "Not confirmed" badges instead.
  features_verified boolean not null default false,

  title_status text check (title_status in ('clean', 'salvage', 'rebuilt', 'lemon')),
  accident_count integer,
  owner_count integer,
  personal_use boolean,
  service_records boolean,
  open_recalls integer,
  description text,

  zip text,
  lat double precision not null,
  lng double precision not null,
  geog extensions.geography(Point, 4326) generated always as
    (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography) stored,

  expected_price numeric(10, 2),
  deal_rating text check (deal_rating in ('great', 'good', 'fair', 'high', 'overpriced')),
  quality_score real,
  photo_count integer not null default 0,

  is_active boolean not null default true,
  is_canonical boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  missed_sweeps integer not null default 0,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One canonical, active card per VIN.
create unique index listings_one_canonical_vin on public.listings (vin) where is_active and is_canonical;
create unique index listings_source_key on public.listings (source, source_id) where source_id is not null;
create index listings_geog_idx on public.listings using gist (geog);
create index listings_active_price_idx on public.listings (price) where is_active and is_canonical;
create index listings_dealership_idx on public.listings (dealership_id);
create index listings_make_model_idx on public.listings (make, model, year);
create trigger listings_updated_at before update on public.listings
  for each row execute function public.set_updated_at();

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  url text not null,
  position integer not null default 0,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  unique (listing_id, position)
);

-- Image "style fingerprint" per car. Dimension depends on the embedding
-- provider, so the column is untyped; add an HNSW index once it is fixed.
create table public.listing_embeddings (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  model text not null,
  embedding extensions.vector not null,
  created_at timestamptz not null default now()
);

create table public.listing_enrichment (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  features text[] not null default '{}',
  condition_notes text,
  color_family text,
  confidence real,
  model text,
  raw jsonb,
  created_at timestamptz not null default now()
);

create table public.listing_price_changes (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  old_price numeric(10, 2) not null,
  new_price numeric(10, 2) not null,
  changed_at timestamptz not null default now()
);
create index listing_price_changes_listing_idx on public.listing_price_changes (listing_id, changed_at desc);

-- Record price changes automatically.
create or replace function public.track_price_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.price is distinct from old.price then
    insert into public.listing_price_changes (listing_id, old_price, new_price)
    values (new.id, old.price, new.price);
  end if;
  return new;
end;
$$;
create trigger listings_price_change after update of price on public.listings
  for each row execute function public.track_price_change();

create table public.vin_decodes (
  vin text primary key,
  data jsonb,
  recalls jsonb,
  decoded_at timestamptz,
  recalls_checked_at timestamptz
);

create table public.market_price_stats (
  id bigint generated always as identity primary key,
  market_id text references public.markets (id),
  year integer not null,
  make text not null,
  model text not null,
  trim_level text not null default '',
  n integer not null,
  slope_per_mile double precision,
  intercept double precision,
  median_price numeric(10, 2),
  computed_at timestamptz not null default now(),
  unique (market_id, year, make, model, trim_level)
);

alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.listing_embeddings enable row level security;
alter table public.listing_enrichment enable row level security;
alter table public.listing_price_changes enable row level security;
alter table public.vin_decodes enable row level security;
alter table public.market_price_stats enable row level security;

create policy "active listings are public" on public.listings for select to anon, authenticated
  using (is_active or (select public.is_dealer_member(dealership_id)) or (select public.is_admin()));
create policy "listing photos are public" on public.listing_photos for select to anon, authenticated using (true);
create policy "listing embeddings are readable" on public.listing_embeddings for select to authenticated using (true);
create policy "listing enrichment is readable" on public.listing_enrichment for select to authenticated using (true);
create policy "price history is public" on public.listing_price_changes for select to anon, authenticated using (true);
create policy "vin decodes are readable" on public.vin_decodes for select to authenticated using (true);
create policy "market stats are readable" on public.market_price_stats for select to authenticated using (true);
