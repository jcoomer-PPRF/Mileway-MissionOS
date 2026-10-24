#!/usr/bin/env sh
set -eu
PSQL="${PSQL:-psql}"
DB="$1"
first_log="$(mktemp)"
second_log="$(mktemp)"
trap 'rm -f "$first_log" "$second_log"' EXIT
"$PSQL" -X -v ON_ERROR_STOP=1 -d "$DB" -q -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true); update public.profiles set role='owner' where id='00000000-0000-0000-0000-000000000002'; commit;" >/dev/null
PGAPPNAME=mileway-owner-race-a "$PSQL" -X -v ON_ERROR_STOP=1 -d "$DB" -q -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true); update public.profiles set role='manager' where id='00000000-0000-0000-0000-000000000001'; select pg_sleep(3); commit;" >"$first_log" 2>&1 &
first_pid=$!
ready=false
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if [ "$("$PSQL" -X -At -d "$DB" -c "select count(*) from pg_stat_activity where application_name='mileway-owner-race-a' and wait_event='PgSleep'")" = 1 ]; then ready=true; break; fi
  sleep 0.1
done
if [ "$ready" != true ]; then wait "$first_pid"; cat "$first_log" >&2; exit 1; fi
if "$PSQL" -X -v ON_ERROR_STOP=1 -d "$DB" -q -c "begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true); update public.profiles set role='manager' where id='00000000-0000-0000-0000-000000000002'; commit;" >"$second_log" 2>&1; then
  wait "$first_pid"; echo 'FAIL: both owners demoted concurrently' >&2; exit 1
fi
wait "$first_pid"
grep -q 'Cannot demote or deactivate the last active owner' "$second_log"
[ "$("$PSQL" -X -At -d "$DB" -c "select count(*) from public.profiles where role='owner' and is_active")" = 1 ]
echo 'PASS: concurrent owner changes preserve an active owner'
