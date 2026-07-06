-- Role-test matrix, executed at the database as each tier.
-- Impersonation = SET ROLE authenticated + the JWT sub claim — exactly the
-- context PostgREST gives a logged-in user.
--
-- Expectations encode the HARDENED contract (migrations 0001–0011): against
-- 0001–0010 alone, sections 9–11 and 14 fail by design; against 0001–0011 the
-- whole file must print PASS on every line and no FAIL.
--
-- Row-count checks matter: RLS USING clauses make UPDATE/DELETE silently touch
-- 0 rows rather than error, so "0 rows" is the denial signal there. Refused
-- INSERTs raise 42501 (insufficient_privilege).

\set QUIET on
\pset tuples_only on
\pset format unaligned

\echo '=== 1. READ: every active tier sees all 4 trips ==='
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select case when count(*) = 4 then 'PASS' else 'FAIL' end || ': owner sees all trips (' || count(*) || '/4)' from public.trips;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select case when count(*) = 4 then 'PASS' else 'FAIL' end || ': manager sees all trips (' || count(*) || '/4)' from public.trips;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select case when count(*) = 4 then 'PASS' else 'FAIL' end || ': contributor sees all trips (' || count(*) || '/4)' from public.trips;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select case when count(*) = 4 then 'PASS' else 'FAIL' end || ': accountant sees all trips (' || count(*) || '/4)' from public.trips;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select case when count(*) = 4 then 'PASS' else 'FAIL' end || ': auditor sees all trips (' || count(*) || '/4)' from public.trips;
rollback;

\echo ''
\echo '=== 2. CREATE: owner/manager/contributor may insert; accountant/auditor refused ==='
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
do $$ begin
  insert into public.trips (entity_id, vehicle_id, category_id, trip_date, distance_miles)
  values ((select id from public.entities where is_primary),
          '22222222-0000-0000-0000-000000000001',
          (select id from public.trip_categories where name = 'Business'), '2026-07-05', 5);
  raise notice 'FAIL: accountant CREATED a trip';
exception when insufficient_privilege then
  raise notice 'PASS: accountant trip insert refused (42501)';
end $$;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
do $$ begin
  insert into public.trips (entity_id, vehicle_id, category_id, trip_date, distance_miles)
  values ((select id from public.entities where is_primary),
          '22222222-0000-0000-0000-000000000001',
          (select id from public.trip_categories where name = 'Business'), '2026-07-05', 5);
  raise notice 'FAIL: auditor CREATED a trip';
exception when insufficient_privilege then
  raise notice 'PASS: auditor trip insert refused (42501)';
end $$;
do $$ begin
  insert into public.vehicles (entity_id, make) values ((select id from public.entities where is_primary), 'Ford');
  raise notice 'FAIL: auditor CREATED a vehicle';
exception when insufficient_privilege then
  raise notice 'PASS: auditor vehicle insert refused (42501)';
end $$;
rollback;
select 'PASS: owner/manager/contributor inserts proven in fixtures (4 seeded trips)';

\echo ''
\echo '=== 3. EDIT OWN: contributor edits own trip ==='
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
with u as (update public.trips set notes = 'edited by self' where id = '11111111-0000-0000-0000-000000000003' returning 1)
select case when count(*) = 1 then 'PASS' else 'FAIL' end || ': contributor edited own trip (' || count(*) || ' row)' from u;
rollback;

\echo ''
\echo '=== 4. EDIT OTHERS (the key check): contributor must NOT touch another user''s record ==='
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
with u as (update public.trips set notes = 'hijacked' where id = '11111111-0000-0000-0000-000000000002' returning 1)
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ': contributor UPDATE of manager trip touched ' || count(*) || ' rows' from u;
with d as (delete from public.trips where id = '11111111-0000-0000-0000-000000000002' returning 1)
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ': contributor DELETE of manager trip touched ' || count(*) || ' rows' from d;
with u as (update public.vehicles set notes = 'hijacked' where id = '22222222-0000-0000-0000-000000000001' returning 1)
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ': contributor UPDATE of owner vehicle touched ' || count(*) || ' rows' from u;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
with u as (update public.trips set notes = 'manager fix' where id = '11111111-0000-0000-0000-000000000003' returning 1)
select case when count(*) = 1 then 'PASS' else 'FAIL' end || ': manager edited contributor trip (' || count(*) || ' row)' from u;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
with u as (update public.trips set notes = 'owner fix' where id = '11111111-0000-0000-0000-000000000003' returning 1)
select case when count(*) = 1 then 'PASS' else 'FAIL' end || ': owner edited contributor trip (' || count(*) || ' row)' from u;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
with u as (update public.trips set notes = 'acct edit' where id = '11111111-0000-0000-0000-000000000001' returning 1)
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ': accountant UPDATE of owner trip touched ' || count(*) || ' rows' from u;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
with u as (update public.trips set notes = 'aud edit' where id = '11111111-0000-0000-0000-000000000001' returning 1)
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ': auditor UPDATE of owner trip touched ' || count(*) || ' rows' from u;
rollback;

