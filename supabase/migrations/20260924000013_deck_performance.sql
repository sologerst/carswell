-- CarSwipe schema, part 13: deck performance at 50,000 listings.
--
-- The deck functions used one static query with "filter is null or column
-- matches" for every criterion, so Postgres planned it once, generically:
-- every jsonb filter was re-extracted per row and no index could be chosen
-- (about 2.5 s at 50k cars). Now:
--   * deck_filter_sql() turns the filters into only the predicates that apply,
--     with values as typed literals, so each call gets a custom plan;
--   * the first pass reads just the scoring columns and counts the eligible
--     set in the same scan (no second deck_count query for the deck);
--   * full card columns, photos and dealer fields are read for the ~400
--     picked cars only.
-- The functions are security definer because they return only active,
-- canonical, approved listings (public under RLS) and read only the calling
-- buyer's own swipes, blocks and taste vector.

-- Composite index for the most common hard filters.
create index if not exists listings_deck_idx on public.listings (body_style, price)
  where is_active and is_canonical and review_status = 'approved';

create or replace function public.deck_filter_sql(p jsonb, p_uid uuid)
returns text
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  w text[] := array['l.is_active', 'l.is_canonical', $q$l.review_status = 'approved'$q$];
  a text[];
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'filters must be an object' using errcode = '22023';
  end if;
  w := w || format('st_dwithin(l.geog, st_setsrid(st_makepoint(%s, %s), 4326)::geography, %s, false)',
    (p ->> 'lng')::float8, (p ->> 'lat')::float8, coalesce((p ->> 'radius_mi')::float8, 40) * 1609.344);
  if (p ->> 'max_price') is not null then w := w || format('l.price <= %s', (p ->> 'max_price')::numeric); end if;
  if (p ->> 'year_min') is not null then w := w || format('l.year >= %s', (p ->> 'year_min')::int); end if;
  if (p ->> 'year_max') is not null then w := w || format('l.year <= %s', (p ->> 'year_max')::int); end if;
  if (p ->> 'max_miles') is not null then w := w || format('l.miles <= %s', (p ->> 'max_miles')::int); end if;
  if (p ->> 'min_seats') is not null then w := w || format('(l.seats is null or l.seats >= %s)', (p ->> 'min_seats')::int); end if;
  if (p ->> 'max_owners') is not null then w := w || format('(l.owner_count is null or l.owner_count <= %s)', (p ->> 'max_owners')::int); end if;
  if (p ->> 'min_ev_range') is not null then
    w := w || format($q$(l.fuel_type <> 'electric' or l.ev_range_mi is null or l.ev_range_mi >= %s)$q$, (p ->> 'min_ev_range')::int);
  end if;
  if (p ->> 'min_towing') is not null then w := w || format('(l.towing_lbs is null or l.towing_lbs >= %s)', (p ->> 'min_towing')::int); end if;
  if coalesce((p ->> 'require_third_row')::boolean, false) then w := w || 'l.third_row is distinct from false'::text; end if;
  -- Missing history passes with a "not reported" badge; only known-bad is removed.
  if coalesce((p ->> 'require_clean_title')::boolean, false) then w := w || $q$(l.title_status is null or l.title_status = 'clean')$q$::text; end if;
  if coalesce((p ->> 'require_no_accidents')::boolean, false) then w := w || '(l.accident_count is null or l.accident_count = 0)'::text; end if;

  a := public.jtext(p -> 'conditions');     if a is not null then w := w || format('l.condition = any (%L::text[])', a); end if;
  a := public.jtext(p -> 'body_styles');    if a is not null then w := w || format('l.body_style = any (%L::text[])', a); end if;
  a := public.jtext(p -> 'fuel_types');     if a is not null then w := w || format('l.fuel_type = any (%L::text[])', a); end if;
  a := public.jtext(p -> 'drivetrains');    if a is not null then w := w || format('(l.drivetrain is null or l.drivetrain = any (%L::text[]))', a); end if;
  a := public.jtext(p -> 'transmissions');  if a is not null then w := w || format('(l.transmission is null or l.transmission = any (%L::text[]))', a); end if;
  a := public.jtext(p -> 'include_makes');  if a is not null then w := w || format('l.make = any (%L::text[])', a); end if;
  a := public.jtext(p -> 'exclude_makes');  if a is not null then w := w || format('not (l.make = any (%L::text[]))', a); end if;
  a := public.jtext(p -> 'exclude_colors'); if a is not null then w := w || format('(l.exterior_color_family is null or not (l.exterior_color_family = any (%L::text[])))', a); end if;
  -- Must-have features are hard filters only when the source confirms features.
  a := public.jtext(p -> 'require_features'); if a is not null then w := w || format('(not l.features_verified or l.features @> %L::text[])', a); end if;
  a := public.jtext(p -> 'seller_types');   if a is not null then w := w || format('l.seller_type = any (%L::text[])', a); end if;
  a := public.jtext(p -> 'exclude_ids');
  if a is not null then w := w || format('not (l.id = any (%L::uuid[]))', a::uuid[]); end if;

  if p_uid is not null then
    w := w || format('(l.private_seller_id is null or l.private_seller_id <> %L::uuid)', p_uid);
    w := w || format($q$not exists (select 1 from public.swipes s where s.user_id = %L::uuid and s.listing_id = l.id and s.action <> 'undo' and s.undone_at is null)$q$, p_uid);
    w := w || format('not exists (select 1 from public.blocks b where b.user_id = %L::uuid and (b.blocked_dealership_id = l.dealership_id or b.blocked_user_id = l.private_seller_id))', p_uid);
  end if;
  return array_to_string(w, E'\n  and ');
