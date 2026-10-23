# Database and application verification

SQL tests run real PostgreSQL policies, triggers, and reporting views using a minimal
Supabase environment shim. They do not simulate real Auth login, bans, Storage HTTP, or the
Edge runtime. Complete the hosted checklist in `MILEWAY_MIGRATION_RUNBOOK.md` before release.

## Run against disposable PostgreSQL 17

```bash
PGHOST=127.0.0.1 PGPORT=55432 PGUSER=postgres bash supabase/tests/run.sh mileway_local_test
PGHOST=127.0.0.1 PGPORT=55432 PGUSER=postgres bash supabase/tests/upgrade.sh
sh supabase/tests/runner_guard.sh
```

Use standard PostgreSQL connection variables (including `PGPASSWORD` if needed), or set `PSQL`
to the executable path. The first script drops/recreates its target database; names must start
with `mileway_` and end with `_test`. The upgrade test always recreates `mileway_upgrade_test`.
Never run these scripts against a database containing useful data. SQL uses `ON_ERROR_STOP`.

## Coverage

- `shim.sql`: minimal Auth users/UID and Storage tables with both legacy `owner` and modern
  `owner_id`, plus Supabase roles. RLS runs on PostgreSQL; external service plumbing is approximated.
- `fixtures.sql`: invited fictional users for five tiers, a second contributor, and cross-user
  operational records/files. Owners assign roles through the real trigger/RLS path.
- `role_matrix.sql`: 60 assertions covering five roles, server creation fields, demotion,
  inactivity, personal files, and last-owner restrictions. The runner requires all 60 passes
  and `MATRIX_COMPLETE`; SQL errors and empty/partial output fail the run.
- `integrity.sql`: invitation admission, modern/legacy attachment paths and scope changes,
  current-role file writes, foreign references, identity/reference protections, maintenance,
  odometer distance, and durable service-only Auth synchronization.
- `concurrency.sh`: two real database sessions race owner demotions; exactly one owner remains.
- `upgrade.sh`: starts with `0001`–`0010`, existing users and a legacy personal file, proves
  `0013` rejects inconsistent historical mileage, then applies the upgrade and verifies preserved
  accounts/records plus correct legacy-file access. Only fictional fixture mileage is repaired.
- `runner_guard.sh`: fake `psql` confirms SQL errors, empty output, and incomplete output are
  rejected for the intended reason, without touching a real database.

Refused RLS INSERTs usually raise `42501`; refused UPDATE/DELETE often affect zero rows.
Assertions check outcomes rather than relying only on error messages.

## Application and CI

With Node 24+ and `npm ci`:

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit tests cover actual API page caps, incomplete/changed data, cancellation, account caches,
YTD dates, CSV formulas, and Auth synchronization failures/leases. Browser tests use fictional
Auth/REST/Storage responses and Chromium to cover account switching, report failures, complete
1,207-row CSV export, and JWT-authenticated downloads. Set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an installed Chromium binary if needed.

`.github/workflows/verify.yml` runs these checks, including SQL fresh-install and upgrade
validation, on pull requests and the configured branches. Local browser mocks are not evidence
that hosted Supabase APIs or deployed Edge Functions have passed.
