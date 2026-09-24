-- CarSwipe schema, part 10: buyer notes on a lead before a match (for
-- example an approved negotiator draft asking for the out-the-door price).
-- Chat opens only after the buyer picks an offer; notes carry no contact info.

alter table public.interests add column buyer_notes jsonb not null default '[]';

create or replace function public.add_buyer_note(p_interest_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interest public.interests%rowtype;
  v_listing public.listings%rowtype;
begin
  select * into v_interest from public.interests where id = p_interest_id for update;
  if not found or v_interest.user_id is distinct from auth.uid() then
    raise exception 'not your car' using errcode = '42501';
  end if;
  if length(coalesce(p_body, '')) not between 1 and 2000 then
    raise exception 'note must be 1-2000 characters' using errcode = '22023';
  end if;
  if jsonb_array_length(v_interest.buyer_notes) >= 10 then
    raise exception 'too many notes on this lead' using errcode = 'P0001';
  end if;
  update public.interests
  set buyer_notes = buyer_notes || jsonb_build_array(jsonb_build_object('body', p_body, 'at', now()))
  where id = p_interest_id;

  select * into v_listing from public.listings where id = v_interest.listing_id;
  insert into public.notifications (user_id, kind, title, body, url)
  select m.user_id, 'buyer_note', 'A buyer sent a note',
    v_listing.year || ' ' || v_listing.make || ' ' || v_listing.model, '/dealer/leads/' || p_interest_id
  from public.dealership_members m where m.dealership_id = v_interest.dealership_id;
end;
$$;

revoke execute on function public.add_buyer_note(uuid, text) from public, anon;
grant execute on function public.add_buyer_note(uuid, text) to authenticated;

-- dealer_leads(): include the notes.
drop function public.dealer_leads(uuid);
create or replace function public.dealer_leads(p_dealership_id uuid)
returns table (
  interest_id uuid, status text, kind text, created_at timestamptz, sla_expires_at timestamptz,
  matched_at timestamptz, test_drive_windows jsonb, dossier jsonb, lead_summary text, buyer_notes jsonb,
  listing_id uuid, listing_title text, listing_price numeric, listing_vin text, listing_photo text,
  listing_miles integer, distance_mi double precision, offer_count integer, best_offer_otd numeric,
  buyer_email text, buyer_phone text, conversation_id uuid
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not (public.is_dealer_member(p_dealership_id) or public.is_admin()) then
    raise exception 'not a member of this dealership' using errcode = '42501';
  end if;
  return query
  select i.id, i.status, i.kind, i.created_at, i.sla_expires_at, i.matched_at, i.test_drive_windows,
    i.dossier, i.lead_summary, i.buyer_notes,
    l.id, l.year || ' ' || l.make || ' ' || l.model || coalesce(' ' || l.trim_level, ''), l.price, l.vin,
    (select ph.url from public.listing_photos ph where ph.listing_id = l.id order by ph.position limit 1),
    l.miles,
    (select st_distance(z.geog, l.geog) / 1609.344 from public.zip_codes z where z.zip = (i.dossier ->> 'zip')),
    (select count(*)::integer from public.offers o where o.interest_id = i.id),
    (select min(o.otd_total) from public.offers o where o.interest_id = i.id and o.status in ('active', 'picked')),
    -- Contact details only after the buyer picks this dealer's offer.
    case when i.status in ('matched', 'purchased') then p.email end,
    case when i.status in ('matched', 'purchased') and c.buyer_phone_shared_at is not null then p.phone end,
    c.id
  from public.interests i
  join public.listings l on l.id = i.listing_id
  join public.profiles p on p.id = i.user_id
  left join public.conversations c on c.interest_id = i.id
  where i.dealership_id = p_dealership_id and i.status <> 'withdrawn'
  order by i.created_at desc;
end;
$$;
revoke execute on function public.dealer_leads(uuid) from public, anon;
grant execute on function public.dealer_leads(uuid) to authenticated;
