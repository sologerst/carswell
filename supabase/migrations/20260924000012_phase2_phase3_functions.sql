-- CarSwipe schema, part 12: Phase 2 and Phase 3 functions.
--   record_swipes      - likes on private listings route to the seller (72 h)
--   send_offer / pick_offer / mark_purchased - private sellers + counteroffers
--   send_counter / respond_counter - negotiator v2
--   seller_leads       - private seller inbox (buyer contact never revealed)
--   create_dealership / dealer invites - self-serve dealer portal
--   deck_*             - moderation gate, promoted listings
--   refresh_demand_insights / rollup_listing_events / refresh_dealer_stats
--   run_maintenance    - adds "Did you buy it?" prompts

-- Private-seller dossier: less than a dealer sees (no budget or credit details).
create or replace function public.build_private_dossier(p_user uuid)
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
      where bp.user_id = p_user and bp.key in ('financing_status', 'budget_mode', 'timeline')
    ), '{}'::jsonb),
    'swipe_count', p.swipe_count
  )
  from public.profiles p where p.id = p_user;
$$;

-- record_swipes ---------------------------------------------------------------
-- Same contract as part 7. New: private listings route to the seller's inbox
-- with a 72 h reply window (app_config limits.private_reply_hours).
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
  v_seller uuid;
  v_title text;
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
      -- Withdraw a like that no seller has seen or answered yet.
      delete from public.interests i
      where i.user_id = v_uid and i.swipe_client_id = v_target.client_id and i.status = 'sent'
        and not exists (select 1 from public.offers o where o.interest_id = i.id)
        and not exists (select 1 from public.lead_deliveries d where d.interest_id = i.id and d.status = 'sent');
      v_results := v_results || jsonb_build_object('client_id', v_client, 'status', 'ok');
      continue;
    end if;

    -- Pass / like / super-like ----------------------------------------------
    select * into v_listing from public.listings where id = (v_item ->> 'listing_id')::uuid;
    if not found or v_listing.review_status <> 'approved' then
      v_results := v_results || jsonb_build_object('client_id', v_client, 'status', 'not_found');
      continue;
    end if;
    if v_listing.private_seller_id = v_uid then
      v_results := v_results || jsonb_build_object('client_id', v_client, 'status', 'invalid');
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

      -- A like becomes an interest routed to the car's seller.
      v_channel := 'saved';
      v_sla := null;
      v_seller := null;
      if v_listing.private_seller_id is not null and v_listing.source = 'private' then
        v_channel := 'seller_inbox';
        v_seller := v_listing.private_seller_id;
        v_sla := make_interval(hours => public.config_number('limits', 'private_reply_hours', 72)::integer);
      elsif v_listing.dealership_id is not null then
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
        insert into public.interests as i (user_id, listing_id, dealership_id, seller_user_id, swipe_client_id, kind,
          test_drive_windows, dossier, sla_expires_at)
        values (v_uid, v_listing.id, case when v_seller is null then v_listing.dealership_id end, v_seller, v_client, v_action,
          v_item -> 'test_drive_windows',
          case when v_seller is null then public.build_dossier(v_uid) else public.build_private_dossier(v_uid) end,
          case when v_sla is null then null else now() + v_sla end)
        on conflict (user_id, listing_id) do update set
          kind = case when excluded.kind = 'superlike' then 'superlike' else i.kind end,
          test_drive_windows = coalesce(excluded.test_drive_windows, i.test_drive_windows),
          swipe_client_id = excluded.swipe_client_id,
          status = case when i.status = 'withdrawn' then 'sent' else i.status end
        returning i.id into v_interest_id;

        if not exists (select 1 from public.lead_deliveries d where d.interest_id = v_interest_id) then
          insert into public.lead_deliveries (interest_id, dealership_id, channel, status)
          values (v_interest_id, case when v_seller is null then v_listing.dealership_id end, v_channel,
            case when v_channel = 'saved' then 'skipped' else 'pending' end);
        end if;

        v_title := v_listing.year || ' ' || v_listing.make || ' ' || v_listing.model;
        if v_channel = 'inbox' then
          insert into public.notifications (user_id, kind, title, body, url)
          select m.user_id, 'new_lead',
            case when v_action = 'superlike' then 'Test-drive request' else 'New buyer interest' end,
            v_title, '/dealer/leads/' || v_interest_id
          from public.dealership_members m where m.dealership_id = v_listing.dealership_id;
        elsif v_channel = 'seller_inbox' then
          insert into public.notifications (user_id, kind, title, body, url)
          values (v_seller, 'new_lead',
            case when v_action = 'superlike' then 'A buyer wants to see your car' else 'A buyer likes your car' end,
            v_title, '/sell/leads/' || v_interest_id);
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

-- Offer flow -------------------------------------------------------------------
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
  v_otd numeric := (p_offer ->> 'otd_total')::numeric;
  v_private boolean;
