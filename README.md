# MissionOS

MissionOS is being expanded around peer-support Mission Delivery, with the existing
fleet application retained under Operations. **MD01 is a fictional, in-memory
workflow demonstration; service documentation remains in OneStep.** No care
storage, AI drafting, voice/watch capture, or legal signing is included.

Start the independent preview without Supabase credentials:

```sh
npm ci --ignore-scripts
npm run dev:md01
```

Open `/demo.html`. For a compiled local review, use `npm run build:md01` and
`npm run preview:md01`. See [MD01_BUILD.md](MD01_BUILD.md) for scope, role/state
rules, acceptance evidence and reset/export behavior. The default `npm run build`
continues to create only the authenticated application; the demonstration entry
is excluded. MD01 has not been merged or deployed by this build assignment.

The authenticated application's `/` route is now the Mission Delivery landing.
The previous fleet dashboard is at `/operations` (also `/dashboard`). Existing
fleet, report, document, audit and settings deep links retain their paths and
authorization checks.

The historical component documentation below describes the fleet implementation.
Its reminder/resident roadmap does not define the current MissionOS product.

---

# Fleet component documentation

Internal operations app for a two-entity organization — a **501(c)(3) foundation** (primary)
and an **operating LLC** beneath it. Mileway handles **mileage logging, vehicle and
fleet-maintenance records, expense capture, saved locations, and a document/credential store**,
with consolidated and per-entity reporting plus an immutable audit trail.

---

## Tech stack

A **Vite + React + TypeScript single-page app** backed by **Supabase** (hosted Postgres, Auth,
Storage). A pure client-side SPA builds to static assets, so the same build can later be wrapped
by **Capacitor** into native iOS/Android with no rearchitecting. Supabase provides email + Google
auth, private file storage (receipts + documents), and **row-level security that enforces the five
roles at the database layer** — defense-in-depth that matters for an auditor-facing app.

| Concern         | Choice                                                   |
| --------------- | -------------------------------------------------------- |
| Frontend        | Vite, React 18, TypeScript, React Router                 |
| UI              | Tailwind CSS, lucide-react icons                         |
| Server state    | TanStack Query, `@supabase/supabase-js`                  |
| Tables / charts | TanStack Table, Recharts                                 |
| Export          | SheetJS (`xlsx`) for multi-tab Excel; native CSV         |
| Backend / data  | Supabase: Postgres + RLS, Auth (email + Google), Storage |
| Mobile (later)  | Capacitor wraps `dist/`                                  |

---

## Dependency security

See [MD01 dependency remediation](DEPENDENCY_REMEDIATION.md) for the patched
build/router dependencies, official vendored SheetJS package, parser override,
and regression coverage. `npm run audit:dependencies` checks the full dependency
tree; CI fails for known findings at any severity. Installation remains
`npm ci --ignore-scripts`. Publication requires a separate release decision.

## Getting started

### 1. Install

```bash
node --version  # Node 24 or newer
npm ci
```

### 2. Create a Supabase project

1. Create a project at <https://supabase.com>.
2. In **Project Settings → API**, copy the **Project URL** and **anon public key**.
3. Copy the env template and fill it in:

   ```bash
   cp .env.example .env
   # edit .env:
   # VITE_SUPABASE_URL=...
   # VITE_SUPABASE_ANON_KEY=...
   ```

### 3. Apply the database schema

Run the migrations in `supabase/migrations/` **in order, one at a time** (`0001` → `0014`, then
`20261023230154_hosted_function_permissions.sql`; 15 files total).
**Do not paste several files into a single SQL Editor run:** migration **`0006` adds the new role
enum values and `0007` uses them**, and Postgres cannot add _and_ use an enum value in the same
transaction — so `0006` must commit before `0007` runs. Either:

- **Supabase Dashboard → SQL Editor**: paste each file’s contents and run it, one file at a time,
  in numeric order; or
- **Supabase CLI** (applies each migration in order, each in its own transaction):

  ```bash
  supabase link --project-ref <your-ref>
  supabase db push
  ```

The migrations create every table (entities, vehicles, trips, expenses, saved locations,
maintenance, documents, and their lookups), RLS policies, audit triggers, and reporting views;
create the private **`receipts`** and **`documents`** storage buckets; and seed the two entities,
IRS mileage rates, and the editable lookups (trip/expense categories, job titles, and
location / maintenance / document types).

