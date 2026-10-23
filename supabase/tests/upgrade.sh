#!/usr/bin/env bash
# Prove an upgrade from 0010 preserves existing accounts and legacy attachments.
set -euo pipefail
PSQL="${PSQL:-psql}"
DB=mileway_upgrade_test
HERE="$(cd "$(dirname "$0")" && pwd)"
"$PSQL" -X -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB"
"$PSQL" -X -v ON_ERROR_STOP=1 -d postgres -c "create database $DB"
"$PSQL" -X -v ON_ERROR_STOP=1 -1 -d "$DB" -f "$HERE/shim.sql" >/dev/null
for migration in "$HERE"/../migrations/00{01..10}_*.sql; do
  "$PSQL" -X -v ON_ERROR_STOP=1 -1 -d "$DB" -f "$migration" >/dev/null
done
"$PSQL" -X -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000001','existing-owner@test.local'),
 ('00000000-0000-0000-0000-000000000002','existing-subject@test.local'),
 ('00000000-0000-0000-0000-000000000003','existing-other@test.local');
insert into public.vehicles(id,entity_id,make,model) values
 ('22222222-0000-0000-0000-000000000001',(select id from public.entities where is_primary),'Existing','Vehicle');
insert into storage.objects(bucket_id,name,owner) values
 ('documents','legacy-entity-folder/license.pdf','00000000-0000-0000-0000-000000000001');
insert into public.documents(entity_id,document_type_id,profile_id,title,file_path) values
 ((select id from public.entities where is_primary),(select id from public.document_types where key='drivers_license'),
  '00000000-0000-0000-0000-000000000002','Existing license','legacy-entity-folder/license.pdf');
insert into public.trips(entity_id,vehicle_id,category_id,trip_date,distance_source,odometer_start,odometer_end,distance_miles) values
 ((select id from public.entities where is_primary),'22222222-0000-0000-0000-000000000001',
  (select id from public.trip_categories where name='Business'),current_date,'odometer',100,110,999);
SQL
for migration in "$HERE"/../migrations/00{11..12}_*.sql; do
  "$PSQL" -X -v ON_ERROR_STOP=1 -1 -d "$DB" -f "$migration" >/dev/null
done
log="$(mktemp)"
trap 'rm -f "$log"' EXIT
if "$PSQL" -X -v ON_ERROR_STOP=1 -1 -d "$DB" -f "$HERE/../migrations/0013_reporting_integrity.sql" >"$log" 2>&1; then
  echo 'FAIL: inconsistent historical mileage was silently accepted' >&2; exit 1
fi
grep -q 'Correct inconsistent historical odometer distances' "$log"
echo 'PASS: upgrade refuses inconsistent historical mileage'
# Only repair this fictional fixture; production corrections require review.
"$PSQL" -X -v ON_ERROR_STOP=1 -d "$DB" -c "update public.trips set distance_miles=10" >/dev/null
for migration in "$HERE"/../migrations/00{13..14}_*.sql; do
  "$PSQL" -X -v ON_ERROR_STOP=1 -1 -d "$DB" -f "$migration" >/dev/null
done
"$PSQL" -X -v ON_ERROR_STOP=1 -d "$DB" <<'SQL'
do $$ begin
  if (select count(*) from public.profiles) <> 3 then raise exception 'Existing accounts lost'; end if;
  if not exists(select 1 from public.documents where file_path='legacy-entity-folder/license.pdf') then
    raise exception 'Existing attachment reference lost'; end if;
  if not exists(select 1 from public.trips where distance_miles=10) then raise exception 'Existing trip lost'; end if;
end $$;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $$ begin
  if exists(select 1 from storage.objects where name='legacy-entity-folder/license.pdf') then
    raise exception 'Legacy personal file leaked'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $$ begin
  if not exists(select 1 from storage.objects where name='legacy-entity-folder/license.pdf') then
    raise exception 'Subject lost legacy file access'; end if;
end $$;
rollback;
SQL
echo 'PASS: upgrade preserves existing users, records, and protected legacy attachments'
