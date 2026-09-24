-- pgTAP: Phase 2/3 rules (private sellers, counteroffers, moderation gate,
-- billing, self-serve dealers, k-anonymous insights). Run on a fresh seed.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(32);

create or replace function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Fixture ids (scripts/fixtures/generate.ts).
--   buyer  ...b001   dealer member ...d001 (dealership ...d01)   seller ...e001
--   private listings: CR-V ...cf1 (live, has a lead), Camry ...cf2 (live), F-150 ...cf3 (in review)
--   dealer offer on interest ...e0002: ...f0001 (active)

-- 1-3. Moderation gate --------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-00000000b001');
select is((select count(*)::int from listings where id = '00000000-0000-4000-8000-000000000cf3'), 0,
  'buyers cannot see a private listing that is still in review');
select is((select count(*)::int from deck_eligible('{"lat":36.14,"lng":-86.80,"radius_mi":150}'::jsonb) where listing_id = '00000000-0000-4000-8000-000000000cf3'), 0,
  'a listing in review never reaches the deck');
select pg_temp.as_user('00000000-0000-4000-8000-00000000e001');
select is((select review_status from listings where id = '00000000-0000-4000-8000-000000000cf3'), 'pending',
  'the seller sees their own listing in review');

-- 4-7. A like on a private listing routes to the seller (72 h) ------------------------
select pg_temp.as_user('00000000-0000-4000-8000-00000000b001');
select is(
  (record_swipes('[{"client_id":"33333333-3333-4333-8333-333333333333","listing_id":"00000000-0000-4000-8000-000000000cf2","action":"like"}]'::jsonb) -> 0 ->> 'status'),
  'ok', 'buyer likes a private listing');
select is((select seller_user_id from interests where listing_id = '00000000-0000-4000-8000-000000000cf2'),
  '00000000-0000-4000-8000-00000000e001'::uuid, 'the interest belongs to the private seller');
select ok((select sla_expires_at between now() + interval '71 hours' and now() + interval '73 hours' from interests where listing_id = '00000000-0000-4000-8000-000000000cf2'),
  'private sellers get a 72-hour reply window');
select is((select dossier -> 'preferences' ? 'max_monthly_payment' from interests where listing_id = '00000000-0000-4000-8000-000000000cf2'), false,
  'private sellers do not see the buyer''s budget');

-- 8-9. Who can read that lead ------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
select is((select count(*)::int from interests where listing_id = '00000000-0000-4000-8000-000000000cf2'), 0,
  'dealers cannot read private-seller leads');
select pg_temp.as_user('00000000-0000-4000-8000-00000000e001');
select is((select count(*)::int from seller_leads() where listing_id = '00000000-0000-4000-8000-000000000cf2'), 1,
  'the seller sees the lead in their inbox');

-- 10-11. Only the seller can answer it -----------------------------------------------
select pg_temp.as_postgres();
select set_config('test.cf2_interest', (select id::text from interests where listing_id = '00000000-0000-4000-8000-000000000cf2'), true);
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
select throws_ok(
  $$ select send_offer(current_setting('test.cf2_interest')::uuid, '{"vehicle_price":15500,"otd_total":16800}'::jsonb) $$,
  '42501', null, 'a dealer cannot send a price on a private listing');
select pg_temp.as_user('00000000-0000-4000-8000-00000000e001');
select isnt(send_offer((select id from interests where listing_id = '00000000-0000-4000-8000-000000000cf2'), '{"vehicle_price":15500,"otd_total":16800,"doc_fee":999}'::jsonb), null,
  'the seller sends a price');

-- 12. Private offers carry no dealer fees.
select is((select doc_fee::int from offers where seller_user_id = '00000000-0000-4000-8000-00000000e001'), 0, 'private offers ignore dealer fees');

-- 13-16. Counteroffers ----------------------------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-00000000b001');
select throws_ok(
  $$ select send_counter((select id from offers where seller_user_id = '00000000-0000-4000-8000-00000000e001'), 17000, 'too high') $$,
  '22023', null, 'a counter above the offer is rejected');
select isnt(send_counter((select id from offers where seller_user_id = '00000000-0000-4000-8000-00000000e001'), 16000, 'Could you do 16,000?'), null,
  'the buyer counters below the offer');
select throws_ok(
  $$ select decline_counter((select id from counteroffers limit 1)) $$,
  '42501', null, 'the buyer cannot decline their own counter');
