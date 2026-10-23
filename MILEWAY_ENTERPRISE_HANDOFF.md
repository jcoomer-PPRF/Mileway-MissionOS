# Mileway Enterprise — Build Handoff

**Status:** hardening and reporting-integrity implementation prepared on
`codex/hardening-and-integrity`, based on `claude/hardening-0011`. The implementation is published as PR #1, with hosted staging
validation recorded in `STAGING_VALIDATION.md`. Merge and production deployment have not occurred. The source, README, and migration runbook describe
the current behavior. Sections 4–5 preserve the Phase 1/2 history; later hardening supersedes their
bootstrap and file-access behavior.

---

## 1. What Mileway Enterprise is

A single operations platform that runs transportation, mileage, vehicles, expenses, reimbursement, compliance documentation, and reporting across two legal entities from one system.

It replaces a stack of disconnected tools: mileage-tracking apps, vehicle maintenance logs, reimbursement spreadsheets, expense spreadsheets, basic fleet software, transportation-compliance documentation, and — behind a privacy gate, in a later phase — resident transportation logs.

### The holistic end state ("done" looks like this)

- **One backbone for both entities.** A 501(c)(3) foundation and an LLC operate from the same platform. Every record is tagged to one entity; reporting works both per-entity and consolidated.
- **Audit-ready by construction.** Immutable timestamps, an append-only audit trail, and database-enforced access control that would hold up to a funder or regulatory review.
- **Mobile-first, then native.** Usable on the web today; architected so a Capacitor wrapper adds background GPS and push notifications without a rebuild.
- **No duplicate systems.** When the platform is complete, the entities run mileage, fleet, expenses, credentials, and (behind the gate) resident transportation from Mileway alone.

The residents domain is the last and most sensitive piece. It is deliberately not built yet. See section 11.

---

## 2. Architecture and stack

- **Frontend:** Vite + React 18 + TypeScript, single-page app, React Router. Capacitor-ready (not yet packaged) — a pure client-side SPA builds to static assets in `dist/`, which Capacitor can later wrap into native iOS/Android with no rearchitecting.
- **Backend:** Supabase — Postgres, Row-Level Security, Auth (email + Google), Storage (private buckets).
- **Data-model discipline:** all access control lives at the database layer via RLS, not only in the app. The app enforces the same rules a second time in route guards and per-record edit checks.

Use these libraries; don't introduce a parallel one for a job already covered.

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

## 3. The dual-entity model — the non-negotiable core

This is the one part that is expensive to retrofit and must never be compromised:

- A **501(c)(3) foundation** is the primary entity; an **LLC** is the operational arm beneath it.
- **Every** operational record — trip, vehicle, expense, maintenance record, document, location — is assignable to one entity.
- Reporting runs two ways: **filtered to a single entity**, and **consolidated across both**.

Any new table that holds operational data carries an `entity_id`. Shared resources (e.g., a location usable by both entities) use a nullable `entity_id` where null means "shared."

---

## 4. Phase 1 history

**Migrations `0001`–`0005`** (descriptive suffixes, e.g. `0001_schema.sql` holds triggers, `0002_rls.sql` holds the RLS policies).

### Schema

| Table                | Purpose                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `entities`           | The two legal entities                                                                              |
| `profiles`           | Users and their role                                                                                |
| `vehicles`           | Fleet records incl. insurance/registration expiration dates                                         |
| `trips`              | Mileage logging                                                                                     |
| `expenses`           | Expense capture                                                                                     |
| `trip_categories`    | Editable lookup, 9 seeded; each maps to an `irs_rate_type` (business / medical / charitable / none) |
| `expense_categories` | Editable lookup, 6 seeded                                                                           |
| `mileage_rates`      | Date-effective IRS rates                                                                            |
| `audit_log`          | Append-only                                                                                         |

Plus: immutable `created_*` / auto `updated_*` triggers on every table; RLS enforcing the original three roles at the DB layer; two `security_invoker` views — `v_trip_details` and `v_expense_details` — that flatten joins and compute each trip's applied IRS rate and estimated deduction while respecting each user's RLS; a private `receipts` storage bucket; seed data (both entities, 9 trip categories, 6 expense categories, IRS rates); first user to sign up auto-bootstraps as the top admin role.

### App

