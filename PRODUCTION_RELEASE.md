# MissionOS production release preparation

Working release plan, 2026-10-24. PR #1 was merged as
`d35ca6963a094dbaea9436a96c6005f6ea8e8619`; its
[post-merge CI passed](https://github.com/jcoomer-PPRF/Mileway-MissionOS/actions/runs/40048249299).
The dated staging evidence remains a pre-merge snapshot. This document prepares
the next release; it is not a claim that production has been deployed.

## Hosting alongside Squarespace

The requested website is `www.peerpoint.org`, managed through Squarespace.
Recommended app address: **`https://missionos.peerpoint.org`** on a separate static
app host. The existing Vite app builds to `dist/`; Squarespace continues serving
the main website. A website link can open the app directly.

Cloudflare Pages is a suitable hosting option, pending the account owner's choice
and account access. Its custom-subdomain setup supports an external DNS provider;
moving the root domain or changing nameservers is unnecessary.

Public DNS inspection on 2026-10-24 found `www` pointing to
`ext-sq.squarespace.com`, Google Domains nameservers for the root, and NXDOMAIN for
`missionos.peerpoint.org`. Public DNS does not prove which account controls the
domain; confirm the authoritative DNS dashboard before editing.

Prepare the host with these settings:

| Setting | Value |
| --- | --- |
| Repository | `jcoomer-PPRF/Mileway-MissionOS` |
| Release source | The reviewed commit, initially `d35ca6963a094dbaea9436a96c6005f6ea8e8619` |
| Node | 24 |
| Install | `npm ci --ignore-scripts` |
| Build | `npm run build` |
| Static output | `dist` |
| Build variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| SPA routing | Requests such as `/reports` must fall back to `index.html` |

The existing client variable name accepts a Supabase publishable key or compatible
legacy anon key. Every `VITE_` value is public browser configuration. Service-role
keys, database passwords, SMTP credentials, and OAuth secrets belong outside the
frontend build. Use staging variables for previews and the selected production
project only for the production build.

For the first controlled release, use a reviewed-commit build and a manual upload,
or disable automatic production deployments on the Git-integrated project. A Git
integration normally deploys on pushes; merging a later PR must not publish a
schema-dependent frontend before its backend is ready. Do not connect an
automatically publishing host until that release behavior is agreed.

Register `missionos.peerpoint.org` in the Pages project's **Custom domains** first.
Only then add this record at the current authoritative DNS provider:

| Type | Host | Target |
| --- | --- | --- |
| CNAME | `missionos` | The actual assigned `<project>.pages.dev` hostname |

The target is a placeholder until a project exists. Follow the subdomain-specific
Squarespace instructions; root-domain replacement instructions do not apply.
Preserve the website's root/`www` records, mail records, and nameservers. Verify
DNS and the issued HTTPS certificate before changing Supabase redirect settings.
An iframe embed is unnecessary for this setup.

Sources checked 2026-10-24:

- [Squarespace: point a domain or subdomain to another host](https://support.squarespace.com/hc/en-us/articles/215744668-Pointing-a-Squarespace-domain).
- [Cloudflare Pages: external DNS and custom subdomains](https://developers.cloudflare.com/pages/configuration/custom-domains/).
- [Cloudflare Pages: React builds and SPA routing](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/).

## Database and account readiness

The original candidate production project is `pwcrmerycnosgxegdnqj` in
`jcoomer-PPRF's main`. It was resumed on 2026-10-24 and reached `ACTIVE_HEALTHY`.
After it was healthy, the catalog, migration list, and Edge Function list confirmed
no public application tables, app roles, migrations, Auth users, Storage buckets,
Storage objects, or Edge Functions. The security advisor returned no lints for
this empty project. This is a fresh-install candidate; no existing MissionOS
records need an upgrade. Its schema and application configuration remain unchanged.
Recheck before installation because other administrators can change the project.

Run `supabase/preflight/catalog.sql` first with operator access. It reports schema,
role labels, bucket visibility, object count, and Auth user count without returning
emails, tokens, or file paths. Both scripts explicitly use read-only transactions
and a statement timeout. Do not run the destructive scratch test runners against
any hosted project.

Then inspect migration history and schema definitions. If the MissionOS schema
through `0010` exists, run `supabase/preflight/integrity.sql` to count conflicting
document scopes, duplicate paths, missing files, odometer inconsistencies, active
owners, entity placeholders, and configured rates. These are operator snapshots,
not backups or an automatic release decision. A database with no migration history
can still contain manually applied tables; do not blindly push all migrations.

Both scripts were run successfully on hosted staging on 2026-10-24; the catalog
script also ran successfully on the resumed original project. The integrity script
was intentionally not run against the empty original database. Staging has
no conflicting scopes, duplicate document paths, missing referenced files, or
inconsistent odometer trips. Its two entity records and seeded 2026 rates still
need real configuration. Detailed operator responses belong in the private release
record; original-project findings are not inferred from staging.

Before changing the original database, obtain a restorable database backup and a
separate Storage object backup/inventory. Database backups do not contain file
contents. Review pending migrations against actual schema/history and apply each
file separately, following `MILEWAY_MIGRATION_RUNBOOK.md`. Preserve existing
accounts and deliberately resolve historical inconsistencies. Deploy the matching
`set-user-active` function with JWT verification enabled.

For a fresh installation, explicitly invite the intended first owner before
signup. Confirm the owner email privately; never infer it from a connector account.
For an upgrade, inspect existing owners and retain access rather than seeding a
new privileged account automatically.

## Live configuration and acceptance

Once the app origin is assigned, set Supabase Site URL to that HTTPS origin and
allow only intended redirect origins. The Google OAuth callback is the selected
Supabase project's `/auth/v1/callback`, while the application's post-login redirect
is its own origin. Configure the intended Google client and real email delivery,
then test confirmation and sign-in with a consenting human mailbox. Staging's
Admin-confirmed fictional accounts did not validate email delivery or Google login.

Confirm legal names/EINs and category classifications with the responsible owner.
The 2026 seeded rates are placeholders. The IRS table checked on 2026-10-24 lists
two date ranges, in dollars per mile:

| Effective date | Business | Medical | Charitable |
| --- | --- | --- | --- |
| 2026-01-01 | 0.725 | 0.205 | 0.140 |
| 2026-07-01 | 0.760 | 0.235 | 0.140 |

Source: [IRS standard mileage rates](https://www.irs.gov/tax-professionals/standard-mileage-rates).
These are reference rates, not a determination of eligibility or an organization's
reimbursement policy. Review any existing reports before changing effective-dated
rows: the reporting views derive estimates from those rows, so updating a historical
rate changes later exports of the same trips. No rate changes are applied by this plan.

After the matched backend/frontend release, validate HTTPS and direct navigation
to `/reports`, real sign-in, a fictional upload/download, role restrictions, account
deactivation/retry, and report totals. Record the exact deployed commit/project/origin.
Keep account edits paused during any schema/function/frontend transition.

Review the existing dependency findings, remaining intentional advisor notices,
backup operations, and plan suitability before routine live use. Free Supabase
projects can pause after inactivity; a production availability/billing decision
belongs to the account owner, not this build preparation.

If frontend acceptance fails, stop access and restore the prior frontend only if
it is compatible with the deployed schema/function. Do not reverse migrations by
deleting tables or overwriting production. Data restoration requires the reviewed
backup and a separate recovery decision.