select pg_temp.as_user('00000000-0000-4000-8000-00000000e001');
select lives_ok(
  $$ select decline_counter((select id from counteroffers where buyer_id = '00000000-0000-4000-8000-00000000b001' and status = 'open')) $$,
  'the seller declines the counter');

-- 17-19. Picking a private offer opens chat with the seller, with safety tips ---------------
select pg_temp.as_user('00000000-0000-4000-8000-00000000b001');
select isnt(pick_offer((select id from offers where seller_user_id = '00000000-0000-4000-8000-00000000e001')), null, 'buyer accepts the seller''s price');
select is((select count(*)::int from messages m join conversations c on c.id = m.conversation_id
  where c.seller_user_id = '00000000-0000-4000-8000-00000000e001' and m.kind = 'safety'), 1, 'private chats open with safety tips');
select pg_temp.as_user('00000000-0000-4000-8000-00000000e001');
select is((select count(*)::int from conversations where seller_user_id = '00000000-0000-4000-8000-00000000e001'), 1, 'the seller is a chat participant');

-- 20. No lead fee on private sales.
select pg_temp.as_postgres();
select is((select count(*)::int from lead_charges l join interests i on i.id = l.interest_id where i.seller_user_id is not null), 0,
  'private sales never create lead charges');

-- 21. A dealer match creates exactly one metered lead charge.
select pg_temp.as_user('00000000-0000-4000-8000-00000000b001');
select isnt(pick_offer('00000000-0000-4000-8000-0000000f0001'), null, 'buyer picks a dealer offer');
select pg_temp.as_postgres();
select is((select count(*)::int from lead_charges where interest_id = '00000000-0000-4000-8000-0000000e0002'), 1,
  'a matched dealer lead creates one charge');

-- 23-26. Self-serve dealers and invites ---------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-00000000d777', 'authenticated', 'authenticated', 'newdealer@carswipe.dev', '', now(), '{}', '{}', now(), now(), '', '', '', '');
select pg_temp.as_user('00000000-0000-4000-8000-00000000d777');
select isnt(create_dealership('{"name":"Test Motors","zip":"37203"}'::jsonb), null, 'anyone signed in can create a dealership');
select is((select role from dealership_members where user_id = '00000000-0000-4000-8000-00000000d777'), 'owner', 'the creator is its owner');
select is((select verified_at from dealerships where created_by = '00000000-0000-4000-8000-00000000d777'), null, 'self-serve dealerships start unverified');
select pg_temp.as_user('00000000-0000-4000-8000-00000000b001');
select throws_ok(
  $$ select create_dealer_invite('00000000-0000-4000-8000-000000000d01', 'x@example.com', 'staff') $$,
  '42501', null, 'non-owners cannot invite to a dealership');

-- 27. Changing your phone drops its verification.
select pg_temp.as_user('00000000-0000-4000-8000-00000000e001');
update profiles set phone = '+16155550100' where id = '00000000-0000-4000-8000-00000000e001';
select is((select phone_verified_at from profiles where id = '00000000-0000-4000-8000-00000000e001'), null,
  'a new phone number needs verifying again');

-- 28. Vault uploads must be in your own folder.
select throws_ok(
  $$ insert into vault_documents (user_id, kind, storage_path, file_name) values ('00000000-0000-4000-8000-00000000e001', 'license', '00000000-0000-4000-8000-00000000b001/x.pdf', 'x.pdf') $$,
  '42501', null, 'vault rows can only point at your own folder');

-- 29-30. Demand insights are k-anonymous and only visible to that dealer ----------------------
select pg_temp.as_postgres();
select is((select count(*)::int from demand_insights where kind in ('listing_pass', 'unmet_demand', 'market_unmet', 'market_models', 'market_deals')
  and (payload ->> 'buyers')::int < 5), 0, 'every insight covers at least 5 buyers');
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
select is((select count(*)::int from demand_insights where dealership_id is distinct from '00000000-0000-4000-8000-000000000d01'), 0,
  'dealers only see their own insights');

-- 31-32. Deck filters are quoted literals, never SQL.
select pg_temp.as_user('00000000-0000-4000-8000-00000000b001');
select is((select count(*)::int from deck_eligible($j${"lat":36.17,"lng":-86.73,"radius_mi":50,"body_styles":["sedan'); delete from listings; --"]}$j$::jsonb)), 0,
  'hostile filter values match nothing and run nothing');
select pg_temp.as_postgres();
select ok((select count(*) from listings) > 300, 'listings are untouched');

select * from finish();
rollback;