- Email + Google auth; role-gated routes and UI.
- Trip logging (manual miles **or** odometer start/end).
- Vehicle records with insurance/registration expiration cues.
- Expense capture with receipt upload (file storage only, no OCR).
- Consolidated + per-entity dashboard: business miles MTD/YTD, miles by entity, fuel and vehicle costs, estimated IRS deduction, monthly chart.
- Reports: IRS mileage log, per-entity mileage, expense report. Filter by entity/date. Export to CSV and multi-tab Excel (Trips / Vehicles / Expenses).
- Audit-log viewer; admin Settings for entities, categories, rates, users.

---

## 5. Phase 2 history

**Migrations `0006`–`0010`, then a separate app commit.**

### Roles → five permission tiers

The three-role model was replaced with two separate fields:

- **`role` (permission tier):** `owner` · `manager` · `contributor` · `accountant` · `auditor`
- **`job_title`:** editable lookup with all nine titles (Super Administrator, Executive Director, Administrator, Program Manager, Transportation Coordinator, Employee, Driver, Read-Only Auditor, Accountant). Display and reporting only — carries no permissions.

| Tier          | Access                                                           |
| ------------- | ---------------------------------------------------------------- |
| `owner`       | Everything, incl. user management + settings                     |
| `manager`     | Read/write all operational data; no user management, no settings |
| `contributor` | Reads everything; creates records; edits/deletes only their own  |
| `accountant`  | Read all + financial reports/export; no operational edits        |
| `auditor`     | Read-only                                                        |

Migration mapping (preserves existing access): `administrator` → `owner` (renamed in place), `staff` → `contributor` (renamed in place), `auditor` → unchanged; `manager` and `accountant` added. First-signup auto-bootstrap now creates an `owner`. The role change propagated through the app: auth context, route guards, nav, and per-record edit checks (managers edit any operational record; contributors only their own).

### Locations and auto-categorization

- `saved_locations` (geofences): nullable `entity_id` (null = shared), name, type (editable lookup), lat/lng, `radius_meters`, `default_trip_category_id`, `is_active`.
- `trips` extended: `start_lat/lng`, `end_lat/lng`, `started_at`, `ended_at`, `route_polyline`, `distance_source` (`manual | odometer | gps`), `start_location_id`, `end_location_id`, `auto_categorized` (bool).
- On the web, picking a saved location on the trip form applies that location's default category and sets `auto_categorized`. A manual category change clears the flag. True GPS geofencing waits for the native app; the columns are in place for it.
- Helper functions `earth_distance_m()` and `find_location_for_point()` support point-in-location lookups — the groundwork for GPS auto-categorization in the native phase.

### Fleet maintenance

- `maintenance_types` (editable lookup, seeded).
- `maintenance_records`: `vehicle_id`, `entity_id` (default from vehicle), `maintenance_type_id`, `service_date`, `odometer_at_service`, `cost`, `vendor`, `notes`, `linked_expense_id` (ties a service to its expense instead of double entry).
- `maintenance_schedules`: `interval_miles` and/or `interval_months`, `last_service_date`, `last_service_odometer`, `is_active`.
- `v_maintenance_due` view computes "due" from the schedule against each vehicle's current odometer (itself a view, `v_vehicle_odometer`, derived from trips). Due is never stored.

### Documents and driver credentials

- `documents`: `entity_id` (required), `vehicle_id` (nullable), `profile_id` (nullable), title, `document_type` (editable lookup), `file_path`, `issued_date`, `expiration_date`, `tags` (text[]), notes.
  - Org doc = `vehicle_id` and `profile_id` both null. Vehicle doc = `vehicle_id` set. Driver-credential doc = `profile_id` set. No polymorphic owner table.
- Private `documents` storage bucket, parallel to `receipts`.
- `v_documents_expiring` view (documents with an expiration date, by time remaining) and `v_driver_credentials` view (per-person credential documents).
- Personal (per-person) documents are visible only to the subject and to oversight roles (`owner` / `manager` / `accountant` / `auditor`); organization and vehicle documents are visible to all authenticated users. **Historical limitation:** Phase 2 protected rows only. The later hardening in section 7 protects files using the saved document scope.
- **Vehicle insurance/registration expiration stays on `vehicles` as the source of truth.** A document may attach the PDF, but the expiration date is not copied into `documents`, and `v_documents_expiring` does not double-count it.

