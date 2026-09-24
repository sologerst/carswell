-- CarSwipe schema, part 7: the functions that enforce the core rules.
--   record_swipes   - the only way swipes are written; safe to replay offline
--   deck_candidates - pass 1 of ranking (hard filters in SQL)
--   send_offer / pick_offer / decline_offer / mark_purchased - the offer flow
--   dealer_leads    - dealer inbox; buyer contact only after a match
--   run_maintenance / refresh_market_stats - scheduled jobs

-- Attributes tallied for learned taste --------------------------------------
create or replace function public.listing_attributes(l public.listings)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array_remove(array[
    'make:' || l.make,
    'model:' || l.make || ' ' || l.model,
    'body:' || l.body_style,
    'color:' || l.exterior_color_family,
    'fuel:' || l.fuel_type,
    'drive:' || l.drivetrain,
    'condition:' || l.condition,
    'interior:' || l.interior_material
  ], null) || coalesce((select array_agg('feature:' || f) from unnest(l.features) f), '{}'::text[]);
$$;

create or replace function public.config_number(p_key text, p_path text, p_default double precision)
returns double precision
language sql
stable
set search_path = ''
as $$
  select coalesce((select (c.value ->> p_path)::double precision from public.app_config c where c.key = p_key), p_default);
$$;

-- Add (or with negative weights, remove) a swipe's contribution to affinity
-- tallies. Tallies are capped so taste keeps adapting.
create or replace function public.apply_affinity(p_user uuid, p_attrs text[], p_like real, p_pass real)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap real := public.config_number('learning', 'affinity_cap', 30);
begin
  insert into public.user_affinities as a (user_id, attribute, likes, passes)
  select p_user, attr, greatest(p_like, 0), greatest(p_pass, 0) from unnest(p_attrs) attr
  on conflict (user_id, attribute) do update set
    likes = greatest(a.likes + p_like, 0),
    passes = greatest(a.passes + p_pass, 0),
    updated_at = now();

  update public.user_affinities a set
    likes = a.likes * v_cap / (a.likes + a.passes),
    passes = a.passes * v_cap / (a.likes + a.passes)
  where a.user_id = p_user and a.attribute = any(p_attrs) and a.likes + a.passes > v_cap;
end;
$$;

-- Add (sign = 1) or remove (sign = -1) a listing's embedding from the taste sums.
create or replace function public.apply_taste(p_user uuid, p_listing uuid, p_is_like boolean, p_weight real)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_emb extensions.vector;
begin
  select e.embedding into v_emb from public.listing_embeddings e where e.listing_id = p_listing;
  if v_emb is null then return; end if;

  insert into public.taste_vectors (user_id) values (p_user) on conflict (user_id) do nothing;

  if p_is_like then
    update public.taste_vectors t set
      like_sum = case when t.like_sum is null or vector_dims(t.like_sum) <> vector_dims(v_emb)
        then public.vec_scale(v_emb, p_weight) else t.like_sum + public.vec_scale(v_emb, p_weight) end,
      n_likes = greatest(t.n_likes + p_weight, 0),
      updated_at = now()
    where t.user_id = p_user;
  else
    update public.taste_vectors t set
      pass_sum = case when t.pass_sum is null or vector_dims(t.pass_sum) <> vector_dims(v_emb)
        then public.vec_scale(v_emb, p_weight) else t.pass_sum + public.vec_scale(v_emb, p_weight) end,
      n_passes = greatest(t.n_passes + p_weight, 0),
      updated_at = now()
    where t.user_id = p_user;
  end if;
end;
$$;

-- Buyer intent snapshot sent to dealers (no contact details).
create or replace function public.build_dossier(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'first_name', p.first_name,
    'zip', p.zip,
    'preferences', coalesce((
      select jsonb_object_agg(bp.key, bp.value)
      from public.buyer_preferences bp
      where bp.user_id = p_user and bp.key in (
        'budget_mode', 'max_cash_price', 'max_monthly_payment', 'down_payment', 'loan_term',
        'credit_tier', 'trade_in', 'financing_status', 'lease_or_buy', 'timeline', 'body_styles',
        'fuel_types', 'min_seats', 'drivetrains')
    ), '{}'::jsonb),
    'top_tastes', coalesce((
      select jsonb_agg(a.attribute order by a.likes desc)
      from (select ua.attribute, ua.likes from public.user_affinities ua
            where ua.user_id = p_user and ua.likes >= 2 and ua.likes > ua.passes
            order by ua.likes desc limit 5) a
    ), '[]'::jsonb),
    'swipe_count', p.swipe_count,
    'ai_summary', p.ai_summary
  )
  from public.profiles p where p.id = p_user;
$$;

