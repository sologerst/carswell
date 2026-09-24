-- pgTAP database tests: run with `npx supabase test db` (after `npm run seed`).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(18);

-- Helpers: act as a user.
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

-- A second buyer to check isolation.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-00000000b002', 'authenticated', 'authenticated', 'other@carswipe.dev', '', now(), '{}', '{}', now(), now(), '', '', '', '');

-- 1-4. Row Level Security isolation -------------------------------------------
select pg_temp.as_user('00000000-0000-4000-8000-00000000b002');
select is((select count(*)::int from buyer_preferences), 0, 'a buyer cannot read another buyer''s preferences');
select is((select count(*)::int from interests), 0, 'a buyer cannot read another buyer''s likes');
select is((select count(*)::int from offers), 0, 'a buyer cannot read offers on someone else''s likes');
select is((select count(*)::int from messages), 0, 'a buyer cannot read other people''s chats');

-- 5. Profiles: only your own row; you cannot make yourself an admin.
select is((select count(*)::int from profiles), 1, 'a buyer sees only their own profile');
select throws_ok(
  $$ update profiles set is_admin = true where id = '00000000-0000-4000-8000-00000000b002' $$,
  '42501', null, 'a buyer cannot grant themselves admin');

-- 7. Swipes are written only through record_swipes().
select throws_ok(
  $$ insert into swipes (user_id, listing_id, action, client_id) values ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-000000000c01', 'like', gen_random_uuid()) $$,
  '42501', null, 'direct swipe inserts are rejected');

-- 8-11. Swipe replay idempotency and never re-showing swiped cars ---------------
select pg_temp.as_user('00000000-0000-4000-8000-00000000b002');
select is(
  (record_swipes('[{"client_id":"11111111-1111-4111-8111-111111111111","listing_id":"00000000-0000-4000-8000-000000000c01","action":"like"}]'::jsonb) -> 0 ->> 'status'),
  'ok', 'first swipe is recorded');
select is(
  (record_swipes('[{"client_id":"11111111-1111-4111-8111-111111111111","listing_id":"00000000-0000-4000-8000-000000000c01","action":"like"}]'::jsonb) -> 0 ->> 'status'),
  'duplicate', 'replaying the same swipe is a no-op');
select is((select count(*)::int from swipes where client_id = '11111111-1111-4111-8111-111111111111'), 1, 'exactly one swipe row after replay');
select is(
  (select count(*)::int from deck_eligible('{"lat":36.1797,"lng":-86.7342,"radius_mi":150}'::jsonb) where listing_id = '00000000-0000-4000-8000-000000000c01'),
  0, 'a swiped car never comes back in the deck');

-- 12. Undo puts it back.
select is(
  (record_swipes('[{"client_id":"22222222-2222-4222-8222-222222222222","action":"undo","undo_of":"11111111-1111-4111-8111-111111111111"}]'::jsonb) -> 0 ->> 'status'),
  'ok', 'undo is accepted');

-- 13-15. Contact details hidden until the buyer picks the dealer's offer --------
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
select is(
  (select buyer_email from dealer_leads('00000000-0000-4000-8000-000000000d01'::uuid) where interest_id = '00000000-0000-4000-8000-0000000e0001'),
  null, 'dealer cannot see the buyer''s email before a match');
select is(
  (select buyer_email from dealer_leads('00000000-0000-4000-8000-000000000d01'::uuid) where interest_id = '00000000-0000-4000-8000-0000000e0003'),
  'buyer@carswipe.dev', 'dealer sees the email after the buyer picked their offer');
select is((select count(*)::int from profiles where id = '00000000-0000-4000-8000-00000000b001'), 0, 'dealers cannot read buyer profiles directly');

-- 16. Each dealer sees only its own offers.
select pg_temp.as_user('00000000-0000-4000-8000-00000000b002');
select throws_ok(
  $$ select * from dealer_leads('00000000-0000-4000-8000-000000000d01'::uuid) $$,
  '42501', null, 'non-members cannot open a dealer inbox');

-- 17-18. One canonical, active card per VIN -----------------------------------
select pg_temp.as_postgres();
select is(
  (select count(*)::int from (select vin from listings where is_active and is_canonical group by vin having count(*) > 1) d),
  0, 'no VIN has two canonical active listings');
select throws_ok(
  $$ insert into listings (vin, source, source_id, year, make, model, body_style, price, lat, lng)
     select vin, 'marketcheck', 'dup-test', year, make, model, body_style, price, lat, lng from listings where id = '00000000-0000-4000-8000-000000000c02' $$,
  '23505', null, 'a second canonical active listing for the same VIN is rejected');

select * from finish();
rollback;