### Dashboard, reports, settings

- Dashboard "Needs attention" panel: maintenance due, vehicle insurance/registration, expiring documents.
- Maintenance report added to Reports and to the Excel workbook.
- New editable lookups in Settings: job titles, location types, maintenance types, document types.
- Audit-log read is limited to `owner` / `accountant` / `auditor`.

---

## 6. Repository and branch state

The reviewed `main` baseline was `a8bb24b`; the existing `claude/hardening-0011` branch was
`001aaf2`. The implementation branch `codex/hardening-and-integrity` includes that branch's SQL,
app changes, and test suite, then adds migrations `0012`–`0014` and the related app changes.
The implementation is published as PR #1; inspect current branch and CI state before merging.

## 7. Hardening implementation and remaining release checks

- `0011`: server-controlled creation metadata; current-role and active-user enforcement;
  initial attachment protection and account status controls.
- `0012`: invitation-only signup (explicit first-owner invitation); serialized owner changes;
  attachment reads following document scope, including legacy file paths; current-role blob writes;
  object identity and reference protection using RLS without changing managed Storage schemas.
- `0013`: fail-closed historical odometer preflight, server-calculated odometer mileage,
  completed-service maintenance baselines, and future-reading exclusion.
- `0014`: atomic owner account updates and durable Auth synchronization with leased, retryable
  work. An Auth failure never rolls back a database deactivation.
- App: private caches reset by account and permission scope; read errors block reports/exports;
  complete paginated queries; date-filtered reports; future-free YTD; formula-safe CSV;
  authenticated document downloads; failed/replaced/deleted upload cleanup; invitation settings.
- Verification: PostgreSQL 17 role matrix (60 checks), additional integrity and concurrent-owner
  checks, existing-data upgrade and preflight tests, runner failure tests, unit checks, and
  mocked Chromium browser checks. CI runs the same categories. See `supabase/tests/README.md`.

**Release work still required:** review completed core hosted checks in `STAGING_VALIDATION.md`,
finish Google/email provider checks and the production preflight in
`MILEWAY_MIGRATION_RUNBOOK.md`, review real existing-data preflight results, deploy the Edge
Function, configure production values, and review before merging/deploying. Core password Auth, Storage HTTP, Edge runtime, outage recovery, and real browser flows have
passed on isolated staging. Google and email-delivery verification still need provider setup. Existing dependency
advisories remain a separate maintenance task. No reminder delivery or residents module was added.

Receipts remain shared with active authenticated users (existing product decision). Locations and
maintenance schedules remain owner/manager-write-only. Existing users and file paths are preserved.
Previously issued signed links remain valid until their expiry. Failed orphan cleanup needs an
administrator retry through the Storage API.

---

## 8. Conventions every new table and feature must follow

This is the house style. New work that breaks it creates exactly the integration mess the phased approach exists to prevent.

- `created_*` (immutable) and `updated_*` (auto) triggers on every table.
- RLS on every table, matching the five permission tiers.
- `audit_log` coverage on business tables. Internal lock and Auth work-queue tables use dedicated access controls and synchronization state.
- `security_invoker` views for anything computed. Never store a derived value (no stored "due," no stored "deduction").
- Editable lookup tables for anything enumerable, managed in Settings.
- Date-effective rows where a value changes over time (e.g., mileage rates).
- Seed data for lookups.
- Every operational record carries `entity_id`.
- American English; plain, direct UI labels.
- User-facing copy uses person-first, non-stigmatizing language. Never "clean" for abstinent, never "compliance" for a person's participation.

---

## 9. Flagged defaults awaiting Jeff's confirmation

All are editable in-app; none block Phase 3, but confirm before treating any as final.

1. **2026 business/medical IRS rates are placeholders** copied from 2025. Charitable 14¢ is statutory. Verify in Settings → Mileage rates.
2. **Category → rate-type mapping** (e.g., Pharmacy → medical, Fundraising → charitable). Confirm with Jeff's tax advisor.
3. **Entity legal names / EINs are placeholders.** Set in Settings → Entities.
4. **Expiration look-ahead = 60 days** (`EXPIRATION_WINDOW_DAYS` constant) for the dashboard and Documents "expiring" surfaces. **Phase 3 (reminders) replaces this constant with configurable per-type lead times** — so it gets resolved there, not as a separate task. A driver's license renewal and a vehicle registration warrant different lead times.
5. **Web auto-categorization** fires on saved-location pick only; GPS geofencing waits for native.
6. **Audit-log read** = `owner` / `accountant` / `auditor`.