create or replace function public.bump_listing_stat(p_listing uuid, p_action text, p_delta integer)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.listing_stats_daily as s (listing_id, day, likes, superlikes, passes)
  values (p_listing, current_date,
    case when p_action = 'like' then greatest(p_delta, 0) else 0 end,
    case when p_action = 'superlike' then greatest(p_delta, 0) else 0 end,
    case when p_action = 'pass' then greatest(p_delta, 0) else 0 end)
  on conflict (listing_id, day) do update set
    likes = greatest(s.likes + case when p_action = 'like' then p_delta else 0 end, 0),
    superlikes = greatest(s.superlikes + case when p_action = 'superlike' then p_delta else 0 end, 0),
    passes = greatest(s.passes + case when p_action = 'pass' then p_delta else 0 end, 0);
$$;

-- record_swipes ---------------------------------------------------------------
-- p_swipes: [{client_id, listing_id, action, swiped_at?, position?, exploration?,
--             score?, undo_of?, test_drive_windows?}]
-- Returns [{client_id, status, interest_id?}] where status is one of
-- ok | duplicate | limit | downgraded | invalid | not_found.
create or replace function public.record_swipes(p_swipes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_results jsonb := '[]'::jsonb;
  v_client uuid;
  v_action text;
  v_listing public.listings%rowtype;
  v_dealer public.dealerships%rowtype;
  v_swipe_id bigint;
  v_target public.swipes%rowtype;
  v_interest_id uuid;
  v_status text;
  v_like_limit integer := public.config_number('limits', 'likes_per_day', 150)::integer;
  v_super_limit integer := public.config_number('limits', 'superlikes_per_day', 3)::integer;
  v_pass_weight real := public.config_number('learning', 'pass_weight', 0.5);
  v_super_weight real := public.config_number('learning', 'superlike_weight', 2);
  v_likes_today integer;
  v_supers_today integer;
  v_weight real;
  v_channel text;
  v_sla interval;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_swipes is null or jsonb_typeof(p_swipes) <> 'array' or jsonb_array_length(p_swipes) > 200 then
    raise exception 'record_swipes expects an array of at most 200 swipes' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_swipes) loop
    v_status := 'ok';
    v_interest_id := null;
    begin
      v_client := (v_item ->> 'client_id')::uuid;
      v_action := v_item ->> 'action';
    exception when others then
      v_results := v_results || jsonb_build_object('client_id', v_item ->> 'client_id', 'status', 'invalid');
      continue;
    end;
    if v_client is null or v_action is null or v_action not in ('pass', 'like', 'superlike', 'undo') then
      v_results := v_results || jsonb_build_object('client_id', v_item ->> 'client_id', 'status', 'invalid');
      continue;
    end if;

    -- Replays of an already-recorded swipe are no-ops.
    if exists (select 1 from public.swipes s where s.user_id = v_uid and s.client_id = v_client) then
      v_results := v_results || jsonb_build_object('client_id', v_client, 'status', 'duplicate');
      continue;
    end if;

    -- Undo -------------------------------------------------------------------
    if v_action = 'undo' then
      insert into public.swipes (user_id, listing_id, action, client_id, undo_of, swiped_at)
      values (v_uid, null, 'undo', v_client, (v_item ->> 'undo_of')::uuid,
        coalesce((v_item ->> 'swiped_at')::timestamptz, now()))
      on conflict (user_id, client_id) do nothing
      returning id into v_swipe_id;

      if v_swipe_id is null then
        v_results := v_results || jsonb_build_object('client_id', v_client, 'status', 'duplicate');
        continue;
      end if;

      select * into v_target from public.swipes s
      where s.user_id = v_uid and s.client_id = (v_item ->> 'undo_of')::uuid
        and s.action <> 'undo' and s.undone_at is null;
      if not found then
        v_results := v_results || jsonb_build_object('client_id', v_client, 'status', 'not_found');
        continue;
      end if;

      update public.swipes set undone_at = now() where id = v_target.id;
      update public.profiles set swipe_count = greatest(swipe_count - 1, 0) where id = v_uid;
      select * into v_listing from public.listings where id = v_target.listing_id;
      if found then
        v_weight := case v_target.action when 'superlike' then v_super_weight when 'like' then 1 else v_pass_weight end;
        if v_target.action = 'pass' then
          perform public.apply_affinity(v_uid, public.listing_attributes(v_listing), 0, -v_weight);
          perform public.apply_taste(v_uid, v_listing.id, false, -1);
        else
          perform public.apply_affinity(v_uid, public.listing_attributes(v_listing), -v_weight, 0);
          perform public.apply_taste(v_uid, v_listing.id, true, -v_weight);
        end if;
        perform public.bump_listing_stat(v_listing.id, v_target.action, -1);
      end if;
      -- Withdraw a like that no dealer has seen or answered yet.
      delete from public.interests i
      where i.user_id = v_uid and i.swipe_client_id = v_target.client_id and i.status = 'sent'
        and not exists (select 1 from public.offers o where o.interest_id = i.id)
        and not exists (select 1 from public.lead_deliveries d where d.interest_id = i.id and d.status = 'sent');
      v_results := v_results || jsonb_build_object('client_id', v_client, 'status', 'ok');
      continue;
    end if;

    -- Pass / like / super-like ----------------------------------------------
    select * into v_listing from public.listings where id = (v_item ->> 'listing_id')::uuid;
    if not found then
      v_results := v_results || jsonb_build_object('client_id', v_client, 'status', 'not_found');
      continue;
    end if;

    if v_action in ('like', 'superlike') then
      select
        count(*) filter (where s.action in ('like', 'superlike')),
        count(*) filter (where s.action = 'superlike')
      into v_likes_today, v_supers_today
      from public.swipes s
      where s.user_id = v_uid and s.undone_at is null and s.received_at >= date_trunc('day', now());

      if v_likes_today >= v_like_limit then
        v_results := v_results || jsonb_build_object('client_id', v_client, 'status', 'limit');
        continue;
      end if;
      if v_action = 'superlike' and v_supers_today >= v_super_limit then
        v_action := 'like';
        v_status := 'downgraded';
      end if;
    end if;

    insert into public.swipes (user_id, listing_id, action, client_id, position, was_exploration, score, swiped_at)
    values (v_uid, v_listing.id, v_action, v_client,
      (v_item ->> 'position')::integer,
      coalesce((v_item ->> 'exploration')::boolean, false),
      (v_item ->> 'score')::real,
      coalesce((v_item ->> 'swiped_at')::timestamptz, now()))
    on conflict (user_id, client_id) do nothing
    returning id into v_swipe_id;

    if v_swipe_id is null then
      v_results := v_results || jsonb_build_object('client_id', v_client, 'status', 'duplicate');
      continue;
    end if;

    update public.profiles set swipe_count = swipe_count + 1 where id = v_uid;
    perform public.bump_listing_stat(v_listing.id, v_action, 1);

    if v_action = 'pass' then
      perform public.apply_affinity(v_uid, public.listing_attributes(v_listing), 0, v_pass_weight);
      perform public.apply_taste(v_uid, v_listing.id, false, 1);
    else
      v_weight := case when v_action = 'superlike' then v_super_weight else 1 end;
      perform public.apply_affinity(v_uid, public.listing_attributes(v_listing), v_weight, 0);
      perform public.apply_taste(v_uid, v_listing.id, true, v_weight);

      -- A like becomes an interest routed to the car's dealer.
      v_channel := 'saved';
      v_sla := null;
      if v_listing.dealership_id is not null then
        select * into v_dealer from public.dealerships where id = v_listing.dealership_id;
        if v_dealer.lead_channel = 'inbox' then
          v_channel := 'inbox';
          v_sla := make_interval(hours => public.config_number('limits', 'dealer_reply_hours', 48)::integer);
        elsif v_dealer.lead_channel = 'email' then
          v_channel := 'email_adf';
          v_sla := make_interval(days => public.config_number('limits', 'offplatform_reply_days', 14)::integer);
        end if;
      end if;

      if v_listing.is_active then
        insert into public.interests as i (user_id, listing_id, dealership_id, swipe_client_id, kind,
          test_drive_windows, dossier, sla_expires_at)
        values (v_uid, v_listing.id, v_listing.dealership_id, v_client, v_action,
          v_item -> 'test_drive_windows', public.build_dossier(v_uid),
          case when v_sla is null then null else now() + v_sla end)
        on conflict (user_id, listing_id) do update set
          kind = case when excluded.kind = 'superlike' then 'superlike' else i.kind end,
          test_drive_windows = coalesce(excluded.test_drive_windows, i.test_drive_windows),
          swipe_client_id = excluded.swipe_client_id,
          status = case when i.status = 'withdrawn' then 'sent' else i.status end
        returning i.id into v_interest_id;

        if not exists (select 1 from public.lead_deliveries d where d.interest_id = v_interest_id) then
          insert into public.lead_deliveries (interest_id, dealership_id, channel, status)
          values (v_interest_id, v_listing.dealership_id, v_channel,
            case when v_channel = 'saved' then 'skipped' else 'pending' end);
        end if;

        if v_channel = 'inbox' then
          insert into public.notifications (user_id, kind, title, body, url)
          select m.user_id, 'new_lead',
            case when v_action = 'superlike' then 'Test-drive request' else 'New buyer interest' end,
            v_listing.year || ' ' || v_listing.make || ' ' || v_listing.model,
            '/dealer/leads/' || v_interest_id
          from public.dealership_members m where m.dealership_id = v_listing.dealership_id;
        end if;
      else
        v_status := 'unavailable';
      end if;
    end if;

    v_results := v_results || jsonb_strip_nulls(jsonb_build_object(
      'client_id', v_client, 'status', v_status, 'interest_id', v_interest_id));
  end loop;

  return v_results;
