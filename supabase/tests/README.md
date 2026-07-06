# RLS verification suite

Proves, at a real Postgres database, that the migrations in `../migrations/`
enforce the five-tier role model — the review described in
`MILEWAY_MIGRATION_RUNBOOK.md`, executed as SQL instead of by hand. It was
first used on 2026-07-06 to verify migrations 0001–0010; it found the four
security gaps that migration 0011 closes, and its expectations now encode the
hardened (post-0011) contract.

## What it does

- `shim.sql` — recreates the minimum Supabase environment on plain Postgres:
  `auth.uid()` + `auth.users`, the `storage` schema with RLS, and the
  `authenticated` / `anon` / `service_role` roles. Table/RLS behavior is exact;
  real Auth (login, bans) and the Storage HTTP API are not simulated — the
  cloud runbook still covers those layers.
- `fixtures.sql` — six users (the five tiers plus a second contributor),
  roles assigned by the owner through the real RLS/trigger path, and records
  created by different users so cross-user rules can be tested.
- `role_matrix.sql` — every cell of the runbook's role matrix plus the
  regression tests for the 0011 findings: storage prefix gating of personal
  credential files, `created_by` forgery, residual edit rights after
  demotion, and `is_active` enforcement. Impersonation is `SET ROLE
  authenticated` + the JWT `sub` claim — the exact context PostgREST gives a
  logged-in user.

## Running it

Start any scratch Postgres (17 used originally), then:

```bash
PGHOST=127.0.0.1 PGPORT=55432 PGUSER=postgres ./run.sh
```

The runner drops/recreates the test database, applies the shim, applies every
migration one file per transaction (which is also what proves the 0006→0007
enum-ordering rule), loads fixtures, runs the matrix, and exits non-zero on
any `FAIL`.

Expected results:

- migrations 0001–0010 only: sections 9–11 and 14 FAIL (the four findings).
- migrations 0001–0011: everything passes.

Two reading rules for the output: refused INSERTs surface as error `42501`;
refused UPDATE/DELETEs surface as **0 rows affected**, not as errors — that is
how RLS `USING` clauses behave, and it is why the matrix checks row counts.
