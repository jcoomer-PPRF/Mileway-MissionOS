# Hardening and integrity implementation review

Prepared on `codex/hardening-and-integrity` from the existing `claude/hardening-0011` branch.
The full change includes that branch's three commits plus this implementation. This document
records local validation; `STAGING_VALIDATION.md` adds the completed hosted checks and fixes.
No production deployment has occurred.

## Result

- Invitations gate new accounts; existing accounts survive upgrades. Fresh installs explicitly
  invite their first owner. Active-owner changes serialize so concurrent demotions cannot remove
  the final active owner.
- Document file reads follow the saved row's scope, including legacy paths and rescoping.
  Read-only users cannot modify owned blobs. RLS prevents renaming referenced objects or deleting
  attachments before references are removed. Managed Storage tables are not altered.
- Owners save account fields/status atomically. Deactivation restricts data immediately; Auth
  ban/unban work is durable and retryable. Retry reads current database status rather than
  replaying stale browser values. No failure compensation reactivates a disabled account.
- Private query caches reset on account/permission changes, and late results cannot populate
  another account's cache. Authenticated downloads replace document signed links.
- Reports load every page, use server entity/date filters, and block exports on query errors.
  Dashboard YTD excludes future records. CSV neutralizes formula text.
- Odometer distance is calculated by the server; historical inconsistencies stop migration.
  Completed service history advances maintenance due thresholds and deletion recomputes them.
- Failed saves/replaced/deleted attachments receive best-effort cleanup through Storage APIs.
- CI and the setup, migration, and handoff documents cover the implemented behavior.

## Local verification — 2026-10-23

| Check                                                       | Result                  |
| ----------------------------------------------------------- | ----------------------- |
| TypeScript app/tests/Edge SDK contract                      | Passed                  |
| Unit tests                                                  | 10 passed               |
| Production build                                            | Passed                  |
| PostgreSQL 17 fresh install, migrations 0001–0014           | Passed                  |
| Existing role matrix                                        | 60 checks passed        |
| Extra integrity and concurrent-owner checks                 | Passed                  |
| Upgrade from 0010 with existing users, records, legacy file | Passed                  |
| Historical mileage preflight rejection                      | Passed                  |
| Test runner rejects SQL errors/empty/incomplete output      | 3 checks passed         |
| Chromium browser tests with fictional APIs                  | 4 passed                |
| Browser CSV under a 137-row API cap                         | All 1,207 rows exported |
| Shell syntax and git whitespace checks                      | Passed                  |

SQL used a scratch container with no published ports and fictional records. Browser tests used
mocked Auth/REST/Storage responses; they did not contact a real Supabase project. Edge code was
checked against the installed Supabase SDK. The later staging pass also executed the function
in hosted Deno with real password Auth, Storage, and database APIs.

## Before release

Review `STAGING_VALIDATION.md` for 39 passed hosted API checks and 2 real browser flows.
Finish Google/email-provider verification and the production steps in `MILEWAY_MIGRATION_RUNBOOK.md`.
Review preflight results on the actual database. Deploy the matching frontend/function/schema
as one controlled release after review. No production database, storage, or hosting was changed.

Pending Auth work currently requires an owner retry; there is no scheduled reconciliation worker.
Attachment cleanup can require an administrator retry after a Storage outage. Existing signed
URLs remain valid until their original expiry; downloaded copies cannot be recalled. Inactive
users retain the minimal own-profile read used to display account status, but no operational access.

Existing dependency advisories (including SheetJS and older frontend tooling), placeholder IRS
rates/legal entity values, reminder delivery, native GPS, and residents remain outside this change.
GitHub publication requires working repository authorization; confirm actual remote state before
claiming a draft PR exists.