begin
  select * into v_interest from public.interests where id = p_interest_id for update;
  if not found then raise exception 'lead not found' using errcode = 'P0002'; end if;
  v_private := v_interest.seller_user_id is not null;
  if v_private then
    if v_interest.seller_user_id is distinct from auth.uid() then
      raise exception 'not your listing' using errcode = '42501';
    end if;
  elsif v_interest.dealership_id is null or not public.is_dealer_member(v_interest.dealership_id) then
    raise exception 'not a member of this dealership' using errcode = '42501';
  end if;
  if v_interest.status not in ('sent', 'offered', 'expired') then
    raise exception 'this lead can no longer receive offers' using errcode = 'P0001';
  end if;

  insert into public.offers (interest_id, dealership_id, seller_user_id, created_by, source, vehicle_price, doc_fee,
    dealer_fees, tax, title_fees, trade_credit, otd_total, monthly_estimate, apr, term_months, lender, down_payment,
    notes, expires_at)
  values (p_interest_id, v_interest.dealership_id, v_interest.seller_user_id, auth.uid(), 'inbox',
    (p_offer ->> 'vehicle_price')::numeric,
    case when v_private then 0 else coalesce((p_offer ->> 'doc_fee')::numeric, 0) end,
    case when v_private then 0 else coalesce((p_offer ->> 'dealer_fees')::numeric, 0) end,
    coalesce((p_offer ->> 'tax')::numeric, 0),
    coalesce((p_offer ->> 'title_fees')::numeric, 0),
    coalesce((p_offer ->> 'trade_credit')::numeric, 0),
    v_otd,
    (p_offer ->> 'monthly_estimate')::numeric,
    (p_offer ->> 'apr')::numeric,
    (p_offer ->> 'term_months')::integer,
    left(p_offer ->> 'lender', 120),
    (p_offer ->> 'down_payment')::numeric,
    left(p_offer ->> 'notes', 2000),
    now() + make_interval(days => least(greatest(coalesce((p_offer ->> 'valid_days')::integer, 7), 1), 30)))
  returning id into v_offer_id;

  -- A new offer answers any open counteroffer.
  update public.counteroffers set
    status = case when v_otd <= amount_otd then 'accepted' else 'superseded' end,
    responded_at = now()
  where interest_id = p_interest_id and status = 'open';

  update public.interests set status = 'offered' where id = p_interest_id and status in ('sent', 'expired');
  update public.lead_deliveries set status = 'sent', sent_at = coalesce(sent_at, now())
  where interest_id = p_interest_id and status = 'pending';

  select * into v_listing from public.listings where id = v_interest.listing_id;
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_interest.user_id, 'new_offer',
    case when v_private then 'The seller sent you a price' else 'You have an offer' end,
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
  v_title text;
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
  update public.counteroffers set status = 'superseded', responded_at = now()
  where interest_id = v_interest.id and status = 'open';
  update public.interests set status = 'matched', matched_at = now() where id = v_interest.id;

  insert into public.conversations (interest_id, buyer_id, dealership_id, seller_user_id)
  values (v_interest.id, v_interest.user_id, v_offer.dealership_id, v_offer.seller_user_id)
  on conflict (interest_id) do update set dealership_id = excluded.dealership_id, seller_user_id = excluded.seller_user_id
  returning id into v_conversation_id;

  select * into v_listing from public.listings where id = v_interest.listing_id;
  v_title := v_listing.year || ' ' || v_listing.make || ' ' || v_listing.model;
  insert into public.messages (conversation_id, sender_id, sender_role, kind, body, meta)
  values (v_conversation_id, null, 'system', 'system',
    'Offer picked: $' || to_char(v_offer.otd_total, 'FM999,999,990') || ' out the door for the '
      || v_title || '. Chat is open.',
    jsonb_build_object('offer_id', p_offer_id));

  if v_offer.seller_user_id is not null then
    -- Private sales: meet-up and payment safety tips, pinned at the top of the chat.
    insert into public.messages (conversation_id, sender_id, sender_role, kind, body, meta)
    values (v_conversation_id, null, 'system', 'safety',
      'Private-sale safety: meet in daylight at a public place (many police stations have safe exchange zones). '
      || 'Check that the name on the title matches the seller''s ID and the VIN on the car matches the title. '
      || 'Never pay with gift cards, wire transfers or crypto, and never pay before you see the car. '
      || 'Use a cashier''s check from your bank, or meet at your bank.',
      jsonb_build_object('tips', 'private_sale'));
    insert into public.notifications (user_id, kind, title, body, url)
    values (v_offer.seller_user_id, 'offer_picked', 'The buyer accepted your price', v_title, '/sell/leads/' || v_interest.id);
  else
    insert into public.notifications (user_id, kind, title, body, url)
    select m.user_id, 'offer_picked', 'A buyer picked your offer', v_title, '/dealer/leads/' || v_interest.id
    from public.dealership_members m where m.dealership_id = v_offer.dealership_id;
  end if;

  return v_conversation_id;
end;
$$;

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
  insert into public.purchases (user_id, interest_id, listing_id, dealership_id, seller_user_id, price)
  values (v_interest.user_id, v_interest.id, v_interest.listing_id, v_interest.dealership_id, v_interest.seller_user_id, p_price)
  on conflict (user_id, interest_id) do update set price = coalesce(excluded.price, public.purchases.price);
  if v_interest.seller_user_id is not null then
    update public.listings set is_active = false, sold_at = coalesce(sold_at, now())
    where id = v_interest.listing_id and private_seller_id = v_interest.seller_user_id;
  end if;