\echo ''
\echo '=== 5. SETTINGS: only owner writes lookups/entities ==='
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$ begin
  insert into public.trip_categories (name) values ('Manager Category');
  raise notice 'FAIL: manager created a trip category';
exception when insufficient_privilege then
  raise notice 'PASS: manager trip-category insert refused (42501)';
end $$;
with u as (update public.entities set legal_name = 'hacked' where is_primary returning 1)
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ': manager UPDATE of entities touched ' || count(*) || ' rows' from u;
with u as (update public.mileage_rates set rate_per_mile = 9.999 where rate_type = 'business' returning 1)
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ': manager UPDATE of mileage_rates touched ' || count(*) || ' rows' from u;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
with u as (update public.entities set legal_name = 'Foundation Legal Name Test' where is_primary returning 1)
select case when count(*) = 1 then 'PASS' else 'FAIL' end || ': owner edited entities (' || count(*) || ' row)' from u;
rollback;

\echo ''
\echo '=== 6. USER MANAGEMENT: only owner changes roles ==='
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
do $$ begin
  update public.profiles set role = 'owner' where id = '00000000-0000-0000-0000-000000000003';
  raise notice 'FAIL: contributor promoted THEMSELF to owner';
exception when others then
  raise notice 'PASS: contributor self-promotion refused (%)', sqlerrm;
end $$;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$ begin
  update public.profiles set role = 'owner' where id = '00000000-0000-0000-0000-000000000002';
  raise notice 'FAIL: manager promoted THEMSELF to owner';
exception when others then
  raise notice 'PASS: manager self-promotion refused (%)', sqlerrm;
end $$;
-- Manager changing ANOTHER user's role: RLS filters the row -> 0 rows, no error.
with u as (update public.profiles set role = 'manager' where id = '00000000-0000-0000-0000-000000000003' returning 1)
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ': manager role-change of another user touched ' || count(*) || ' rows' from u;
rollback;

\echo ''
\echo '=== 7. AUDIT LOG: owner/accountant/auditor read; manager/contributor see nothing; nobody writes ==='
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select case when count(*) > 0 then 'PASS' else 'FAIL' end || ': owner reads audit log (' || count(*) || ' rows)' from public.audit_log;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select case when count(*) > 0 then 'PASS' else 'FAIL' end || ': accountant reads audit log (' || count(*) || ' rows)' from public.audit_log;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select case when count(*) > 0 then 'PASS' else 'FAIL' end || ': auditor reads audit log (' || count(*) || ' rows)' from public.audit_log;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ': manager sees ' || count(*) || ' audit rows (expect 0)' from public.audit_log;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ': contributor sees ' || count(*) || ' audit rows (expect 0)' from public.audit_log;
do $$ begin
  insert into public.audit_log (table_name, record_id, action) values ('x', gen_random_uuid(), 'insert');
  raise notice 'FAIL: direct audit_log INSERT allowed';
exception when insufficient_privilege then
  raise notice 'PASS: direct audit_log INSERT refused (42501)';
end $$;
rollback;

\echo ''
\echo '=== 8. DOCUMENT ROWS: personal docs hidden from non-subject contributors; oversight sees all ==='
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select case when count(*) = 3 then 'PASS' else 'FAIL' end || ': contributor sees org+vehicle+OWN personal docs (' || count(*) || '/3)' from public.documents;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ': contributor sees manager''s personal doc ' || count(*) || ' times (expect 0)'
  from public.documents where id = '33333333-0000-0000-0000-000000000004';
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
select case when count(*) = 2 then 'PASS' else 'FAIL' end || ': contributor2 sees only org+vehicle docs (' || count(*) || '/2)' from public.documents;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select case when count(*) = 4 then 'PASS' else 'FAIL' end || ': auditor (oversight) sees all docs (' || count(*) || '/4)' from public.documents;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ': v_driver_credentials shows contributor2 ' || count(*) || ' rows (expect 0)' from public.v_driver_credentials;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
select case when count(*) = 2 then 'PASS' else 'FAIL' end || ': v_driver_credentials shows accountant all ' || count(*) || '/2 credentials' from public.v_driver_credentials;
rollback;

