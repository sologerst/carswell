-- CarSwipe schema, part 1: extensions, shared helpers, reference + config tables.
-- Every table in this project has Row Level Security enabled.

create extension if not exists postgis with schema extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- updated_at helper -----------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- jsonb array -> text[] (null when missing or empty). Used by deck filters.
create or replace function public.jtext(j jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when j is null or jsonb_typeof(j) <> 'array' or jsonb_array_length(j) = 0 then null
    else array(select jsonb_array_elements_text(j))
  end;
$$;

-- Scale a pgvector by a scalar (pgvector has element-wise *, not scalar *).
create or replace function public.vec_scale(v extensions.vector, s double precision)
returns extensions.vector
language sql
immutable
set search_path = public, extensions
as $$
  select case when v is null then null
    else v * (array_fill(s::real, array[vector_dims(v)]))::extensions.vector
  end;
$$;

-- Reference ------------------------------------------------------------------
create table public.zip_codes (
  zip text primary key check (zip ~ '^\d{5}$'),
  city text not null,
  state text not null,
  lat double precision not null,
  lng double precision not null,
  geog extensions.geography(Point, 4326) generated always as
    (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography) stored
);
create index zip_codes_geog_idx on public.zip_codes using gist (geog);

create table public.markets (
  id text primary key,
  name text not null,
  center_zip text not null references public.zip_codes (zip),
  radius_mi integer not null default 60,
  is_active boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now()
);

-- Tunable settings (ranking weights, limits, tax rates...). Editable by admins
-- without a deploy.
create table public.app_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
create trigger app_config_updated_at before update on public.app_config
  for each row execute function public.set_updated_at();

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null unique,
  zip text,
  source text,
  created_at timestamptz not null default now()
);

alter table public.zip_codes enable row level security;
alter table public.markets enable row level security;
alter table public.app_config enable row level security;
alter table public.waitlist enable row level security;

create policy "zip codes are public" on public.zip_codes for select to anon, authenticated using (true);
create policy "markets are public" on public.markets for select to anon, authenticated using (true);
create policy "config is readable" on public.app_config for select to anon, authenticated using (true);
create policy "anyone can join the waitlist" on public.waitlist for insert to anon, authenticated
  with check (email is not null);
