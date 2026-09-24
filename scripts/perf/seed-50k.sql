-- Performance fixture: clone the seeded fixture cars (with jittered location,
-- price and mileage) until there are about 50,000 active listings, with photos
-- and style embeddings. LOCAL ONLY:  npm run perf:seed  (then npm run seed to reset).
begin;

create temporary table perf_map on commit drop as
select gen_random_uuid() as new_id, l.id as old_id, g
from generate_series(1, greatest(0, ceil((50000 - (select count(*) from public.listings where is_active))::numeric
       / nullif((select count(*) from public.listings where source = 'fixture' and is_active and is_canonical), 0)))::int) g
cross join public.listings l
where l.source = 'fixture' and l.is_active and l.is_canonical;

insert into public.listings (
  id, vin, source, source_id, market_id, dealership_id, seller_type, year, make, model, trim_level, body_style, condition,
  price, msrp, miles, exterior_color, exterior_color_family, interior_color, interior_material, fuel_type, drivetrain,
  transmission, engine, cylinders, horsepower, mpg_city, mpg_hwy, ev_range_mi, seats, third_row, doors, length_in, towing_lbs,
  features, features_verified, title_status, accident_count, owner_count, personal_use, service_records, open_recalls,
  description, zip, lat, lng, expected_price, deal_rating, quality_score, photo_count, is_active, is_canonical,
  first_seen_at, last_seen_at)
select m.new_id,
  upper(substr(md5(m.new_id::text), 1, 17)),
  'fixture', 'perf-' || m.new_id, l.market_id, l.dealership_id, l.seller_type, l.year, l.make, l.model, l.trim_level,
  l.body_style, l.condition,
  round(l.price * (0.9 + random() * 0.2) / 100) * 100 - 5, l.msrp,
  case when l.condition = 'new' then l.miles else greatest(0, (l.miles * (0.8 + random() * 0.4))::int) end,
  l.exterior_color, l.exterior_color_family, l.interior_color, l.interior_material, l.fuel_type, l.drivetrain,
  l.transmission, l.engine, l.cylinders, l.horsepower, l.mpg_city, l.mpg_hwy, l.ev_range_mi, l.seats, l.third_row, l.doors,
  l.length_in, l.towing_lbs, l.features, l.features_verified, l.title_status, l.accident_count, l.owner_count,
  l.personal_use, l.service_records, l.open_recalls, l.description, l.zip,
  -- Spread across middle Tennessee (about +/- 45 miles).
  l.lat + (random() - 0.5) * 1.3, l.lng + (random() - 0.5) * 1.6,
  l.expected_price, l.deal_rating, l.quality_score, l.photo_count, true, true,
  now() - (random() * interval '90 days'), now()
from perf_map m join public.listings l on l.id = m.old_id;

insert into public.listing_photos (listing_id, url, position)
select m.new_id, p.url, p.position from perf_map m join public.listing_photos p on p.listing_id = m.old_id;

insert into public.listing_embeddings (listing_id, model, embedding)
select m.new_id, e.model, e.embedding from perf_map m join public.listing_embeddings e on e.listing_id = m.old_id;

commit;
analyze public.listings;
analyze public.listing_photos;
analyze public.listing_embeddings;
select count(*) as active_listings from public.listings where is_active;