\echo ''
\echo '=== 9. DOCUMENT FILES (finding 1): personal files gated by personal/<profile_id>/ prefix ==='
-- Fixtures: 1 entity-prefixed org file + 2 personal files (manager 02, contributor 03).
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
select case when count(*) = 1 then 'PASS' else 'FAIL' end || ': contributor2 lists ' || count(*) || '/1 file (org only, no one else''s credentials)'
  from storage.objects where bucket_id = 'documents';
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ': contributor2 sees ' || count(*) || ' personal files of OTHER users (expect 0)'
  from storage.objects where bucket_id = 'documents'
   and split_part(name, '/', 1) = 'personal'
   and split_part(name, '/', 2) <> '00000000-0000-0000-0000-000000000006';
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select case when count(*) = 2 then 'PASS' else 'FAIL' end || ': contributor lists ' || count(*) || '/2 files (org + OWN license)'
  from storage.objects where bucket_id = 'documents';
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select case when count(*) = 3 then 'PASS' else 'FAIL' end || ': auditor (oversight) lists all ' || count(*) || '/3 files' from storage.objects where bucket_id = 'documents';
rollback;
-- Upload-path enforcement: a contributor may not drop files into someone else's personal prefix.
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
do $$ begin
  insert into storage.objects (bucket_id, name, owner)
  values ('documents', 'personal/00000000-0000-0000-0000-000000000002/planted.pdf', auth.uid());
  raise notice 'FAIL: contributor uploaded into ANOTHER user''s personal prefix';
exception when insufficient_privilege then
  raise notice 'PASS: contributor upload into another user''s personal prefix refused (42501)';
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name, owner)
  values ('documents', 'personal/00000000-0000-0000-0000-000000000003/mine.pdf', auth.uid());
  raise notice 'PASS: contributor uploaded into their OWN personal prefix';
exception when insufficient_privilege then
  raise notice 'FAIL: contributor upload into their OWN personal prefix refused';
end $$;
rollback;

\echo ''
\echo '=== 10. created_by FORGERY (finding 2): supplied created_by must be overridden ==='
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
insert into public.trips (id, entity_id, vehicle_id, category_id, trip_date, distance_miles, created_by)
  values ('11111111-0000-0000-0000-000000000099',
          (select id from public.entities where is_primary),
          '22222222-0000-0000-0000-000000000001',
          (select id from public.trip_categories where name = 'Business'),
          '2026-07-05', 5, '00000000-0000-0000-0000-000000000002');
select case when created_by = '00000000-0000-0000-0000-000000000003'
            then 'PASS: created_by forced to the actual user despite a forged value'
            else 'FAIL: contributor stamped created_by = ' || right(created_by::text, 2) || ' (another user)' end
  from public.trips where id = '11111111-0000-0000-0000-000000000099';
rollback;

\echo ''
\echo '=== 11. DEMOTION (finding 3): a user demoted to auditor loses edit/delete on their old records ==='
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
update public.profiles set role = 'auditor' where id = '00000000-0000-0000-0000-000000000006';
commit;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
with u as (update public.trips set notes = 'edited while auditor' where id = '11111111-0000-0000-0000-000000000006' returning 1)
select case when count(*) = 0 then 'PASS: demoted auditor cannot edit their old records'
       else 'FAIL: demoted auditor edited their own old trip (' || count(*) || ' row)' end from u;
with d as (delete from public.trips where id = '11111111-0000-0000-0000-000000000006' returning 1)
select case when count(*) = 0 then 'PASS: demoted auditor cannot delete their old records'
       else 'FAIL: demoted auditor deleted their own old trip (' || count(*) || ' row)' end from d;
rollback;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
update public.profiles set role = 'contributor' where id = '00000000-0000-0000-0000-000000000006';
commit;

\echo ''
\echo '=== 12. FLEET CONFIG (intentional): saved_locations / maintenance_schedules are owner/manager-only ==='
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
do $$ begin
  insert into public.saved_locations (name, latitude, longitude) values ('Test Loc', 40.0, -86.0);
  raise notice 'FAIL: contributor created a saved location (fleet config should be owner/manager)';
exception when insufficient_privilege then
  raise notice 'PASS: contributor cannot create saved locations (owner/manager only, by design)';
end $$;
do $$ begin
  insert into public.maintenance_schedules (vehicle_id, maintenance_type_id, interval_miles)
  values ('22222222-0000-0000-0000-000000000001', (select id from public.maintenance_types where key = 'oil_change'), 5000);
  raise notice 'FAIL: contributor created a maintenance schedule (fleet config should be owner/manager)';