end;
$$;

-- Onboarding taste check: "which looks better?" seeds the taste vector.
create or replace function public.seed_taste(p_chosen uuid[], p_rejected uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if coalesce(array_length(p_chosen, 1), 0) > 10 or coalesce(array_length(p_rejected, 1), 0) > 10 then
    raise exception 'too many taste picks' using errcode = '22023';
  end if;
  foreach v_id in array coalesce(p_chosen, '{}') loop
    perform public.apply_taste(v_uid, v_id, true, 1);
  end loop;
  foreach v_id in array coalesce(p_rejected, '{}') loop
    perform public.apply_taste(v_uid, v_id, false, 1);
  end loop;
end;
$$;

-- deck_candidates -------------------------------------------------------------
-- Pass 1 of ranking. Runs as the caller, so RLS still applies. p_filters is
-- built by the app from the buyer's tiers (src/lib/deck/filters.ts):
--   lat, lng, radius_mi, max_price, conditions[], year_min, year_max,
--   body_styles[], max_miles, fuel_types[], drivetrains[], transmissions[],
--   min_seats, require_third_row, include_makes[], exclude_makes[],
--   exclude_colors[], require_clean_title, require_no_accidents, max_owners,
--   require_features[], seller_types[], min_ev_range, min_towing, exclude_ids[]
create or replace function public.deck_eligible(p_filters jsonb)
returns table (listing_id uuid, distance_mi double precision)
language sql
stable
set search_path = public, extensions
as $$
  with f as (
    select
      p_filters as j,
      st_setsrid(st_makepoint((p_filters ->> 'lng')::float8, (p_filters ->> 'lat')::float8), 4326)::geography as origin,
      coalesce((p_filters ->> 'radius_mi')::float8, 40) * 1609.344 as radius_m,
      public.jtext(p_filters -> 'conditions') as conditions,
      public.jtext(p_filters -> 'body_styles') as body_styles,
      public.jtext(p_filters -> 'fuel_types') as fuel_types,
      public.jtext(p_filters -> 'drivetrains') as drivetrains,
      public.jtext(p_filters -> 'transmissions') as transmissions,
      public.jtext(p_filters -> 'include_makes') as include_makes,
      public.jtext(p_filters -> 'exclude_makes') as exclude_makes,
      public.jtext(p_filters -> 'exclude_colors') as exclude_colors,
      public.jtext(p_filters -> 'require_features') as require_features,
      public.jtext(p_filters -> 'seller_types') as seller_types,
      coalesce(public.jtext(p_filters -> 'exclude_ids')::uuid[], '{}'::uuid[]) as exclude_ids
  )
  select l.id, st_distance(l.geog, f.origin) / 1609.344
  from public.listings l
  cross join f
  where l.is_active and l.is_canonical
    and st_dwithin(l.geog, f.origin, f.radius_m)
    and ((f.j ->> 'max_price') is null or l.price <= (f.j ->> 'max_price')::numeric)
    and (f.conditions is null or l.condition = any (f.conditions))
    and ((f.j ->> 'year_min') is null or l.year >= (f.j ->> 'year_min')::int)
    and ((f.j ->> 'year_max') is null or l.year <= (f.j ->> 'year_max')::int)
    and (f.body_styles is null or l.body_style = any (f.body_styles))
    and ((f.j ->> 'max_miles') is null or l.miles <= (f.j ->> 'max_miles')::int)
    and (f.fuel_types is null or l.fuel_type = any (f.fuel_types))
    and (f.drivetrains is null or l.drivetrain is null or l.drivetrain = any (f.drivetrains))
    and (f.transmissions is null or l.transmission is null or l.transmission = any (f.transmissions))
    and ((f.j ->> 'min_seats') is null or l.seats is null or l.seats >= (f.j ->> 'min_seats')::int)
    and (not coalesce((f.j ->> 'require_third_row')::boolean, false) or l.third_row is distinct from false)
    and (f.include_makes is null or l.make = any (f.include_makes))
    and (f.exclude_makes is null or not (l.make = any (f.exclude_makes)))
    and (f.exclude_colors is null or l.exterior_color_family is null or not (l.exterior_color_family = any (f.exclude_colors)))
    -- Missing history passes with a "not reported" badge; only known-bad is removed.
    and (not coalesce((f.j ->> 'require_clean_title')::boolean, false) or l.title_status is null or l.title_status = 'clean')
    and (not coalesce((f.j ->> 'require_no_accidents')::boolean, false) or l.accident_count is null or l.accident_count = 0)
    and ((f.j ->> 'max_owners') is null or l.owner_count is null or l.owner_count <= (f.j ->> 'max_owners')::int)
    -- Must-have features are hard filters only when the source confirms features.
    and (f.require_features is null or not l.features_verified or l.features @> f.require_features)
    and (f.seller_types is null or l.seller_type = any (f.seller_types))
    and ((f.j ->> 'min_ev_range') is null or l.fuel_type <> 'electric' or l.ev_range_mi is null
         or l.ev_range_mi >= (f.j ->> 'min_ev_range')::int)
    and ((f.j ->> 'min_towing') is null or l.towing_lbs is null or l.towing_lbs >= (f.j ->> 'min_towing')::int)
    and not (l.id = any (f.exclude_ids))
    and (l.private_seller_id is null or l.private_seller_id <> auth.uid())
    and not exists (
      select 1 from public.swipes s
      where s.user_id = auth.uid() and s.listing_id = l.id and s.action <> 'undo' and s.undone_at is null
    )
    and not exists (
      select 1 from public.blocks b
      where b.user_id = auth.uid() and b.blocked_dealership_id = l.dealership_id
    );
$$;

create or replace function public.deck_count(p_filters jsonb)
returns integer
language sql
stable
set search_path = public, extensions
as $$
  select count(*)::integer from public.deck_eligible(p_filters);
$$;

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
  is_exploration boolean
)
language sql
stable
set search_path = public, extensions
as $$
  with taste as (
    select case
      when p_anchor is not null then (select e.embedding from public.listing_embeddings e where e.listing_id = p_anchor)
      else (
        select case
          when t.n_likes <= 0 or t.like_sum is null then null
          when t.n_passes > 0 and t.pass_sum is not null and vector_dims(t.pass_sum) = vector_dims(t.like_sum)
            then public.vec_scale(t.like_sum, 1.0 / t.n_likes)
               - public.vec_scale(t.pass_sum, public.config_number('learning', 'taste_pass_share', 0.3) / t.n_passes)
          else public.vec_scale(t.like_sum, 1.0 / t.n_likes)
        end
        from public.taste_vectors t where t.user_id = auth.uid()
      )
    end as v
  ),
  eligible as (
    select l.*, el.distance_mi,
      case when tv.v is not null and e.embedding is not null and vector_dims(e.embedding) = vector_dims(tv.v)
        then 1 - (e.embedding <=> tv.v) end as visual_sim,
      greatest(0, extract(day from now() - l.first_seen_at))::integer as dom
    from public.deck_eligible(p_filters) el
    join public.listings l on l.id = el.listing_id
    left join public.listing_embeddings e on e.listing_id = l.id
    cross join taste tv
  ),
  scored as (
    select el.*,
      coalesce(el.visual_sim, 0) * 0.3
      + case el.deal_rating when 'great' then 0.4 when 'good' then 0.32 when 'fair' then 0.22
          when 'high' then 0.12 when 'overpriced' then 0.04 else 0.18 end
      + 0.3 * exp(-el.dom / 45.0) as cheap_score
    from eligible el
  ),
  top_pick as (
    select s.*, false as is_exploration from scored s order by s.cheap_score desc limit p_limit
  ),
  explore_pick as (
    select s.*, true as is_exploration from scored s
    where s.id not in (select tp.id from top_pick tp)
    order by random() limit p_explore
  ),
  picked as (
    select * from top_pick union all select * from explore_pick
  )
  select
    p.id, p.vin, p.year, p.make, p.model, p.trim_level, p.body_style, p.condition,
    p.price, p.msrp, p.expected_price, p.deal_rating, p.miles,
    p.exterior_color, p.exterior_color_family, p.interior_color, p.interior_material,
    p.fuel_type, p.drivetrain, p.transmission, p.engine, p.horsepower,
    p.mpg_city, p.mpg_hwy, p.ev_range_mi, p.seats, p.third_row,
    p.towing_lbs, p.features, p.features_verified, p.title_status,
    p.accident_count, p.owner_count, p.personal_use, p.open_recalls,
    p.dom,
    (select pc.old_price - pc.new_price from public.listing_price_changes pc
      where pc.listing_id = p.id and pc.new_price < pc.old_price
      order by pc.changed_at desc limit 1),
    coalesce((select array_agg(ph.url order by ph.position) from public.listing_photos ph where ph.listing_id = p.id), '{}'),
    p.photo_count, p.quality_score, p.seller_type, p.source, p.source_url, p.zip,
    p.dealership_id, d.name, d.doc_fee, d.lead_channel, d.response_time_minutes,
    p.distance_mi, p.visual_sim, p.is_exploration
  from picked p
  left join public.dealerships d on d.id = p.dealership_id;