Before upgrading an existing project, follow the [migration runbook](MILEWAY_MIGRATION_RUNBOOK.md).
Migration `0012` rejects mixed document scopes and duplicate file references; `0013` rejects
historical odometer distances that disagree with their endpoints. Review corrections before applying.

For a **fresh project**, after all migrations and before the first signup, seed the first owner's
invitation using the SQL Editor (substitute your actual email):

```sql
insert into public.user_invitations(email, role)
values (lower('your-owner-email@example.org'), 'owner');
```

Existing accounts remain intact when upgrading. New accounts require an unused, unexpired
invitation matching their email. Owners manage invitations in **Settings → Invitations**; adding
an invitation does not send email. Share the app link separately.

### 4. Configure auth providers

- **Email**: enabled by default. Keep email confirmation enabled for hosted use so the invited email is verified. A disposable test project may disable it for fictional accounts.
- **Google**: **Authentication → Providers → Google**, add your Google OAuth client ID/secret,
  and add your app origin (e.g. `http://localhost:5173`) to **Authentication → URL Configuration →
  Redirect URLs**.

### 5. Deploy the deactivation function

Owner account edits use the `set-user-active` Edge Function. The database commits role,
profile fields, and status together and queues Auth ban/unban synchronization. Deactivation
blocks database access immediately; an Auth outage leaves a pending item with a **Retry sign-in
sync** action in Settings → Users. No compensating update reactivates the database account.
Both ordinary user edits and status changes require this deployed function.

```bash
supabase link --project-ref <your-ref>
supabase functions deploy set-user-active
```

The service-role key stays in the Edge Function environment; never place it in a `VITE_*` variable.

### 6. Run

```bash
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build to dist/
npm run preview  # serve the production build
```

> Signup requires an invitation. Seed the first owner's invitation explicitly; there is no
> automatic first-user ownership grant.

---

## Roles & job titles

Identity is split into two independent fields on each user:

- **Job title** — display/reporting only, with **no bearing on permissions**. Nine titles are
  seeded and the list is editable in **Settings → Job titles**: Super Administrator, Executive
  Director, Administrator, Program Manager, Transportation Coordinator, Employee, Driver,
  Read-Only Auditor, Accountant.
- **Role (permission tier)** — governs access. Five tiers:

| Tier            | Access                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Owner**       | Full access, including settings and user management.                                                                                 |
| **Manager**     | Read/write **all** operational data. No settings or user management.                                                                 |
| **Contributor** | Reads shared operational records and their own personal documents; creates records; edits/deletes **only the records they created**. |
| **Accountant**  | Reads everything (incl. audit log) and runs/exports reports. No operational edits.                                                   |
| **Auditor**     | Read-only access to all records **and the audit log**. No writes.                                                                    |

Enforcement is twofold: the UI hides actions a role can’t take, and **Postgres RLS policies**
enforce the same rules at the database — the API rejects unauthorized writes regardless of the
client. New users receive the role chosen by the inviting owner.

Hardening rules (migrations `0011`–`0014` and the hosted-permissions migration) that apply across all tiers:

- `created_by` / `created_at` are **server-set** — an authenticated insert cannot supply them.
- The own-record edit rule requires a **current** write-tier role: a user moved to Auditor or
  Accountant loses edit/delete on records they created earlier.
- **Deactivation blocks all database reads and writes**, including existing tokens. Auth bans
  synchronize separately; pending retries appear to owners. Only an active owner can restore access.
- Concurrent demotions/deactivations cannot remove the last active owner.
- Account changes discard private cached data; permission changes refresh the account's cache.
- Automated checks cover the role matrix, attachment rules, access synchronization, upgrades,
  concurrent owner changes, browser account switching, and exports. See [tests](supabase/tests/README.md).

---

## Features

### Trips & mileage

Manual trip logging — date, vehicle, category, entity, and distance entered directly or computed
from odometer start/end. Trip categories are editable and each maps to an `irs_rate_type`
(business / medical / charitable / none); the date-effective rate is applied to compute an
estimated deduction. Optional **start / end saved-location pickers** drive **auto-categorization**:
choosing a saved location applies that location’s default trip category, and a manual category
change clears the auto-categorized flag. Trips also carry GPS/location columns in the schema
(start/end lat-lng, timestamps, route, saved-location references).

### Vehicles

VIN, plate, year/make/model, odometer, and insurance & registration with expiration dates.

### Expenses

Amount, date, category, entity, optional vehicle link, and an optional receipt image stored in the
private `receipts` bucket (file only — **no OCR**).

