-- CarSwipe schema, part 5: swipes, interests (likes sent to dealers), offers,
-- conversations, messages, agent drafts and lead deliveries.

create table public.swipes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  action text not null check (action in ('pass', 'like', 'superlike', 'undo')),
  -- Client-generated id makes offline replays idempotent.
  client_id uuid not null,
  -- For action = 'undo': the client_id of the swipe being undone.
  undo_of uuid,
  undone_at timestamptz,
  position integer,
  was_exploration boolean not null default false,
  score real,
  swiped_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  unique (user_id, client_id)
);
create index swipes_user_listing_idx on public.swipes (user_id, listing_id) where undone_at is null;
create index swipes_user_day_idx on public.swipes (user_id, received_at);

-- A like or super-like. Its dossier is a snapshot of buyer intent without
-- contact details; contact is revealed only after the buyer picks an offer.
create table public.interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  dealership_id uuid references public.dealerships (id) on delete set null,
  swipe_client_id uuid,
  kind text not null default 'like' check (kind in ('like', 'superlike')),
  status text not null default 'sent' check (status in
    ('sent', 'offered', 'matched', 'declined', 'expired', 'unavailable', 'purchased', 'withdrawn')),
  test_drive_windows jsonb,
  dossier jsonb not null default '{}',
  lead_summary text,
  sla_expires_at timestamptz,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, listing_id)
);
create index interests_dealership_status_idx on public.interests (dealership_id, status, created_at desc);
create trigger interests_updated_at before update on public.interests
  for each row execute function public.set_updated_at();

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  interest_id uuid not null references public.interests (id) on delete cascade,
  dealership_id uuid not null references public.dealerships (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  source text not null default 'inbox' check (source in ('inbox', 'email')),
  vehicle_price numeric(10, 2) not null check (vehicle_price > 0),
  doc_fee numeric(10, 2) not null default 0,
  dealer_fees numeric(10, 2) not null default 0,
  tax numeric(10, 2) not null default 0,
  title_fees numeric(10, 2) not null default 0,
  trade_credit numeric(10, 2) not null default 0,
  otd_total numeric(10, 2) not null check (otd_total > 0),
  monthly_estimate numeric(10, 2),
  apr numeric(5, 2),
  term_months integer,
  notes text,
  status text not null default 'active' check (status in ('active', 'picked', 'declined', 'expired', 'withdrawn')),
  expires_at timestamptz not null default now() + interval '7 days',
  picked_at timestamptz,
  created_at timestamptz not null default now()
);
create index offers_interest_idx on public.offers (interest_id);
create index offers_dealership_idx on public.offers (dealership_id, created_at desc);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  interest_id uuid not null unique references public.interests (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  dealership_id uuid not null references public.dealerships (id) on delete cascade,
  buyer_phone_shared_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  sender_role text not null check (sender_role in ('buyer', 'dealer', 'system')),
  kind text not null default 'text' check (kind in ('text', 'test_drive_proposal', 'phone_share', 'system')),
  body text not null check (length(body) between 1 and 4000),
  meta jsonb not null default '{}',
  scam_score real,
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- Negotiator-agent drafts. A human approves every outbound message.
create table public.message_drafts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations (id) on delete cascade,
  interest_id uuid references public.interests (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  intent text,
  source text not null default 'template' check (source in ('ai', 'template')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'discarded')),
  created_at timestamptz not null default now()
);

create table public.lead_deliveries (
  id uuid primary key default gen_random_uuid(),
  interest_id uuid not null references public.interests (id) on delete cascade,
  dealership_id uuid references public.dealerships (id) on delete set null,
  channel text not null check (channel in ('inbox', 'email_adf', 'saved')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  relay_address text,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index lead_deliveries_pending_idx on public.lead_deliveries (next_attempt_at) where status = 'pending';

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
      and (c.buyer_id = auth.uid() or public.is_dealer_member(c.dealership_id))
  );
$$;

-- 20 messages per minute per sender.
create or replace function public.enforce_message_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sender_id is not null and (
    select count(*) from public.messages m
    where m.sender_id = new.sender_id and m.created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'rate limit: too many messages' using errcode = 'P0001';
  end if;
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;
create trigger messages_rate before insert on public.messages
  for each row execute function public.enforce_message_rate();

alter table public.swipes enable row level security;
alter table public.interests enable row level security;
alter table public.offers enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_drafts enable row level security;
alter table public.lead_deliveries enable row level security;

-- Swipes are written only through record_swipes().
create policy "read own swipes" on public.swipes for select to authenticated
  using (user_id = (select auth.uid()));

create policy "buyer or dealer reads interest" on public.interests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_dealer_member(dealership_id)) or (select public.is_admin()));

create policy "buyer or dealer reads offers" on public.offers for select to authenticated
  using (
    (select public.is_dealer_member(dealership_id))
    or exists (select 1 from public.interests i where i.id = interest_id and i.user_id = (select auth.uid()))
    or (select public.is_admin())
  );

create policy "participants read conversations" on public.conversations for select to authenticated
  using (buyer_id = (select auth.uid()) or (select public.is_dealer_member(dealership_id)));

-- Messages are inserted by the server after safety scoring; participants read.
create policy "participants read messages" on public.messages for select to authenticated
  using ((select public.is_conversation_participant(conversation_id)));

create policy "own drafts" on public.message_drafts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "admins read lead deliveries" on public.lead_deliveries for select to authenticated
  using ((select public.is_admin()));
