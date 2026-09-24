-- CarSwipe schema, part 9: card-shaped listing lookups for detail views and
-- the Likes grid, and visibility of sold cars a buyer already liked.

drop policy "active listings are public" on public.listings;
create policy "active listings are public" on public.listings for select to anon, authenticated
  using (
    is_active
    or (select public.is_dealer_member(dealership_id))
    or (select public.is_admin())
    -- Buyers keep seeing cars they liked after they sell ("Sold" + "See similar").
    or exists (select 1 from public.interests i where i.listing_id = listings.id and i.user_id = (select auth.uid()))
  );

-- Same columns as deck_candidates(), for explicit ids (no swipe exclusion),
-- plus is_active so the UI can show "Sold". Runs as the caller (RLS applies).
create or replace function public.listing_cards(p_ids uuid[], p_lat double precision, p_lng double precision)
returns table (
  id uuid, vin text, year integer, make text, model text, trim_level text, body_style text, condition text,
  price numeric, msrp numeric, expected_price numeric, deal_rating text, miles integer,
  exterior_color text, exterior_color_family text, interior_color text, interior_material text,
  fuel_type text, drivetrain text, transmission text, engine text, horsepower integer,
  mpg_city integer, mpg_hwy integer, ev_range_mi integer, seats integer, third_row boolean,
  towing_lbs integer, features text[], features_verified boolean, title_status text,
  accident_count integer, owner_count integer, personal_use boolean, open_recalls integer,
  days_on_market integer, last_price_drop numeric, photos text[], photo_count integer,
  quality_score real, seller_type text, source text, source_url text, zip text,
  dealership_id uuid, dealer_name text, dealer_doc_fee numeric, dealer_lead_channel text,
  dealer_response_minutes integer, distance_mi double precision, visual_sim double precision,
  is_exploration boolean, is_active boolean, description text, lat double precision, lng double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select
    l.id, l.vin, l.year, l.make, l.model, l.trim_level, l.body_style, l.condition,
    l.price, l.msrp, l.expected_price, l.deal_rating, l.miles,
    l.exterior_color, l.exterior_color_family, l.interior_color, l.interior_material,
    l.fuel_type, l.drivetrain, l.transmission, l.engine, l.horsepower,
    l.mpg_city, l.mpg_hwy, l.ev_range_mi, l.seats, l.third_row,
    l.towing_lbs, l.features, l.features_verified, l.title_status,
    l.accident_count, l.owner_count, l.personal_use, l.open_recalls,
    greatest(0, extract(day from now() - l.first_seen_at))::integer,
    (select pc.old_price - pc.new_price from public.listing_price_changes pc
      where pc.listing_id = l.id and pc.new_price < pc.old_price order by pc.changed_at desc limit 1),
    coalesce((select array_agg(ph.url order by ph.position) from public.listing_photos ph where ph.listing_id = l.id), '{}'),
    l.photo_count, l.quality_score, l.seller_type, l.source, l.source_url, l.zip,
    l.dealership_id, d.name, d.doc_fee, d.lead_channel, d.response_time_minutes,
    case when p_lat is null or p_lng is null then null
      else st_distance(l.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1609.344 end,
    null::double precision, false, l.is_active, l.description, l.lat, l.lng
  from public.listings l
  left join public.dealerships d on d.id = l.dealership_id
  where l.id = any (p_ids);
$$;

revoke execute on function public.listing_cards(uuid[], double precision, double precision) from public, anon;
grant execute on function public.listing_cards(uuid[], double precision, double precision) to authenticated;
