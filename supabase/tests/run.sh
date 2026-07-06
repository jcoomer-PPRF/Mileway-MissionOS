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
OUT="$("$PSQL" -d "$DB" -X -f "$TESTS_DIR/role_matrix.sql" 2>&1 \
  | sed 's/^psql:.*NOTICE:  //' \
  | grep -E '^(===|PASS|FAIL)' || true)"
echo "$OUT"

echo
if echo "$OUT" | grep -q '^FAIL'; then
  echo "RESULT: $(echo "$OUT" | grep -c '^FAIL') FAILURE(S)"
  exit 1
fi
echo "RESULT: all $(echo "$OUT" | grep -c '^PASS') checks passed"
