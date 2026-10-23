#!/usr/bin/env bash
# Applies the shim + all migrations (one file, one transaction — the enum
# ordering rule) + fixtures to a FRESH database, then runs the role matrix.
# Exits non-zero if any test line prints FAIL.
#
# Needs a running Postgres and psql on PATH (or PSQL=/path/to/psql).
# Connection comes from the usual PGHOST/PGPORT/PGUSER/PGPASSWORD env vars.
#
#   PGHOST=127.0.0.1 PGPORT=55432 PGUSER=postgres ./run.sh [dbname]
#
# The target database is dropped and recreated — never point this at a
# database you care about.
set -euo pipefail

PSQL="${PSQL:-psql}"
DB="${1:-mileway_rls_test}"
case "$DB" in
  *[!a-zA-Z0-9_]*|'') echo "Use a simple scratch database name." >&2; exit 1 ;;
esac
case "$DB" in
  mileway_*_test|mileway_test) ;;
  *) echo "Scratch database names must start with mileway_ and end with _test." >&2; exit 1 ;;
esac
TESTS_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS_DIR="$TESTS_DIR/../migrations"

"$PSQL" -d postgres -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB"
"$PSQL" -d postgres -v ON_ERROR_STOP=1 -q -c "create database $DB"

echo "== shim"
"$PSQL" -d "$DB" -v ON_ERROR_STOP=1 -1 -q -f "$TESTS_DIR/shim.sql"

for f in "$MIGRATIONS_DIR"/*.sql; do
  echo "== migration $(basename "$f")"
  "$PSQL" -d "$DB" -v ON_ERROR_STOP=1 -1 -q -f "$f"
done

echo "== fixtures"
"$PSQL" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$TESTS_DIR/fixtures.sql" > /dev/null

echo "== role matrix"
if ! OUT="$("$PSQL" -d "$DB" -X -v ON_ERROR_STOP=1 -f "$TESTS_DIR/role_matrix.sql" 2>&1)"; then
  printf '%s\n' "$OUT" >&2
  exit 1
fi
printf '%s\n' "$OUT"
NORMALIZED="$(printf '%s\n' "$OUT" | sed 's/^psql:.*NOTICE:  //')"
PASS_COUNT="$(printf '%s\n' "$NORMALIZED" | awk '/^PASS:/ {n++} END {print n+0}')"
if printf '%s\n' "$NORMALIZED" | grep -q '^FAIL'; then
  echo 'RESULT: failed checks' >&2
  exit 1
fi
if [ "$PASS_COUNT" -ne 60 ] || ! printf '%s\n' "$OUT" | grep -q '^MATRIX_COMPLETE$'; then
  echo "RESULT: incomplete matrix ($PASS_COUNT/60 checks)" >&2
  exit 1
fi
"$PSQL" -d "$DB" -X -v ON_ERROR_STOP=1 -f "$TESTS_DIR/integrity.sql"
"$TESTS_DIR/concurrency.sh" "$DB"
echo "RESULT: all 60 matrix checks, integrity checks, and concurrency checks passed"