---

## 10. Roadmap — remaining phases

In recommended order:

1. **Hardening and integrity release — current work.** The implementation is ready for review;
   complete hosted staging checks and merge/deploy before building reminders on it.
2. **Automated reminders (email) — planned Phase 3 after the hardening release.** Selected direction. Turn the existing due/expiring signals (`v_maintenance_due`, `v_documents_expiring`, `v_driver_credentials`, vehicle expiration fields) into a scheduled digest email via a server-side job (e.g., Supabase Edge Function on a schedule + an email provider). Adds a delivery layer on top of what already computes. Two settled design calls: a single digest (not one email per item), and minimal detail in the body (category + link back into the app, never a named person's credential or document contents in plaintext — the in-app access gates must hold). Replace the hardcoded `EXPIRATION_WINDOW_DAYS` with configurable per-type lead times. The scheduled job runs with elevated privilege (service role, bypassing RLS) — isolate that path and keep the service role off the client.
3. **Native GPS capture** via Capacitor packaging: background location, geofence-by-GPS auto-categorization, push notifications. The trip GPS columns and the `find_location_for_point()` helper already exist for this. Deferred behind reminders — bigger lift (native build/deploy, background-location permissions) and a longer maintenance tail.
4. **Accounting / payroll / banking integrations** (e.g., QuickBooks, Xero). Currently a deliberate exclusion; lift only when Jeff decides.
5. **Incident reporting.**
6. **OCR** for receipts and documents (storage exists; add extraction).
7. **Residents / appointments domain — GATED. See section 11.**

---

## 11. The residents module — hard gate

**Do not scaffold resident, appointment, or waiver/funding-source tables in a normal build pass.**

A resident transportation record ties a person — even by initials — to behavioral-health or substance use disorder appointments, a funding source, and a waiver program. That is arguably **42 CFR Part 2** data and likely **PHI**. A fast-built module holding it will not survive an audit unless the data model, access controls, and hosting are designed for that from the start, not bolted on after.

This phase starts with a **data-handling design** conversation, not a schema: where the data lives, who can reach it, how access is controlled, hosting posture, retention. It is an open question whether it should even share a database with a mileage tracker or run as a separate, locked-down system.

Until that design is settled: no resident tables, and no real resident data in any environment. If asked to build it anyway, stop and route back to Jeff.

---

## 12. How this build has been run

Keep this method — it is why two phases landed clean and reversible:

- **Schema first.** Propose the full schema for a phase, present it for review, and **stop for human approval before writing any UI or logic.**
- **One phase = one branch = one PR**, merged in order.
- **Verify migrations on staging before building on top of them.**
- **Narrow and deep, not broad and thin.** Do not scaffold the whole spec at once.
- **Confirm before anything irreversible** (merges, destructive migrations, live data).

---

## 13. Setup / run

1. Use Node 24 or newer and run `npm ci`.
2. Create a Supabase project.
3. Run migrations `0001` → `0014`, then the timestamped hosted-permissions migration, in order (`0006` before `0007`, for the enum commit).
4. Set `.env` (Supabase URL + anon key).
5. Configure Google + email auth providers.
6. Seed the first owner invitation on fresh installs, deploy `set-user-active`, then `npm run dev`.

Full steps are in `README.md`.

### Project layout

```
supabase/migrations/   SQL: schema, RLS, views, seed, storage (0001–0014 + hosted permissions)
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

**Types:** `npm run db:types` regenerates `src/types/supabase.ts` from a linked Supabase project (requires the Supabase CLI). Hand-written row types live in `src/types/db.ts`.

---

## 14. Quick start for the next agent

1. Read `README.md`, all 15 migrations, and `MILEWAY_MIGRATION_RUNBOOK.md`.
2. Inspect actual branch state; local hardening changes need review and publication.
3. Run the automated checks and hosted staging checklist before release.
4. Preserve the dual-entity model, five roles, privacy gates, and resident-domain deferral.
5. After release, the planned next feature is the minimal-detail reminder digest in section 10.
