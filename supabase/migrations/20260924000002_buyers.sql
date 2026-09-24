-- CarSwipe schema, part 2: buyer profiles, preferences (tier + source per
-- criterion), learned attribute affinities and visual taste vectors.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  first_name text,
  phone text,
  zip text check (zip is null or zip ~ '^\d{5}$'),
  radius_mi integer not null default 40 check (radius_mi between 5 and 500),
  is_admin boolean not null default false,
  onboarding_completed_at timestamptz,
  onboarding_method text check (onboarding_method in ('chat', 'form')),
  paused_at timestamptz,
  swipe_count integer not null default 0,
  ai_summary text,
  profile_hash text,
  -- Progressive profiling: at most one in-context question per N swipes.
  last_question_swipe integer not null default 0,
  dismissed_questions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Role helpers (security definer so policies can call them without recursion).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- New auth user -> profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- One row per criterion. tier decides how the deck uses it; source records
-- where it came from ("you said" / "you swiped" / "you told me about your life").
create table public.buyer_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null,
  value jsonb not null,
  tier text not null default 'nice' check (tier in ('dealbreaker', 'must', 'nice', 'dont_care')),
  source text not null default 'said' check (source in ('said', 'swiped', 'life', 'default')),
  confidence real,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
create trigger buyer_preferences_updated_at before update on public.buyer_preferences
  for each row execute function public.set_updated_at();

-- Like/pass tallies per attribute ("make:Toyota", "feature:sunroof", ...).
-- Written only by record_swipes().
create table public.user_affinities (
  user_id uuid not null references public.profiles (id) on delete cascade,
  attribute text not null,
  likes real not null default 0,
  passes real not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, attribute)
);

-- Running sums of liked / passed photo embeddings. The effective taste vector is
-- mean(liked) - pass_share * mean(passed), computed at query time.
create table public.taste_vectors (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  like_sum extensions.vector,
  pass_sum extensions.vector,
  n_likes real not null default 0,
  n_passes real not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.buyer_preferences enable row level security;
alter table public.user_affinities enable row level security;
alter table public.taste_vectors enable row level security;

create policy "read own profile" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "update own profile" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Users may only change their own descriptive fields; is_admin, email and
-- swipe_count are managed by the server.
revoke update on public.profiles from authenticated, anon;
grant update (first_name, phone, zip, radius_mi, onboarding_completed_at, onboarding_method,
  paused_at, ai_summary, profile_hash, last_question_swipe, dismissed_questions)
  on public.profiles to authenticated;

create policy "own preferences" on public.buyer_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "read own affinities" on public.user_affinities for select to authenticated
  using (user_id = (select auth.uid()));
create policy "read own taste" on public.taste_vectors for select to authenticated
  using (user_id = (select auth.uid()));

-- Admins edit app_config from the admin screen.
create policy "admins update config" on public.app_config for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins insert config" on public.app_config for insert to authenticated
  with check ((select public.is_admin()));