### Locations (geofences)

Saved locations with coordinates, a radius, a location type, an optional owning entity
(or shared across both), and a default trip category that powers auto-categorization. Location
types are editable (seeded: Home, Group Home, Hospital, Pharmacy, County Office, Day Program,
Employment Site, Vendor).

### Fleet maintenance

Service **records** (type, date, odometer, cost, vendor, optional link to an expense), per-vehicle
**schedules** with mileage and/or month intervals, and a computed **due** view that flags what’s
due or overdue using each vehicle’s current odometer (derived from trips) and last service.
Maintenance types are editable (seeded: Oil Change, Tire Rotation, Brake Service, Repair,
Inspection, Registration Renewal, Insurance Renewal).

### Documents & driver credentials

A central store for documents scoped to the **organization**, a **vehicle**, or a **person**, each
with a type, issue/expiration dates, tags, and an uploaded file in the private `documents` bucket.
**Personal (per-person) documents are visible only to the subject and to oversight roles**
(owner / manager / accountant / auditor); organization and vehicle documents are visible to all
authenticated users. This holds for the **files as well as the rows**: Storage reads follow the saved document's
current scope, including legacy paths and scope changes. Unattached uploads are private to the
uploader and owner/manager roles. Downloads authenticate each request with a fresh cache nonce and no-store fetch instead of
creating signed links. New document uploads disable persistent caching. Earlier cached responses
may remain available until their cache expires. Previously issued signed URLs remain valid until their original expiry; downloaded copies
cannot be recalled. Expiration tracking and a driver-credentials view surface upcoming and lapsed
credentials. Document types are editable (seeded: Bylaws, IRS Determination Letter, Insurance
Policy, Policy / Procedure, Vehicle Title, Registration Document, Insurance Card, Driver License,
Insurance Verification, Background Check, Training / Safety Certificate, Other).

### Dashboard

Business miles (month + YTD), miles by entity, vehicle & fuel costs, and estimated IRS mileage
deduction — plus a **Needs attention** panel surfacing maintenance due, upcoming vehicle
insurance/registration expirations, and expiring documents (in-app only).

### Settings (owner only)

Entities, trip categories, expense categories, mileage rates, and the lookups — location types,
maintenance types, document types, and job titles — plus **Users** (role, job title, status, sign-in sync) and **Invitations** (email and role).

### Audit

Every insert/update/delete on every table is mirrored to an append-only `audit_log`, readable by
owner, accountant, and auditor.

---

## Data model

All tables carry immutable `created_at` / `created_by` and auto-maintained `updated_at` /
`updated_by` (triggers in `0001_schema.sql`), and every change is mirrored into an append-only
`audit_log`.

**Core**

- **entities** — the two legal entities (Foundation = primary, Operating LLC). Every record
  references one.
- **profiles** — users (1:1 with `auth.users`), carrying `role`, optional `job_title_id`, and an
  optional default entity.
- **vehicles** — VIN, plate, year/make/model, odometer, insurance & registration (with expirations).
- **trip_categories** — editable; each maps to an `irs_rate_type` (business/medical/charitable/none).
- **expense_categories** — Fuel, Repairs, Maintenance, Parking, Tolls, Supplies (stable `key`).
- **mileage_rates** — date-effective IRS rates per type; the rate effective on a trip’s date applies.
- **trips** — date, vehicle, category, entity, distance (entered or from odometer), notes, plus
  GPS/location fields (start/end lat-lng, timestamps, route, saved-location refs, `auto_categorized`).
- **expenses** — amount, date, category, entity, optional vehicle, optional receipt file.
- **audit_log** — immutable who/when/what (old & new JSON) for every insert/update/delete.

**Locations, maintenance & documents**

- **job_titles** — editable job-title lookup (display/reporting only).
- **location_types** / **saved_locations** — geofence lookup + saved locations (coords, radius,
  default trip category; `entity_id` NULL = shared across both entities).
- **maintenance_types** / **maintenance_records** / **maintenance_schedules** — service catalog,
  service history, and per-vehicle interval schedules.
- **document_types** / **documents** — document catalog + the document store (org/vehicle/person
  scope, issue/expiration dates, tags, file).

**Views** (all `security_invoker`, so each user’s RLS still applies)

- **v_trip_details**, **v_expense_details** — flatten joins; `v_trip_details` also computes the
  applied rate + estimated deduction.
