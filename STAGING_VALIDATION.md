# Hosted staging validation — 2026-10-23

The core hosted checks passed on **missionos-staging** in **jcoomer-PPRF's main**
(US East Ohio, PostgreSQL 17). Supabase quoted $0/month for this Free-plan project.
[Open staging](https://supabase.com/dashboard/project/bgvhqsfpjanmqixtmdtl).
The original inactive project was not restored or changed. No production release occurred.

## Findings fixed before merge

1. **Hosted function grants differed from the original SQL shim.** Supabase directly grants
   function execution to `anon`/`authenticated`; revoking `PUBLIC` alone left some helpers callable
   anonymously, including the attachment-reference helper. The new
   `20261023230154_hosted_function_permissions.sql` migration revokes anonymous execution on
   MissionOS functions, removes signed-in RPC access to trigger/setup functions, and fixes their
   search paths. RLS helpers and owner-guarded account RPCs retain required authenticated access;
   privileged Auth-job RPCs remain service-only. The shim now reproduces hosted default grants.
2. **A repeated download briefly returned a file after its scope became personal.** Subsequent
   fresh requests correctly failed. Document downloads now use a unique SDK cache nonce and
   `cache: 'no-store'`, and new document uploads use `cacheControl: '0'`. Hosted rescope checks
   and browser regressions passed with those settings. This does not recall previously cached
   responses, downloaded copies, or previously issued signed URLs.

## Hosted evidence

All 15 migrations applied to the empty project, each in a separate transaction. The migration
service generated history versions; the source names identify the applied files. An initial
history timestamp collision rolled back completely and succeeded when retried with spacing.
Both buckets are private, all public tables have RLS, and anonymous helper execution is denied.

**39 hosted API checks passed**, covering:

- Real password sign-in and granted roles for seven fictional accounts across all five tiers.
- Operational write restrictions, own-record rules, and server-controlled creation metadata.
- Storage HTTP upload, metadata/content update, authenticated download, unrelated-user download
  and URL-signing denials, oversight access, move denial, and linked/unlinked deletion behavior.
- Personal scope changes at legacy paths, foreign-file attachment denial, and loss of blob
  writes after demotion.
- Server-calculated odometer distance and completed-service maintenance thresholds.
- Anonymous attachment-reference probe denial.
- The deployed `set-user-active` function with ES256 user tokens: database deactivation,
  previously issued JWT restriction, real Auth sign-in ban, and reactivation.
- A deployed test variant injected HTTP 503 only on its Auth Admin request. Database changes,
  queue claims, and job completion used real hosted services. The account stayed restricted,
  work remained pending, and the production-function retry completed the ban without replaying
  a stale browser status. This is dependency fault injection, not an actual Supabase outage.
- Concurrent owner requests preserving the last owner, atomic rollback of rejected account
  changes, ordinary-user RPC refusal, service-only queue claims, and anonymous Edge refusal.

Auth Admin account creation also confirmed uninvited and expired invitations were rejected;
invited fictional users were created with confirmed test emails without sending email.

**Two real browser flows passed** against the hosted APIs:

- Sign in through the app, apply entity/date filters, and export all **1,207** fixture trips to
  both CSV and Excel. Counts matched the inserted hosted records beyond the default API cap.
- Download a document with a fresh authenticated request, sign out, sign in as a contributor,
  and confirm the previous owner's private document is absent.

The browser ran the updated frontend locally. A loopback forwarder relayed requests to the
hosted project through the execution environment's required proxy with TLS verification intact;
there were no mocked Supabase responses in these two flows. This did not publish a frontend URL.

Temporary fixture-provisioning and Auth-outage endpoints were replaced with nonprivileged HTTP
410 responders and checked after testing. Pending fixture account-access jobs were reconciled.
Only fictional test users, files, vehicles, mileage, and service records were used.

## Regression verification

TypeScript checks, production build, 10 unit tests, the 60-check SQL role matrix plus integrity
and concurrent-owner tests, existing-data upgrade/preflight tests, 3 runner-guard checks, and
4 mocked Chromium browser tests passed after the changes. The browser regression now verifies
that consecutive downloads receive different nonces. GitHub CI reruns on the updated PR.

## Remaining release checks and advisor review

- Google OAuth and real email-confirmation delivery require the intended provider credentials
  and a human mailbox. They were not tested; fictional Auth users were confirmed through Admin.
- Review existing production data and migration history before release. The original database
  remains inactive and has not been inspected for upgrade preflight results. Take a backup and
  configure the intended deployment/redirect URLs, entity values, and current IRS rates.
- Anonymous-definer and mutable-search-path advisor warnings were resolved. Authenticated
  definer warnings remain for the reviewed RLS helpers and active-owner RPCs; their restricted
  execution is intentional. The RLS lock table intentionally has no client policy or grants.
  [Definer advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- The Free staging project reports leaked-password protection disabled. Review availability
  and enable it for the intended live Auth setup where supported.
  [Password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Performance advisories identify 39 unindexed foreign keys, 14 RLS initialization patterns,
  10 multiple-policy cases, and 17 unused indexes in the fixture database. These are follow-up
  optimization notices, not failed functional assertions. Retain intentional bucket policies
  and measure the production workload before changing indexes or authorization logic.
  [Performance advisors](https://supabase.com/docs/guides/database/database-linter).
- Previously identified dependency advisories remain a separate maintenance task.

Review the updated PR and its CI before merging; deploy the matching schema/function/frontend
through the controlled release steps in `MILEWAY_MIGRATION_RUNBOOK.md`.