end;
$$;

-- Buyer notes reach private sellers too.
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
  if v_interest.seller_user_id is not null then
    insert into public.notifications (user_id, kind, title, body, url)
    values (v_interest.seller_user_id, 'buyer_note', 'A buyer sent a note',
      v_listing.year || ' ' || v_listing.make || ' ' || v_listing.model, '/sell/leads/' || p_interest_id);
  else
    insert into public.notifications (user_id, kind, title, body, url)
    select m.user_id, 'buyer_note', 'A buyer sent a note',
      v_listing.year || ' ' || v_listing.make || ' ' || v_listing.model, '/dealer/leads/' || p_interest_id
    from public.dealership_members m where m.dealership_id = v_interest.dealership_id;
  end if;
end;
$$;

-- Negotiator v2: counteroffers ---------------------------------------------------
create or replace function public.send_counter(p_offer_id uuid, p_amount numeric, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.offers%rowtype;
  v_interest public.interests%rowtype;
  v_listing public.listings%rowtype;
  v_id uuid;
begin
  select * into v_offer from public.offers where id = p_offer_id;
  if not found then raise exception 'offer not found' using errcode = 'P0002'; end if;
  select * into v_interest from public.interests where id = v_offer.interest_id for update;
  if v_interest.user_id is distinct from auth.uid() then
    raise exception 'not your offer' using errcode = '42501';
  end if;
  if v_offer.status <> 'active' or v_offer.expires_at < now() then
    raise exception 'this offer is no longer available' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount >= v_offer.otd_total or p_amount < v_offer.otd_total * 0.5 then
    raise exception 'a counteroffer must be below the offer and within reason' using errcode = '22023';
  end if;
  if length(coalesce(p_body, '')) > 2000 then
    raise exception 'message too long' using errcode = '22023';
  end if;
  if (select count(*) from public.counteroffers c where c.interest_id = v_interest.id) >= 5 then
    raise exception 'too many counteroffers on this car' using errcode = 'P0001';
  end if;

  update public.counteroffers set status = 'superseded', responded_at = now()
  where interest_id = v_interest.id and status = 'open';
  insert into public.counteroffers (offer_id, interest_id, buyer_id, amount_otd, body)
  values (p_offer_id, v_interest.id, auth.uid(), round(p_amount, 2), nullif(trim(p_body), ''))
  returning id into v_id;

  select * into v_listing from public.listings where id = v_interest.listing_id;
  if v_interest.seller_user_id is not null then
    insert into public.notifications (user_id, kind, title, body, url)
    values (v_interest.seller_user_id, 'counteroffer', 'Counteroffer: $' || to_char(p_amount, 'FM999,999,990'),
      v_listing.year || ' ' || v_listing.make || ' ' || v_listing.model, '/sell/leads/' || v_interest.id);
  else
    insert into public.notifications (user_id, kind, title, body, url)
    select m.user_id, 'counteroffer', 'Counteroffer: $' || to_char(p_amount, 'FM999,999,990') || ' out the door',
      v_listing.year || ' ' || v_listing.make || ' ' || v_listing.model, '/dealer/leads/' || v_interest.id
    from public.dealership_members m where m.dealership_id = v_interest.dealership_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.decline_counter(p_counter_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counter public.counteroffers%rowtype;
  v_interest public.interests%rowtype;
begin
  select * into v_counter from public.counteroffers where id = p_counter_id for update;
  if not found then raise exception 'counteroffer not found' using errcode = 'P0002'; end if;
  select * into v_interest from public.interests where id = v_counter.interest_id;
  if not (v_interest.seller_user_id = auth.uid() or public.is_dealer_member(v_interest.dealership_id)) then
    raise exception 'not your lead' using errcode = '42501';
  end if;
  if v_counter.status <> 'open' then
    raise exception 'this counteroffer was already answered' using errcode = 'P0001';
  end if;
  update public.counteroffers set status = 'declined', responded_at = now() where id = p_counter_id;
  insert into public.notifications (user_id, kind, title, body, url)
  values (v_interest.user_id, 'counter_declined', 'Counteroffer declined',
    'The seller kept their price. Your original offer still stands until it expires.', '/offers#' || v_interest.id);
end;
$$;

-- Private seller inbox. Buyer email is never revealed; phone only when the
-- buyer shares it in chat.
create or replace function public.seller_leads()
returns table (
  interest_id uuid, status text, kind text, created_at timestamptz, sla_expires_at timestamptz,
  matched_at timestamptz, test_drive_windows jsonb, dossier jsonb, lead_summary text, buyer_notes jsonb,
  listing_id uuid, listing_title text, listing_price numeric, listing_vin text, listing_photo text,
  listing_miles integer, distance_mi double precision, offer_count integer, best_offer_otd numeric,
  buyer_email text, buyer_phone text, conversation_id uuid
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select i.id, i.status, i.kind, i.created_at, i.sla_expires_at, i.matched_at, i.test_drive_windows,
    i.dossier, i.lead_summary, i.buyer_notes,
    l.id, l.year || ' ' || l.make || ' ' || l.model || coalesce(' ' || l.trim_level, ''), l.price, l.vin,
    (select ph.url from public.listing_photos ph where ph.listing_id = l.id order by ph.position limit 1),
    l.miles,
    (select st_distance(z.geog, l.geog) / 1609.344 from public.zip_codes z where z.zip = (i.dossier ->> 'zip')),
    (select count(*)::integer from public.offers o where o.interest_id = i.id),
    (select min(o.otd_total) from public.offers o where o.interest_id = i.id and o.status in ('active', 'picked')),
    null::text,
    case when i.status in ('matched', 'purchased') and c.buyer_phone_shared_at is not null then p.phone end,
    c.id
  from public.interests i
  join public.listings l on l.id = i.listing_id
  join public.profiles p on p.id = i.user_id
  left join public.conversations c on c.interest_id = i.id
  where i.seller_user_id = auth.uid() and i.status <> 'withdrawn'
  order by i.created_at desc;
$$;

-- Match-to-keys checklist ticks.
create or replace function public.set_journey_item(p_interest_id uuid, p_key text, p_done boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journey jsonb;
begin
  if p_key !~ '^[a-z_]{1,40}$' then raise exception 'invalid checklist item' using errcode = '22023'; end if;
  update public.interests
  set journey = case when p_done then journey || jsonb_build_object(p_key, now()) else journey - p_key end
  where id = p_interest_id and user_id = auth.uid()
    and (p_done is false or (select count(*) from jsonb_object_keys(journey)) < 40)
  returning journey into v_journey;
  if v_journey is null then raise exception 'not your car' using errcode = '42501'; end if;
  return v_journey;
end;
$$;

-- Self-serve dealer portal ---------------------------------------------------------
create or replace function public.create_dealership(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_zip public.zip_codes%rowtype;
  v_id uuid;
  v_name text := trim(p ->> 'name');
  v_slug text;
  v_market text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if v_name is null or length(v_name) not between 2 and 120 then
    raise exception 'dealership name must be 2-120 characters' using errcode = '22023';
  end if;
  if (select count(*) from public.dealership_members m where m.user_id = v_uid) >= 3 then
    raise exception 'you already belong to 3 dealerships' using errcode = 'P0001';
  end if;
  if (select count(*) from public.dealerships d where d.created_by = v_uid and d.created_at > now() - interval '1 day') >= 2 then
    raise exception 'too many dealerships created today' using errcode = 'P0001';
  end if;
  select * into v_zip from public.zip_codes where zip = p ->> 'zip';
  if not found then raise exception 'we do not serve that ZIP yet' using errcode = 'P0001'; end if;

  select m.id into v_market from public.markets m join public.zip_codes z on z.zip = m.center_zip
  where m.is_active and st_dwithin(z.geog, v_zip.geog, m.radius_mi * 1609.344)
  order by st_distance(z.geog, v_zip.geog) limit 1;

  v_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 6);

  insert into public.dealerships (name, slug, address, city, state, zip, lat, lng, phone, website, market_id,
    lead_channel, doc_fee, created_by)
  values (v_name, v_slug, left(p ->> 'address', 200), coalesce(left(p ->> 'city', 80), v_zip.city), v_zip.state,
    v_zip.zip, v_zip.lat, v_zip.lng, left(p ->> 'phone', 20), left(p ->> 'website', 200), v_market,
    'inbox', (p ->> 'doc_fee')::numeric, v_uid)
  returning id into v_id;

  insert into public.dealership_members (dealership_id, user_id, role) values (v_id, v_uid, 'owner');
  insert into public.dealership_private (dealership_id, lead_email)
  values (v_id, (select email from public.profiles where id = v_uid));
  insert into public.dealer_feeds (dealership_id) values (v_id);

  insert into public.notifications (user_id, kind, title, body, url)
  select a.id, 'dealer_signup', 'New dealership to verify', v_name, '/admin/dealers'
  from public.profiles a where a.is_admin;

  return v_id;
end;
$$;

create or replace function public.create_dealer_invite(p_dealership_id uuid, p_email text, p_role text default 'staff')
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text := encode(gen_random_bytes(24), 'hex');
begin
  if not exists (select 1 from public.dealership_members m
                 where m.dealership_id = p_dealership_id and m.user_id = auth.uid() and m.role = 'owner') then
    raise exception 'only owners can invite' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'staff') or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid invite' using errcode = '22023';
  end if;
  if (select count(*) from public.dealership_invites i where i.dealership_id = p_dealership_id
      and i.created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many invites today' using errcode = 'P0001';
  end if;
  delete from public.dealership_invites where dealership_id = p_dealership_id and email = p_email::citext and accepted_at is null;
  insert into public.dealership_invites (dealership_id, email, role, token_hash, invited_by)
  values (p_dealership_id, p_email, p_role, encode(digest(v_token, 'sha256'), 'hex'), auth.uid());
  return v_token;
end;
$$;

create or replace function public.accept_dealer_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_invite public.dealership_invites%rowtype;
  v_email text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_invite from public.dealership_invites
  where token_hash = encode(digest(p_token, 'sha256'), 'hex') for update;
  if not found or v_invite.expires_at < now() or v_invite.accepted_at is not null then
    raise exception 'this invite is invalid or expired' using errcode = 'P0001';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  if lower(v_email) is distinct from lower(v_invite.email::text) then
    raise exception 'this invite was sent to a different email address' using errcode = '42501';
  end if;
  insert into public.dealership_members (dealership_id, user_id, role)
  values (v_invite.dealership_id, auth.uid(), v_invite.role)
  on conflict (dealership_id, user_id) do update set role = excluded.role;
  update public.dealership_invites set accepted_at = now() where id = v_invite.id;
  return v_invite.dealership_id;
end;
$$;

create or replace function public.remove_dealer_member(p_dealership_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.dealership_members m
                 where m.dealership_id = p_dealership_id and m.user_id = auth.uid() and m.role = 'owner') then
    raise exception 'only owners can remove members' using errcode = '42501';
  end if;
  if (select count(*) from public.dealership_members m where m.dealership_id = p_dealership_id and m.role = 'owner'
      and m.user_id <> p_user_id) = 0 then
    raise exception 'a dealership needs at least one owner' using errcode = 'P0001';
  end if;
  delete from public.dealership_members where dealership_id = p_dealership_id and user_id = p_user_id;
end;
$$;

-- Deck: moderation gate, blocked private sellers, promoted cards --------------------
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
  where l.is_active and l.is_canonical and l.review_status = 'approved'
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
      where b.user_id = auth.uid()
        and (b.blocked_dealership_id = l.dealership_id or b.blocked_user_id = l.private_seller_id)
    );
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
  is_exploration boolean, is_promoted boolean
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
      greatest(0, extract(day from now() - l.first_seen_at))::integer as dom,
      coalesce(l.promoted_until > now(), false) as promoted
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
      + 0.3 * exp(-el.dom / 45.0)
      -- Promoted cards reach the candidate pool; the app caps how often they show.
      + case when el.promoted then 0.1 else 0 end as cheap_score
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
    p.distance_mi, p.visual_sim, p.is_exploration, p.promoted
  from picked p
  left join public.dealerships d on d.id = p.dealership_id;
$$;

drop function public.listing_cards(uuid[], double precision, double precision);
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
  is_exploration boolean, is_active boolean, description text, lat double precision, lng double precision,
  is_promoted boolean, review_status text
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
    null::double precision, false, l.is_active, l.description, l.lat, l.lng,
    coalesce(l.promoted_until > now(), false), l.review_status
  from public.listings l
  left join public.dealerships d on d.id = l.dealership_id
  where l.id = any (p_ids);
$$;

-- Moderation: photos that look like another listing's (Hamming distance on dHash).
create or replace function public.similar_photos(p_hashes text[], p_max_distance integer, p_exclude_listing uuid)
returns table (listing_id uuid, photo_id uuid, distance integer)
language sql
stable
security definer
set search_path = ''
as $$
  select ph.listing_id, ph.id, min(bit_count(ph.phash # h::bit(64)))::integer
  from public.listing_photos ph
  cross join unnest(p_hashes) h
  where ph.phash is not null and ph.listing_id is distinct from p_exclude_listing
    and bit_count(ph.phash # h::bit(64)) <= p_max_distance
  group by ph.listing_id, ph.id;
$$;

-- Analytics rollups (service role) ----------------------------------------------------
-- Impressions and detail opens per listing per day. Recomputes the last
-- p_days days, so it is safe to rerun.
create or replace function public.rollup_listing_events(p_days integer default 2)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  insert into public.listing_stats_daily as s (listing_id, day, impressions, detail_opens)
  select e.listing_id, e.created_at::date,
    count(*) filter (where e.kind = 'impression'),
    count(*) filter (where e.kind = 'detail_open')
  from public.listing_events e
  where e.listing_id is not null and e.created_at >= current_date - (p_days - 1)
  group by e.listing_id, e.created_at::date
  on conflict (listing_id, day) do update set
    impressions = excluded.impressions,
    detail_opens = excluded.detail_opens;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Median minutes from a lead to the first offer, last 90 days (3+ leads).
create or replace function public.refresh_dealer_stats()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  update public.dealerships d set response_time_minutes = s.median_minutes
  from (
    select i.dealership_id,
      round(percentile_cont(0.5) within group (order by extract(epoch from (fo.first_at - i.created_at)) / 60))::integer
        as median_minutes
    from public.interests i
    join lateral (select min(o.created_at) as first_at from public.offers o where o.interest_id = i.id) fo on true
    where i.dealership_id is not null and fo.first_at is not null and i.created_at > now() - interval '90 days'
    group by i.dealership_id
    having count(*) >= 3
  ) s
  where d.id = s.dealership_id;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- Demand intelligence (Phase 2) ---------------------------------------------------------
-- Nightly rollups over the last 30 days. Every row describes at least p_k
-- distinct buyers (k-anonymity); nothing identifies a buyer.
--   listing_pass   (dealer)  passes, likes, like rate vs. same-model peers,
--                            and the price buyers of similar cars tolerated
--   unmet_demand   (dealer)  buyers nearby wanting a body style under a price
--                            with no matching car in that dealer's inventory
--   market_unmet   (market)  buyers vs. supply by body style and price band
--   market_models  (market)  most-liked models and their supply
--   market_deals   (market)  like rate by deal rating (price sensitivity)
create or replace function public.refresh_demand_insights(p_k integer default 5)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_start date := current_date - 30;
  v_end date := current_date;
  v_bands numeric[] := array[15000, 20000, 25000, 30000, 35000, 40000, 50000, 60000, 80000, 100000];
  v_pass integer;
  v_unmet integer;
  v_market_unmet integer;
  v_models integer;
  v_deals integer;
begin
  if p_k < 3 then raise exception 'k must be at least 3' using errcode = '22023'; end if;
  delete from public.demand_insights where period_end = v_end;

  -- 1. Per-car pass analysis and price tolerance.
  with hot as materialized (
    select sw.listing_id,
      count(*) filter (where sw.action = 'pass') as passes,
      count(*) filter (where sw.action in ('like', 'superlike')) as likes,
      count(distinct sw.user_id) as buyers
    from public.swipes sw
    join public.listings l on l.id = sw.listing_id
    where sw.undone_at is null and sw.received_at >= v_start and l.is_active and l.dealership_id is not null
    group by sw.listing_id
    having count(distinct sw.user_id) >= p_k
  )
  insert into public.demand_insights (market_id, dealership_id, kind, key, period_start, period_end, payload)
  select l.market_id, l.dealership_id, 'listing_pass', l.id::text, v_start, v_end, jsonb_build_object(
      'listing_id', l.id,
      'title', l.year || ' ' || l.make || ' ' || l.model || coalesce(' ' || l.trim_level, ''),
      'price', l.price,
      'passes', h.passes,
      'likes', h.likes,
      'buyers', h.buyers,
      'like_rate', round(h.likes::numeric / nullif(h.likes + h.passes, 0), 3),
      'peer_like_rate', case when peer.buyers >= p_k then peer.like_rate end,
      'tolerance_price', case when tol.buyers >= p_k then round(tol.median_price::numeric, 0) end,
      'tolerance_buyers', case when tol.buyers >= p_k then tol.buyers end)
  from hot h
  join public.listings l on l.id = h.listing_id
  left join lateral (
    select round(count(*) filter (where sw.action in ('like', 'superlike'))::numeric / nullif(count(*), 0), 3) as like_rate,
      count(distinct sw.user_id) as buyers
    from public.swipes sw join public.listings l2 on l2.id = sw.listing_id
    where l2.make = l.make and l2.model = l.model and l2.id <> l.id
      and l2.market_id is not distinct from l.market_id
      and sw.undone_at is null and sw.received_at >= v_start
  ) peer on true
  left join lateral (
    -- Sticker prices of similar cars (same model, +/- 2 years) that buyers liked.
    select count(distinct sw.user_id) as buyers,
      percentile_cont(0.5) within group (order by l2.price) as median_price
    from public.swipes sw join public.listings l2 on l2.id = sw.listing_id
    where sw.action in ('like', 'superlike') and sw.undone_at is null and sw.received_at >= v_start - 60
      and l2.make = l.make and l2.model = l.model and abs(l2.year - l.year) <= 2 and l2.id <> l.id
  ) tol on true;
  get diagnostics v_pass = row_count;

  -- Buyers active in the window, with the body styles they want and their budget.
  drop table if exists insight_wants;
  create temporary table insight_wants on commit drop as
  select distinct b.id as user_id, b.geog, body.value as body_style, b.budget_max_price as budget
  from (
    select p.id, p.budget_max_price, z.geog
    from public.profiles p join public.zip_codes z on z.zip = p.zip
    where p.budget_max_price is not null and p.paused_at is null and p.onboarding_completed_at is not null
      and exists (select 1 from public.swipes s where s.user_id = p.id and s.received_at >= v_start)
  ) b
  join public.buyer_preferences bp on bp.user_id = b.id and bp.key = 'body_styles'
    and bp.tier <> 'dont_care' and jsonb_typeof(bp.value) = 'array'
  cross join lateral jsonb_array_elements_text(bp.value) body;

  -- 2. Unmet demand near each on-platform dealer. For a price band B where the
  -- dealer has no car of that body style priced at or under B, every nearby
  -- buyer wanting that body with a budget at or under B is unserved. Report
  -- the band that covers the most buyers (ties: the lower band).
  insert into public.demand_insights (market_id, dealership_id, kind, key, period_start, period_end, payload)
  select distinct on (x.dealership_id, x.body_style)
    x.market_id, x.dealership_id, 'unmet_demand', x.body_style || ':' || x.band, v_start, v_end,
    jsonb_build_object('body_style', x.body_style, 'max_price', x.band, 'buyers', x.buyers, 'radius_mi', 40)
  from (
    select d.market_id, d.id as dealership_id, w.body_style, band.v as band, count(distinct w.user_id) as buyers
    from public.dealerships d
    cross join unnest(v_bands) band(v)
    join insight_wants w on w.budget <= band.v and st_dwithin(w.geog, d.geog, 40 * 1609.344)
    where d.lead_channel = 'inbox' and d.geog is not null
      and not exists (
        select 1 from public.listings l
        where l.dealership_id = d.id and l.is_active and l.body_style = w.body_style and l.price <= band.v
      )
    group by d.market_id, d.id, w.body_style, band.v
    having count(distinct w.user_id) >= p_k
  ) x
  order by x.dealership_id, x.body_style, x.buyers desc, x.band;
  get diagnostics v_unmet = row_count;

  -- 3. Market-wide: buyers wanting a body style within a budget band vs. the
  -- cars listed at or under that band.
  insert into public.demand_insights (market_id, dealership_id, kind, key, period_start, period_end, payload)
  select m.id, null, 'market_unmet', w.body_style || ':' || band.v, v_start, v_end, jsonb_build_object(
      'body_style', w.body_style, 'max_price', band.v, 'buyers', count(distinct w.user_id),
      'supply', (select count(*) from public.listings l
                 where l.market_id = m.id and l.is_active and l.is_canonical and l.review_status = 'approved'
                   and l.body_style = w.body_style and l.price <= band.v))
  from public.markets m
  join public.zip_codes mz on mz.zip = m.center_zip
  cross join unnest(v_bands) band(v)
  join insight_wants w on w.budget <= band.v and st_dwithin(w.geog, mz.geog, m.radius_mi * 1609.344)
  group by m.id, w.body_style, band.v
  having count(distinct w.user_id) >= p_k;
  get diagnostics v_market_unmet = row_count;

  -- 4. Most-liked models and their supply.
  insert into public.demand_insights (market_id, dealership_id, kind, key, period_start, period_end, payload)
  select t.market_id, null, 'market_models', t.make || ' ' || t.model, v_start, v_end, jsonb_build_object(
      'make', t.make, 'model', t.model, 'buyers', t.buyers, 'likes', t.likes, 'passes', t.passes,
      'like_rate', round(t.likes::numeric / nullif(t.likes + t.passes, 0), 3),
      'supply', (select count(*) from public.listings l
                 where l.market_id = t.market_id and l.is_active and l.is_canonical
                   and l.make = t.make and l.model = t.model))
  from (
    select l.market_id, l.make, l.model,
      count(distinct sw.user_id) filter (where sw.action in ('like', 'superlike')) as buyers,
      count(*) filter (where sw.action in ('like', 'superlike')) as likes,
      count(*) filter (where sw.action = 'pass') as passes,
      row_number() over (partition by l.market_id
        order by count(distinct sw.user_id) filter (where sw.action in ('like', 'superlike')) desc) as rn
    from public.swipes sw join public.listings l on l.id = sw.listing_id
    where sw.undone_at is null and sw.received_at >= v_start and l.market_id is not null
    group by l.market_id, l.make, l.model
  ) t
  where t.buyers >= p_k and t.rn <= 25;
  get diagnostics v_models = row_count;

  -- 5. Price sensitivity: like rate by deal rating.
  insert into public.demand_insights (market_id, dealership_id, kind, key, period_start, period_end, payload)
  select l.market_id, null, 'market_deals', coalesce(l.deal_rating, 'unrated'), v_start, v_end, jsonb_build_object(
      'deal_rating', coalesce(l.deal_rating, 'unrated'),
      'buyers', count(distinct sw.user_id),
      'swipes', count(*),
      'like_rate', round(count(*) filter (where sw.action in ('like', 'superlike'))::numeric / nullif(count(*), 0), 3))
  from public.swipes sw join public.listings l on l.id = sw.listing_id
  where sw.undone_at is null and sw.received_at >= v_start and sw.action <> 'undo' and l.market_id is not null
  group by l.market_id, coalesce(l.deal_rating, 'unrated')
  having count(distinct sw.user_id) >= p_k;
  get diagnostics v_deals = row_count;

  return jsonb_build_object('listing_pass', v_pass, 'unmet_demand', v_unmet, 'market_unmet', v_market_unmet,
    'market_models', v_models, 'market_deals', v_deals);
end;
$$;

-- Scheduled maintenance, now with "Did you buy it?" prompts ------------------------------
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
  v_prompts integer := 0;
  v_rows integer;
  v_day integer;
begin
  update public.interests set status = 'expired'
  where status = 'sent' and sla_expires_at is not null and sla_expires_at < now();
  get diagnostics v_expired_interests = row_count;

  update public.offers set status = 'expired' where status = 'active' and expires_at < now();
  get diagnostics v_expired_offers = row_count;
  update public.counteroffers c set status = 'superseded', responded_at = now()
  from public.offers o
  where o.id = c.offer_id and c.status = 'open' and o.status <> 'active';

  -- Removed after 2 missed sweeps.
  update public.listings set is_active = false, sold_at = coalesce(sold_at, now())
  where is_active and missed_sweeps >= 2;
  get diagnostics v_stale = row_count;

  -- Private listings end after app_config private_sales.listing_days (the
  -- seller can relist). Not marked sold.
  update public.listings set is_active = false
  where is_active and source = 'private'
    and published_at < now() - make_interval(days => public.config_number('private_sales', 'listing_days', 60)::integer);

  update public.interests i set status = 'unavailable'
  from public.listings l
  where l.id = i.listing_id and not l.is_active and i.status in ('sent', 'offered', 'expired');
  get diagnostics v_unavailable = row_count;

  -- "Did you buy it?" N days after a match (app_config purchase_prompts).
  for v_day in
    select (jsonb_array_elements_text(coalesce(
      (select c.value -> 'days_after_match' from public.app_config c where c.key = 'purchase_prompts'),
      '[14, 30]'::jsonb)))::integer
  loop
    with due as (
      update public.interests i set purchase_prompted_days = i.purchase_prompted_days || v_day
      where i.status = 'matched' and i.matched_at < now() - make_interval(days => v_day)
        and not (v_day = any (i.purchase_prompted_days))
      returning i.id, i.user_id, i.listing_id
    )
    insert into public.notifications (user_id, kind, title, body, url)
    select due.user_id, 'purchase_prompt', 'Did you buy it?',
      'Tell us about the ' || l.year || ' ' || l.make || ' ' || l.model || '. One tap credits the seller.',
      '/journey/' || due.id
    from due join public.listings l on l.id = due.listing_id;
    get diagnostics v_rows = row_count;
    v_prompts := v_prompts + v_rows;
  end loop;

  update public.phone_verifications set status = 'expired' where status = 'pending' and expires_at < now();
  update public.promotions set status = 'failed' where status = 'pending' and created_at < now() - interval '1 day';

  delete from public.listing_events where created_at < now() - interval '180 days';
  delete from public.rate_limits where window_start < now() - interval '2 days';
  delete from public.phone_verifications where created_at < now() - interval '30 days';

  return jsonb_build_object('expired_interests', v_expired_interests, 'expired_offers', v_expired_offers,
    'stale_listings', v_stale, 'unavailable_interests', v_unavailable, 'purchase_prompts', v_prompts);
end;
$$;

-- Fixed-window rate limit for server routes (service role).
create or replace function public.hit_rate_limit(p_user uuid, p_bucket text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.rate_limits as r (user_id, bucket, window_start, count)
  values (p_user, p_bucket, v_start, 1)
  on conflict (user_id, bucket, window_start) do update set count = r.count + 1
  returning count into v_count;
  return v_count <= p_max;
end;
$$;

-- Dealer inventory: 30-day funnel per listing.
create or replace function public.dealer_inventory_stats(p_dealership_id uuid, p_days integer default 30)
returns table (listing_id uuid, impressions bigint, detail_opens bigint, likes bigint, passes bigint, leads bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_dealer_member(p_dealership_id) or public.is_admin()) then
    raise exception 'not a member of this dealership' using errcode = '42501';
  end if;
  return query
  select l.id,
    coalesce(sum(s.impressions), 0)::bigint,
    coalesce(sum(s.detail_opens), 0)::bigint,
    coalesce(sum(s.likes + s.superlikes), 0)::bigint,
    coalesce(sum(s.passes), 0)::bigint,
    (select count(*) from public.interests i where i.listing_id = l.id)::bigint
  from public.listings l
  left join public.listing_stats_daily s on s.listing_id = l.id and s.day >= current_date - p_days
  where l.dealership_id = p_dealership_id
  group by l.id;
end;
$$;

-- Grants -------------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_dealer_member(uuid) to anon, authenticated;
grant execute on function public.record_swipes(jsonb) to authenticated;
grant execute on function public.send_offer(uuid, jsonb) to authenticated;
grant execute on function public.pick_offer(uuid) to authenticated;
grant execute on function public.mark_purchased(uuid, numeric) to authenticated;
grant execute on function public.add_buyer_note(uuid, text) to authenticated;
grant execute on function public.send_counter(uuid, numeric, text) to authenticated;
grant execute on function public.decline_counter(uuid) to authenticated;
grant execute on function public.seller_leads() to authenticated;
grant execute on function public.set_journey_item(uuid, text, boolean) to authenticated;
grant execute on function public.create_dealership(jsonb) to authenticated;
grant execute on function public.create_dealer_invite(uuid, text, text) to authenticated;
grant execute on function public.accept_dealer_invite(text) to authenticated;
grant execute on function public.remove_dealer_member(uuid, uuid) to authenticated;
grant execute on function public.dealer_inventory_stats(uuid, integer) to authenticated;
grant execute on function public.deck_eligible(jsonb) to authenticated;
grant execute on function public.deck_candidates(jsonb, integer, integer, uuid) to authenticated;
grant execute on function public.listing_cards(uuid[], double precision, double precision) to authenticated;
revoke execute on function public.build_private_dossier(uuid) from authenticated;
revoke execute on function public.similar_photos(text[], integer, uuid) from authenticated;
revoke execute on function public.rollup_listing_events(integer) from authenticated;
revoke execute on function public.refresh_dealer_stats() from authenticated;
revoke execute on function public.refresh_demand_insights(integer) from authenticated;
revoke execute on function public.run_maintenance() from authenticated;
revoke execute on function public.hit_rate_limit(uuid, text, integer, integer) from authenticated;
revoke execute on function public.record_lead_charge() from authenticated;
revoke execute on function public.reset_phone_verification() from authenticated;
