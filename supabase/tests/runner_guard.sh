#!/usr/bin/env sh
# No real database is touched: a fake psql proves the runner fails closed.
set -eu
test_dir="$(CDPATH='' cd -- "$(dirname "$0")" && pwd)"
fake="$(mktemp)"
log="$(mktemp)"
trap 'rm -f "$fake" "$log"' EXIT
cat > "$fake" <<'EOF'
#!/usr/bin/env sh
case "$*" in
  *role_matrix.sql*)
    if [ "$RUNNER_GUARD_CASE" = sql_error ]; then echo 'ERROR: broken SQL'; exit 1; fi
    if [ "$RUNNER_GUARD_CASE" = incomplete ]; then echo 'PASS: only one check'; fi
    exit 0 ;;
esac
exit 0
EOF
chmod +x "$fake"
for guard_case in sql_error empty incomplete; do
  if RUNNER_GUARD_CASE="$guard_case" PSQL="$fake" bash "$test_dir/run.sh" mileway_guard_test > "$log" 2>&1; then
    cat "$log" >&2
    echo "FAIL: runner accepted $guard_case" >&2
    exit 1
  fi
  case "$guard_case" in
    sql_error) expected='ERROR: broken SQL' ;;
    *) expected='RESULT: incomplete matrix' ;;
  esac
  grep -q "$expected" "$log" || { cat "$log" >&2; exit 1; }
  echo "PASS: runner rejects $guard_case"
done