$$;

-- Offer flow -----------------------------------------------------------------
create or replace function public.send_offer(p_interest_id uuid, p_offer jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interest public.interests%rowtype;
  v_offer_id uuid;
  v_listing public.listings%rowtype;
begin
  select * into v_interest from public.interests where id = p_interest_id for update;
  if not found then raise exception 'lead not found' using errcode = 'P0002'; end if;
  if v_interest.dealership_id is null or not public.is_dealer_member(v_interest.dealership_id) then
    raise exception 'not a member of this dealership' using errcode = '42501';
  end if;
  if v_interest.status not in ('sent', 'offered', 'expired') then
    raise exception 'this lead can no longer receive offers' using errcode = 'P0001';
  end if;

  insert into public.offers (interest_id, dealership_id, created_by, source, vehicle_price, doc_fee,
    dealer_fees, tax, title_fees, trade_credit, otd_total, monthly_estimate, apr, term_months, notes, expires_at)
  values (p_interest_id, v_interest.dealership_id, auth.uid(), 'inbox',
    (p_offer ->> 'vehicle_price')::numeric,
    coalesce((p_offer ->> 'doc_fee')::numeric, 0),
    coalesce((p_offer ->> 'dealer_fees')::numeric, 0),
    coalesce((p_offer ->> 'tax')::numeric, 0),
    coalesce((p_offer ->> 'title_fees')::numeric, 0),
    coalesce((p_offer ->> 'trade_credit')::numeric, 0),
    (p_offer ->> 'otd_total')::numeric,
    (p_offer ->> 'monthly_estimate')::numeric,
    (p_offer ->> 'apr')::numeric,
    (p_offer ->> 'term_months')::integer,
    left(p_offer ->> 'notes', 2000),
    now() + make_interval(days => coalesce((p_offer ->> 'valid_days')::integer, 7)))
  returning id into v_offer_id;

  update public.interests set status = 'offered' where id = p_interest_id and status in ('sent', 'expired');
  update public.lead_deliveries set status = 'sent', sent_at = coalesce(sent_at, now())
  where interest_id = p_interest_id and status = 'pending';

  select * into v_listing from public.listings where id = v_interest.listing_id;
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_interest.user_id, 'new_offer', 'You have an offer',
    'Out-the-door offer on the ' || v_listing.year || ' ' || v_listing.make || ' ' || v_listing.model,
    '/offers#' || p_interest_id);

  return v_offer_id;
