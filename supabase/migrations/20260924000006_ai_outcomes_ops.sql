-- CarSwipe schema, part 6: AI outputs + usage, outcomes, notifications,
-- analytics, safety and ops tables.

-- AI -------------------------------------------------------------------------
create table public.car_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  profile_hash text not null,
  price_at numeric(10, 2) not null,
  brief jsonb not null,
  source text not null check (source in ('ai', 'template')),
  model text,
  created_at timestamptz not null default now(),
  unique (user_id, listing_id, profile_hash)
);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  feature text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_user_day_idx on public.ai_usage (user_id, created_at);

-- Outcomes -------------------------------------------------------------------
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  interest_id uuid references public.interests (id) on delete set null,
  listing_id uuid references public.listings (id) on delete set null,
  dealership_id uuid references public.dealerships (id) on delete set null,
  price numeric(10, 2),
  reported_at timestamptz not null default now(),
  unique (user_id, interest_id)
);

create table public.seller_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  dealership_id uuid not null references public.dealerships (id) on delete cascade,
  interest_id uuid references public.interests (id) on delete set null,
  stars integer not null check (stars between 1 and 5),
  comment text check (length(comment) <= 2000),
  created_at timestamptz not null default now(),
  unique (user_id, interest_id)
);

-- Notifications --------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  url text,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unpushed_idx on public.notifications (created_at) where pushed_at is null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Analytics ------------------------------------------------------------------
create table public.listing_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  listing_id uuid references public.listings (id) on delete cascade,
  kind text not null check (kind in ('impression', 'detail_open', 'brief_open', 'photo_cycle', 'more_like_this', 'source_click')),
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index listing_events_listing_idx on public.listing_events (listing_id, created_at);

create table public.listing_stats_daily (
  listing_id uuid not null references public.listings (id) on delete cascade,
  day date not null,
  impressions integer not null default 0,
  detail_opens integer not null default 0,
  likes integer not null default 0,
  superlikes integer not null default 0,
  passes integer not null default 0,
  primary key (listing_id, day)
);

-- Phase 2: demand-intelligence rollups for dealers.
create table public.demand_insights (
  id uuid primary key default gen_random_uuid(),
  market_id text references public.markets (id),
  dealership_id uuid references public.dealerships (id) on delete cascade,
  kind text not null,
  period_start date not null,
  period_end date not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- Safety + ops ---------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null,
  target_type text not null check (target_type in ('message', 'listing', 'dealership', 'user')),
  target_id text not null,
  reason text not null,
  details text check (length(details) <= 4000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  blocked_dealership_id uuid references public.dealerships (id) on delete cascade,
  blocked_user_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (num_nonnulls(blocked_dealership_id, blocked_user_id) = 1)
);
create unique index blocks_unique_idx on public.blocks
  (user_id, coalesce(blocked_dealership_id, blocked_user_id));

create table public.rate_limits (
  user_id uuid not null references public.profiles (id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, bucket, window_start)
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  market_id text references public.markets (id),
  source text not null,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'paused')),
  stats jsonb not null default '{}',
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Emails land here when RESEND_API_KEY is not set (local development).
create table public.dev_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  to_address text not null,
  from_address text not null,
  reply_to text,
  subject text not null,
  text_body text,
  html_body text,
  attachments jsonb not null default '[]',
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Audit every config change.
create or replace function public.audit_app_config()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_audit_log (actor_id, action, target, details)
  values (auth.uid(), 'app_config.' || lower(tg_op), new.key,
    jsonb_build_object('old', case when tg_op = 'UPDATE' then old.value end, 'new', new.value));
  return new;
end;
$$;
create trigger app_config_audit after insert or update on public.app_config
  for each row execute function public.audit_app_config();

alter table public.car_briefs enable row level security;
alter table public.ai_usage enable row level security;
alter table public.purchases enable row level security;
alter table public.seller_reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.listing_events enable row level security;
alter table public.listing_stats_daily enable row level security;
alter table public.demand_insights enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;
alter table public.rate_limits enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.ingest_runs enable row level security;
alter table public.dev_outbox enable row level security;

create policy "own briefs" on public.car_briefs for select to authenticated
  using (user_id = (select auth.uid()));
create policy "write own briefs" on public.car_briefs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "replace own briefs" on public.car_briefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Insert-only for users: forging rows only raises your own usage.
create policy "own ai usage" on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "record own ai usage" on public.ai_usage for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "buyer or dealer reads purchases" on public.purchases for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_dealer_member(dealership_id)) or (select public.is_admin()));

create policy "reviews are readable" on public.seller_reviews for select to authenticated using (true);

create policy "own notifications" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "mark own notifications read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.notifications from authenticated, anon;
grant update (read_at) on public.notifications to authenticated;

create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "log own listing events" on public.listing_events for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "dealers read own listing stats" on public.listing_stats_daily for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.listings l where l.id = listing_id and public.is_dealer_member(l.dealership_id))
  );

create policy "dealers read own insights" on public.demand_insights for select to authenticated
  using ((select public.is_dealer_member(dealership_id)) or (select public.is_admin()));

create policy "file reports" on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy "read own reports" on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));
create policy "admins resolve reports" on public.reports for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "own blocks" on public.blocks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "admins read audit log" on public.admin_audit_log for select to authenticated
  using ((select public.is_admin()));
create policy "admins read ingest runs" on public.ingest_runs for select to authenticated
  using ((select public.is_admin()));
create policy "admins read dev outbox" on public.dev_outbox for select to authenticated
  using ((select public.is_admin()));
-- rate_limits: no policies; only security-definer functions touch it.