exception when insufficient_privilege then
  raise notice 'PASS: contributor cannot create maintenance schedules (owner/manager only, by design)';
end $$;
do $$ begin
  insert into public.maintenance_records (vehicle_id, maintenance_type_id, service_date, entity_id)
  values ('22222222-0000-0000-0000-000000000001', (select id from public.maintenance_types where key = 'oil_change'), '2026-07-01', null);
  raise notice 'PASS: contributor CAN create maintenance records (operational data)';
exception when insufficient_privilege then
  raise notice 'FAIL: contributor cannot create maintenance records';
end $$;
rollback;

\echo ''
\echo '=== 13. Deduction math sanity (v_trip_details, 2026 business rate 0.70) ==='
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
select case when applied_rate = 0.700 and deduction_amount = 7.00 then 'PASS' else 'FAIL' end
       || ': 10 mi business trip -> rate ' || applied_rate || ', deduction ' || deduction_amount
  from public.v_trip_details where id = '11111111-0000-0000-0000-000000000001';
rollback;

\echo ''
\echo '=== 14. DEACTIVATION (finding 4): is_active enforced at the database ==='
-- Owner deactivates contributor2 (direct table update; the app additionally
-- bans the Auth account via the set-user-active Edge Function).
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
update public.profiles set is_active = false where id = '00000000-0000-0000-0000-000000000006';
commit;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ': deactivated user reads ' || count(*) || ' trips (expect 0)' from public.trips;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ': deactivated user reads ' || count(*) || ' documents (expect 0)' from public.documents;
select case when count(*) = 0 then 'PASS' else 'FAIL' end || ': deactivated user lists ' || count(*) || ' storage files (expect 0)' from storage.objects;
select case when count(*) = 1 and bool_and(not is_active)
            then 'PASS: deactivated user still reads OWN profile (so the app can show the deactivated message)'
            else 'FAIL: deactivated user profile visibility wrong' end
  from public.profiles where id = auth.uid();
select case when count(*) = 1 then 'PASS' else 'FAIL' end || ': deactivated user sees ' || count(*) || ' profile rows total (own row only)' from public.profiles;
do $$ begin
  update public.profiles set is_active = true where id = '00000000-0000-0000-0000-000000000006';
  if exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-000000000006' and is_active) then
    raise notice 'FAIL: deactivated user RE-ACTIVATED THEMSELF';
  else
    raise notice 'PASS: self-reactivation attempt changed nothing';
  end if;
exception when others then
  raise notice 'PASS: self-reactivation refused (%)', sqlerrm;
end $$;
do $$ begin
  insert into public.trips (entity_id, vehicle_id, category_id, trip_date, distance_miles)
  values ((select id from public.entities where is_primary),
          '22222222-0000-0000-0000-000000000001',
          (select id from public.trip_categories where name = 'Business'), '2026-07-05', 5);
  raise notice 'FAIL: deactivated user CREATED a trip';
exception when insufficient_privilege or not_null_violation then
  -- not_null_violation is also a pass: the entity/category subselects return
  -- NULL because the deactivated user can no longer read reference tables.
  raise notice 'PASS: deactivated user cannot create trips';
end $$;
rollback;
-- An ACTIVE contributor must not be able to deactivate/reactivate anyone.
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
do $$ begin
  update public.profiles set is_active = false where id = '00000000-0000-0000-0000-000000000003';
  raise notice 'FAIL: contributor changed their own is_active';
exception when others then
  raise notice 'PASS: contributor self-deactivation refused (%)', sqlerrm;
end $$;
rollback;
-- Owner reactivates.
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
update public.profiles set is_active = true where id = '00000000-0000-0000-0000-000000000006';
commit;
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', true);
select case when count(*) = 4 then 'PASS' else 'FAIL' end || ': reactivated user reads all trips again (' || count(*) || '/4)' from public.trips;
rollback;
-- Last-active-owner guard: the sole owner cannot deactivate or demote themself.
begin; set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
do $$ begin
  update public.profiles set is_active = false where id = '00000000-0000-0000-0000-000000000001';
  raise notice 'FAIL: the last active owner deactivated themself';
exception when others then
  raise notice 'PASS: last-active-owner deactivation refused (%)', sqlerrm;
end $$;
do $$ begin
  update public.profiles set role = 'contributor' where id = '00000000-0000-0000-0000-000000000001';
  raise notice 'FAIL: the last active owner demoted themself';
exception when others then
  raise notice 'PASS: last-active-owner demotion refused (%)', sqlerrm;
end $$;
rollback;