end;
$$;

create or replace function public.pick_offer(p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers%rowtype;
  v_interest public.interests%rowtype;
  v_conversation_id uuid;
  v_listing public.listings%rowtype;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found then raise exception 'offer not found' using errcode = 'P0002'; end if;
  select * into v_interest from public.interests where id = v_offer.interest_id for update;
  if v_interest.user_id is distinct from auth.uid() then
    raise exception 'not your offer' using errcode = '42501';
  end if;
  if v_offer.status <> 'active' or v_offer.expires_at < now() then
    raise exception 'this offer is no longer available' using errcode = 'P0001';
  end if;

  update public.offers set status = 'picked', picked_at = now() where id = p_offer_id;
  update public.offers set status = 'declined'
  where interest_id = v_interest.id and id <> p_offer_id and status = 'active';
  update public.interests set status = 'matched', matched_at = now() where id = v_interest.id;

  insert into public.conversations (interest_id, buyer_id, dealership_id)
  values (v_interest.id, v_interest.user_id, v_offer.dealership_id)
  on conflict (interest_id) do update set dealership_id = excluded.dealership_id
  returning id into v_conversation_id;

  select * into v_listing from public.listings where id = v_interest.listing_id;
  insert into public.messages (conversation_id, sender_id, sender_role, kind, body, meta)
  values (v_conversation_id, null, 'system', 'system',
    'Offer picked: $' || to_char(v_offer.otd_total, 'FM999,999,990') || ' out the door for the '
      || v_listing.year || ' ' || v_listing.make || ' ' || v_listing.model || '. Chat is open.',
    jsonb_build_object('offer_id', p_offer_id));

  insert into public.notifications (user_id, kind, title, body, url)
  select m.user_id, 'offer_picked', 'A buyer picked your offer',
    v_listing.year || ' ' || v_listing.make || ' ' || v_listing.model, '/dealer/leads/' || v_interest.id
  from public.dealership_members m where m.dealership_id = v_offer.dealership_id;

  return v_conversation_id;
end;
$$;

create or replace function public.decline_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers%rowtype;
  v_interest public.interests%rowtype;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found then raise exception 'offer not found' using errcode = 'P0002'; end if;
  select * into v_interest from public.interests where id = v_offer.interest_id for update;
  if v_interest.user_id is distinct from auth.uid() then
    raise exception 'not your offer' using errcode = '42501';
  end if;
  update public.offers set status = 'declined' where id = p_offer_id and status = 'active';
  if not exists (select 1 from public.offers o where o.interest_id = v_interest.id and o.status = 'active') then
    update public.interests set status = 'declined' where id = v_interest.id and status = 'offered';
  end if;
end;
$$;

-- "I bought it": proves the lead closed and credits the dealer.
create or replace function public.mark_purchased(p_interest_id uuid, p_price numeric default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interest public.interests%rowtype;
begin
  select * into v_interest from public.interests where id = p_interest_id for update;
  if not found or v_interest.user_id is distinct from auth.uid() then
    raise exception 'not your car' using errcode = '42501';
  end if;
  update public.interests set status = 'purchased' where id = p_interest_id;
  insert into public.purchases (user_id, interest_id, listing_id, dealership_id, price)
  values (v_interest.user_id, v_interest.id, v_interest.listing_id, v_interest.dealership_id, p_price)
  on conflict (user_id, interest_id) do update set price = coalesce(excluded.price, public.purchases.price);
end;
$$;

create or replace function public.review_seller(p_interest_id uuid, p_stars integer, p_comment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interest public.interests%rowtype;
begin
  select * into v_interest from public.interests where id = p_interest_id;
  if not found or v_interest.user_id is distinct from auth.uid() or v_interest.dealership_id is null then
    raise exception 'not your car' using errcode = '42501';
  end if;
  if v_interest.status not in ('matched', 'purchased') then
    raise exception 'you can review a seller after a match' using errcode = 'P0001';
  end if;
  insert into public.seller_reviews (user_id, dealership_id, interest_id, stars, comment)
  values (auth.uid(), v_interest.dealership_id, p_interest_id, p_stars, p_comment)
  on conflict (user_id, interest_id) do update set stars = excluded.stars, comment = excluded.comment;
  update public.dealerships d set
    rating = (select round(avg(r.stars)::numeric, 1) from public.seller_reviews r where r.dealership_id = d.id),
    review_count = (select count(*) from public.seller_reviews r where r.dealership_id = d.id)
  where d.id = v_interest.dealership_id;
end;
$$;

-- Buyer shares their phone with the dealer they matched with (per-dealer consent).
create or replace function public.share_phone(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.conversations%rowtype;
  v_phone text;
begin
  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found or v_conv.buyer_id is distinct from auth.uid() then
    raise exception 'not your conversation' using errcode = '42501';
  end if;
  select phone into v_phone from public.profiles where id = auth.uid();
  if v_phone is null then
    raise exception 'add a phone number in your profile first' using errcode = 'P0001';
  end if;
  update public.conversations set buyer_phone_shared_at = now() where id = p_conversation_id;
  insert into public.messages (conversation_id, sender_id, sender_role, kind, body)
  values (p_conversation_id, auth.uid(), 'buyer', 'phone_share', 'Shared phone number: ' || v_phone);
end;
$$;

-- Dealer inbox ---------------------------------------------------------------
create or replace function public.dealer_leads(p_dealership_id uuid)
returns table (
  interest_id uuid, status text, kind text, created_at timestamptz, sla_expires_at timestamptz,
  matched_at timestamptz, test_drive_windows jsonb, dossier jsonb, lead_summary text,
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
    i.dossier, i.lead_summary,
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

-- Claim a dealership from an ADF claim link.
create or replace function public.claim_dealership(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_claim public.dealership_claim_tokens%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_claim from public.dealership_claim_tokens
  where token_hash = encode(digest(p_token, 'sha256'), 'hex') for update;
  if not found or v_claim.expires_at < now() then
    raise exception 'this claim link is invalid or expired' using errcode = 'P0001';
  end if;
  insert into public.dealership_members (dealership_id, user_id, role)
  values (v_claim.dealership_id, auth.uid(),
    case when exists (select 1 from public.dealership_members m where m.dealership_id = v_claim.dealership_id)
      then 'staff' else 'owner' end)
  on conflict do nothing;
  update public.dealership_claim_tokens set claimed_by = auth.uid(), claimed_at = coalesce(claimed_at, now())
  where id = v_claim.id;
  update public.dealerships set claimed_at = coalesce(claimed_at, now()), lead_channel = 'inbox'
  where id = v_claim.dealership_id;
  return v_claim.dealership_id;
end;
$$;

-- Scheduled jobs (service role only) -----------------------------------------
create or replace function public.run_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired_interests integer;
  v_expired_offers integer;
  v_stale integer;
  v_unavailable integer;
begin
  update public.interests set status = 'expired'
  where status = 'sent' and sla_expires_at is not null and sla_expires_at < now();
  get diagnostics v_expired_interests = row_count;

  update public.offers set status = 'expired' where status = 'active' and expires_at < now();
  get diagnostics v_expired_offers = row_count;

  -- Removed after 2 missed sweeps.
  update public.listings set is_active = false, sold_at = coalesce(sold_at, now())
  where is_active and missed_sweeps >= 2;
  get diagnostics v_stale = row_count;

  update public.interests i set status = 'unavailable'
  from public.listings l
  where l.id = i.listing_id and not l.is_active and i.status in ('sent', 'offered', 'expired');
  get diagnostics v_unavailable = row_count;

  delete from public.listing_events where created_at < now() - interval '180 days';
  delete from public.rate_limits where window_start < now() - interval '2 days';

  return jsonb_build_object('expired_interests', v_expired_interests, 'expired_offers', v_expired_offers,
    'stale_listings', v_stale, 'unavailable_interests', v_unavailable);
end;
$$;

-- Nightly price-vs-miles regression per year/make/model/trim, then deal bands:
-- Great 10%+ below expected, Good 3-10%, Fair within 3%, High 3-10% above,
-- Overpriced more than 10% above.
create or replace function public.refresh_market_stats()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  delete from public.market_price_stats where true;
  insert into public.market_price_stats (market_id, year, make, model, trim_level, n, slope_per_mile, intercept, median_price)
  select l.market_id, l.year, l.make, l.model, coalesce(l.trim_level, ''), count(*),
    regr_slope(l.price, l.miles), regr_intercept(l.price, l.miles),
    percentile_cont(0.5) within group (order by l.price)
  from public.listings l
  where l.is_active and l.is_canonical and l.condition <> 'new'
  group by l.market_id, l.year, l.make, l.model, coalesce(l.trim_level, '')
  having count(*) >= 4;

  -- Fall back to year/make/model when a trim has too few comps.
  insert into public.market_price_stats (market_id, year, make, model, trim_level, n, slope_per_mile, intercept, median_price)
  select l.market_id, l.year, l.make, l.model, '*', count(*),
    regr_slope(l.price, l.miles), regr_intercept(l.price, l.miles),
    percentile_cont(0.5) within group (order by l.price)
  from public.listings l
  where l.is_active and l.is_canonical and l.condition <> 'new'
  group by l.market_id, l.year, l.make, l.model
  having count(*) >= 4;

  -- Model-level estimate first, then the trim-level one where there are enough comps.
  update public.listings l set expected_price = round((s.intercept + s.slope_per_mile * l.miles)::numeric, 2)
  from public.market_price_stats s
  where s.trim_level = '*' and s.market_id is not distinct from l.market_id and s.year = l.year
    and s.make = l.make and s.model = l.model
    and s.slope_per_mile is not null and s.slope_per_mile < 0
    and l.is_active and l.condition <> 'new';

  update public.listings l set expected_price = round((s.intercept + s.slope_per_mile * l.miles)::numeric, 2)
  from public.market_price_stats s
  where s.trim_level = coalesce(l.trim_level, '') and s.market_id is not distinct from l.market_id and s.year = l.year
    and s.make = l.make and s.model = l.model
    and s.slope_per_mile is not null and s.slope_per_mile < 0
    and l.is_active and l.condition <> 'new';

  update public.listings set deal_rating = case
      when expected_price is null or expected_price <= 0 then null
      when price <= expected_price * 0.90 then 'great'
      when price <= expected_price * 0.97 then 'good'
      when price <= expected_price * 1.03 then 'fair'
      when price <= expected_price * 1.10 then 'high'
      else 'overpriced' end
  where is_active;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Lock down execution. Buyer/dealer RPCs require a signed-in user; jobs and
-- internal helpers are service-role only.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.record_swipes(jsonb) to authenticated;
grant execute on function public.seed_taste(uuid[], uuid[]) to authenticated;
grant execute on function public.deck_eligible(jsonb) to authenticated;
grant execute on function public.deck_count(jsonb) to authenticated;
grant execute on function public.deck_candidates(jsonb, integer, integer, uuid) to authenticated;
grant execute on function public.send_offer(uuid, jsonb) to authenticated;
grant execute on function public.pick_offer(uuid) to authenticated;
grant execute on function public.decline_offer(uuid) to authenticated;
grant execute on function public.mark_purchased(uuid, numeric) to authenticated;
grant execute on function public.review_seller(uuid, integer, text) to authenticated;
grant execute on function public.share_phone(uuid) to authenticated;
grant execute on function public.dealer_leads(uuid) to authenticated;
grant execute on function public.claim_dealership(text) to authenticated;
-- Called by RLS policies that anon also evaluates (both return false for anon).
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_dealer_member(uuid) to anon, authenticated;
grant execute on function public.is_conversation_participant(uuid) to authenticated;
grant execute on function public.jtext(jsonb) to authenticated;
grant execute on function public.vec_scale(extensions.vector, double precision) to authenticated;
grant execute on function public.config_number(text, text, double precision) to authenticated;
revoke execute on function public.apply_affinity(uuid, text[], real, real) from authenticated;
revoke execute on function public.apply_taste(uuid, uuid, boolean, real) from authenticated;
revoke execute on function public.build_dossier(uuid) from authenticated;
revoke execute on function public.bump_listing_stat(uuid, text, integer) from authenticated;
revoke execute on function public.run_maintenance() from authenticated;
revoke execute on function public.refresh_market_stats() from authenticated;
