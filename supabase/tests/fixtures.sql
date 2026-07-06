-- Test fixtures: 6 auth users (5 tiers + a 2nd contributor), roles assigned by
-- the owner through the real RLS/trigger path, and seed records created by
-- different users so cross-user rules can be tested.
--
-- Personal document FILES follow the hardened path convention introduced with
-- migration 0011: personal/<profile_id>/<file>. Non-personal files keep the
-- original <entity_id>/<file> layout.

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'owner@test.local');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000002', 'manager@test.local');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000003', 'contributor@test.local');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000004', 'accountant@test.local');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000005', 'auditor@test.local');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000006', 'contributor2@test.local');

\echo '--- bootstrap result (expect: 01=owner, rest=contributor)'
select right(id::text, 2) as who, email, role from public.profiles order by id;

-- Owner assigns tiers (exercises profiles_update RLS + the role-protect trigger).
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
update public.profiles set role = 'manager'    where id = '00000000-0000-0000-0000-000000000002';
update public.profiles set role = 'accountant' where id = '00000000-0000-0000-0000-000000000004';
update public.profiles set role = 'auditor'    where id = '00000000-0000-0000-0000-000000000005';
commit;

\echo '--- roles after owner assignment'
select right(id::text, 2) as who, role from public.profiles order by id;

-- Owner: vehicle + a trip + documents (org, vehicle, personal x2) + storage files.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
insert into public.vehicles (id, entity_id, make, model, year)
  values ('22222222-0000-0000-0000-000000000001',
          (select id from public.entities where is_primary), 'Toyota', 'Sienna', 2022);
insert into public.trips (id, entity_id, vehicle_id, category_id, trip_date, distance_miles, destination)
  values ('11111111-0000-0000-0000-000000000001',
          (select id from public.entities where is_primary),
          '22222222-0000-0000-0000-000000000001',
          (select id from public.trip_categories where name = 'Business'),
          '2026-07-01', 10, 'owner trip');
insert into public.documents (id, entity_id, document_type_id, title)
  values ('33333333-0000-0000-0000-000000000001',
          (select id from public.entities where is_primary),
          (select id from public.document_types where key = 'bylaws'), 'Org bylaws');
insert into public.documents (id, entity_id, vehicle_id, document_type_id, title)
  values ('33333333-0000-0000-0000-000000000002',
          (select id from public.entities where is_primary),
          '22222222-0000-0000-0000-000000000001',
          (select id from public.document_types where key = 'vehicle_title'), 'Sienna title');
insert into public.documents (id, entity_id, profile_id, document_type_id, title, expiration_date)
  values ('33333333-0000-0000-0000-000000000003',
          (select id from public.entities where is_primary),
          '00000000-0000-0000-0000-000000000003',
          (select id from public.document_types where key = 'drivers_license'),
          'Contributor driver license', '2026-08-15');
insert into public.documents (id, entity_id, profile_id, document_type_id, title, expiration_date)
  values ('33333333-0000-0000-0000-000000000004',
          (select id from public.entities where is_primary),
          '00000000-0000-0000-0000-000000000002',
          (select id from public.document_types where key = 'background_check'),
          'Manager background check', '2026-09-01');
-- Files: one non-personal (entity-prefixed), two personal (profile-prefixed).
insert into storage.objects (bucket_id, name, owner)
  values ('documents',
          (select id::text from public.entities where is_primary) || '/bylaws.pdf',
          '00000000-0000-0000-0000-000000000001');
insert into storage.objects (bucket_id, name, owner)
  values ('documents', 'personal/00000000-0000-0000-0000-000000000002/background-check.pdf',
          '00000000-0000-0000-0000-000000000001');
insert into storage.objects (bucket_id, name, owner)
  values ('documents', 'personal/00000000-0000-0000-0000-000000000003/license.pdf',
          '00000000-0000-0000-0000-000000000001');
commit;

-- Manager: a trip.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
insert into public.trips (id, entity_id, vehicle_id, category_id, trip_date, distance_miles, destination)
  values ('11111111-0000-0000-0000-000000000002',
          (select id from public.entities where is_primary),
          '22222222-0000-0000-0000-000000000001',
          (select id from public.trip_categories where name = 'Business'),
          '2026-07-02', 20, 'manager trip');
commit;

-- Contributor: a trip.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
insert into public.trips (id, entity_id, vehicle_id, category_id, trip_date, distance_miles, destination)
  values ('11111111-0000-0000-0000-000000000003',
          (select id from public.entities where is_primary),
          '22222222-0000-0000-0000-000000000001',
          (select id from public.trip_categories where name = 'Business'),
          '2026-07-03', 30, 'contributor trip');
commit;

-- Contributor2: a trip (later demoted to auditor to test residual edit rights).
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
insert into public.trips (id, entity_id, vehicle_id, category_id, trip_date, distance_miles, destination)
  values ('11111111-0000-0000-0000-000000000006',
          (select id from public.entities where is_primary),
          '22222222-0000-0000-0000-000000000001',
          (select id from public.trip_categories where name = 'Business'),
          '2026-07-04', 40, 'contributor2 trip');
commit;

\echo '--- seeded trips (creator suffix / destination)'
select right(created_by::text, 2) as creator, destination from public.trips order by trip_date;