end;
$$;

create or replace function public.deck_eligible(p_filters jsonb)
returns table (listing_id uuid, distance_mi double precision)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  return query execute format(
    'select l.id, st_distance(l.geog, st_setsrid(st_makepoint(%s, %s), 4326)::geography, false) / 1609.344
     from public.listings l where %s',
    (p_filters ->> 'lng')::float8, (p_filters ->> 'lat')::float8, public.deck_filter_sql(p_filters, auth.uid()));
end;
$$;

create or replace function public.deck_count(p_filters jsonb)
returns integer
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v integer;
begin
  execute format('select count(*)::integer from public.listings l where %s', public.deck_filter_sql(p_filters, auth.uid())) into v;
  return v;
end;
$$;

drop function public.deck_candidates(jsonb, integer, integer, uuid);
create or replace function public.deck_candidates(
  p_filters jsonb,
  p_limit integer default 300,
  p_explore integer default 100,
  p_anchor uuid default null
)
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
  is_exploration boolean, is_promoted boolean, total_eligible integer
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_taste extensions.vector;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_limit not between 1 and 1000 or p_explore not between 0 and 500 then
    raise exception 'limit out of range' using errcode = '22023';
  end if;

  -- Taste vector: an anchor car ("more like this") or mean(liked) - share * mean(passed).
  if p_anchor is not null then
    select e.embedding into v_taste from public.listing_embeddings e where e.listing_id = p_anchor;
  else
    select case
      when t.n_likes <= 0 or t.like_sum is null then null
      when t.n_passes > 0 and t.pass_sum is not null and vector_dims(t.pass_sum) = vector_dims(t.like_sum)
        then public.vec_scale(t.like_sum, 1.0 / t.n_likes)
           - public.vec_scale(t.pass_sum, public.config_number('learning', 'taste_pass_share', 0.3) / t.n_passes)
      else public.vec_scale(t.like_sum, 1.0 / t.n_likes)
    end into v_taste
    from public.taste_vectors t where t.user_id = v_uid;
  end if;

  return query execute format($sql$
    with ranked as materialized (
      select l.id,
        -- date_part() is double precision; extract() returns slower numeric.
        greatest(0, floor(date_part('epoch', now() - l.first_seen_at) / 86400))::integer as dom,
        coalesce(l.promoted_until > now(), false) as promoted,
        %4$s as visual_sim,
        coalesce(%4$s, 0) * 0.3
        + case l.deal_rating when 'great' then 0.4 when 'good' then 0.32 when 'fair' then 0.22
            when 'high' then 0.12 when 'overpriced' then 0.04 else 0.18 end
        + 0.3 * exp(-greatest(0, date_part('epoch', now() - l.first_seen_at)) / 3888000.0)
        -- Promoted cards reach the candidate pool; the app caps how often they show.
        + case when l.promoted_until > now() then 0.1 else 0 end as cheap_score
      from public.listings l
      %5$s
      where %1$s
    ),
    top_pick as materialized (
      select r.id, r.dom, r.promoted, r.visual_sim, false as is_exploration
      from ranked r order by r.cheap_score desc limit $2
    ),
    total as (select count(*) as n from ranked),
    explore_pick as (
      -- Sample about 4x what we need before the random sort, so large decks
      -- don't sort every eligible car.
      select r.id, r.dom, r.promoted, r.visual_sim, true as is_exploration
      from ranked r
      where random() < (select least(1.0, 4.0 * $3 / greatest(n, 1)) from total)
        and not exists (select 1 from top_pick tp where tp.id = r.id)
      order by random() limit $3
    ),
    picked as (
      select * from top_pick union all select * from explore_pick
    )
    select
      l.id, l.vin, l.year, l.make, l.model, l.trim_level, l.body_style, l.condition,
      l.price, l.msrp, l.expected_price, l.deal_rating, l.miles,
      l.exterior_color, l.exterior_color_family, l.interior_color, l.interior_material,
      l.fuel_type, l.drivetrain, l.transmission, l.engine, l.horsepower,
      l.mpg_city, l.mpg_hwy, l.ev_range_mi, l.seats, l.third_row,
      l.towing_lbs, l.features, l.features_verified, l.title_status,
      l.accident_count, l.owner_count, l.personal_use, l.open_recalls,
      p.dom,
      (select pc.old_price - pc.new_price from public.listing_price_changes pc
        where pc.listing_id = l.id and pc.new_price < pc.old_price
        order by pc.changed_at desc limit 1),
      coalesce((select array_agg(ph.url order by ph.position) from public.listing_photos ph where ph.listing_id = l.id), '{}'),
      l.photo_count, l.quality_score, l.seller_type, l.source, l.source_url, l.zip,
      l.dealership_id, d.name, d.doc_fee, d.lead_channel, d.response_time_minutes,
      st_distance(l.geog, st_setsrid(st_makepoint(%2$s, %3$s), 4326)::geography, false) / 1609.344,
      p.visual_sim, p.is_exploration, p.promoted, (select n from total)::integer
    from picked p
    join public.listings l on l.id = p.id
    left join public.dealerships d on d.id = l.dealership_id
  $sql$,
    public.deck_filter_sql(p_filters, v_uid),
    (p_filters ->> 'lng')::float8,
    (p_filters ->> 'lat')::float8,
    -- Visual similarity only once the buyer has a taste vector.
    case when v_taste is null then 'null::double precision'
      else '(case when e.embedding is not null and vector_dims(e.embedding) = vector_dims($1) then 1 - (e.embedding <=> $1) end)' end,
    case when v_taste is null then '' else 'left join public.listing_embeddings e on e.listing_id = l.id' end)
  using v_taste, p_limit, p_explore;
end;
$$;

revoke execute on function public.deck_filter_sql(jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.deck_eligible(jsonb) from public, anon;
revoke execute on function public.deck_count(jsonb) from public, anon;
revoke execute on function public.deck_candidates(jsonb, integer, integer, uuid) from public, anon;
grant execute on function public.deck_eligible(jsonb) to authenticated;
grant execute on function public.deck_count(jsonb) to authenticated;
grant execute on function public.deck_candidates(jsonb, integer, integer, uuid) to authenticated;