- **v_vehicle_odometer** — current odometer per vehicle, derived from vehicle, completed trip, and completed service readings.
- **v_maintenance_due** — schedules joined to odometer + last service to flag due/overdue.
- **v_documents_expiring** — documents with an expiration date, ordered by time remaining.
- **v_driver_credentials** — per-person credential documents.

Geofence helpers `earth_distance_m()` / `find_location_for_point()` support point-in-location
lookups.

---

## Reports & export

- **IRS-format mileage log**, **per-entity mileage summary**, **expense report**, and
  **maintenance report** — filterable by entity (single or consolidated) and date range.
- Reports page through all matching rows; query errors make reports unavailable instead of exporting partial totals. Dashboard YTD ends today. Odometer distances are calculated by the database, and completed service history advances maintenance thresholds.
- Export any report to **CSV**, or to **Excel**. The **Full workbook** export produces one `.xlsx`
  with separate **Trips / Vehicles / Expenses / Maintenance** tabs.

---

## Decisions & assumptions to confirm

- **IRS rates** are seeded as editable, date-effective defaults. Charitable is statutory (14¢);
  the **2026 business/medical rows are placeholders** copied from 2025 — verify against current IRS
  guidance in **Settings → Mileage rates**.
- **Category → rate-type mapping** (e.g. Pharmacy → medical, Fundraising → charitable) is a sensible
  default; confirm classifications with your tax advisor in **Settings → Trip categories**.
- **Contributors read shared operational records and their own personal documents**, and write only their own records.
- **Expense → vehicle is optional** (covers non-vehicle costs like general supplies).
- Entity **legal names / EINs** are placeholders — set them in **Settings → Entities**.

---

## Not yet built

Native GPS capture / automatic trip recording (the schema carries GPS + geofence fields and a
`find_location_for_point()` helper, but today distance is entered manually and categories are
applied via location selection); automated email/push reminders (expirations and due items are
surfaced in-app only); and a residents / appointments / funding module. No OCR; no
accounting / payroll / banking integrations.

---

## Project layout

```
supabase/migrations/   SQL: schema, RLS, views, seed, storage, hardening (0001–0014 + hosted function permissions)
supabase/functions/    Edge Functions: set-user-active (deactivation + Auth ban)
supabase/tests/        executable SQL role, integrity, concurrency, and upgrade tests
tests/                 unit and mocked browser regression tests
.github/workflows/     repeatable CI validation
src/
  lib/                 supabase client, utils, metrics, export (csv/excel/reports)
  contexts/            AuthContext (session + profile + role)
  hooks/               TanStack Query data hooks (one per domain)
  components/
    ui/                primitives (button, input, modal, …)
    common/            DataTable, EntityFilter, StatCard, …
    forms/             Trip, Vehicle, Expense, SavedLocation, MaintenanceRecord,
                       MaintenanceSchedule, Document
    settings/          admin settings sections (entities, categories, rates, lookups, users)
    layout/            AppLayout (sidebar + topbar)
    auth/              route guards
  pages/               Dashboard, Trips, Vehicles, Maintenance, Expenses, Locations,
                       Documents, Reports, Audit, Settings, Login
```

> `npm run db:types` regenerates `src/types/supabase.ts` from a linked Supabase project
> (requires the Supabase CLI). Hand-written row types live in `src/types/db.ts`.

## Validation

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
bash supabase/tests/run.sh mileway_local_test  # disposable PostgreSQL only
bash supabase/tests/upgrade.sh               # separate disposable upgrade database
sh supabase/tests/runner_guard.sh
```

SQL commands require `psql` and standard `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD` connection variables.
The runners recreate their named scratch databases. Browser tests use fictional API responses;
SQL tests use a minimal Supabase shim, including hosted default function grants. Completed
hosted validation is recorded in [STAGING_VALIDATION.md](STAGING_VALIDATION.md). Provider and
production release checks remain in
[MILEWAY_MIGRATION_RUNBOOK.md](MILEWAY_MIGRATION_RUNBOOK.md).
PR #1 is merged; the post-merge hosting recommendation, read-only preflight scripts,
and remaining live setup are in [PRODUCTION_RELEASE.md](PRODUCTION_RELEASE.md).

If attachment cleanup fails after a successful save, the record remains saved and a warning is
logged. An administrator can retry removing the unreferenced object through the Storage API;
never delete file metadata directly with SQL. Existing dependency findings (including SheetJS
and older frontend tooling) remain a separate upgrade task; this change does not resolve them.
