# Mileway

Internal operations app for a two-entity organization — a **501(c)(3) foundation** (primary)
and an **operating LLC** beneath it. Mileway handles **manual mileage logging, vehicle records,
and expense capture**, with consolidated and per-entity reporting plus an immutable audit trail.

This repository is **Phase 1**. See [Scope](#phase-1-scope) and [Out of scope](#out-of-scope-phase-1).

---

## Tech stack

A **Vite + React + TypeScript single-page app** backed by **Supabase** (hosted Postgres, Auth,
Storage). A pure client-side SPA builds to static assets, so the same build can later be wrapped
by **Capacitor** into native iOS/Android with no rearchitecting. Supabase provides email + Google
auth, receipt file storage, and **row-level security that enforces the three roles at the database
layer** — defense-in-depth that matters for an auditor-facing app.

| Concern | Choice |
|---|---|
| Frontend | Vite, React 18, TypeScript, React Router |
| UI | Tailwind CSS, lucide-react icons |
| Server state | TanStack Query, `@supabase/supabase-js` |
| Tables / charts | TanStack Table, Recharts |
| Export | SheetJS (`xlsx`) for multi-tab Excel; native CSV |
| Backend / data | Supabase: Postgres + RLS, Auth (email + Google), Storage |
| Mobile (later) | Capacitor wraps `dist/` |

---

## Getting started

### 1. Install

```bash
npm install
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

Run the migrations in `supabase/migrations/` **in order** (`0001` → `0010`; the Phase 2 enum
migration `0006` must run before `0007`). Either:

- **Supabase Dashboard → SQL Editor**: paste each file’s contents and run, in order; or
- **Supabase CLI**:

  ```bash
  supabase link --project-ref <your-ref>
  supabase db push
  ```

The migrations create all tables, RLS policies, audit triggers, reporting views, the `receipts`
storage bucket, and seed the two entities, default categories, and IRS rates.

### 4. Configure auth providers

- **Email**: enabled by default. For the fastest internal setup, turn **off** "Confirm email"
  under **Authentication → Providers → Email** (or just use Google).
- **Google**: **Authentication → Providers → Google**, add your Google OAuth client ID/secret,
  and add your app origin (e.g. `http://localhost:5173`) to **Authentication → URL Configuration →
  Redirect URLs**.

### 5. Run

```bash
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build to dist/
npm run preview  # serve the production build
```

> **First account = Administrator.** The first user to sign up is automatically made the
> Administrator (bootstrap). Everyone after that defaults to **Staff**; promote them in
> **Settings → Users**.

---

## Roles (permission tiers)

Phase 2 splits identity into a **job title** (display/reporting only — nine titles seeded) and a
**permission tier** (`role`) that actually governs access:

| Tier | Access |
|---|---|
| **Owner** | Full access, including settings and user management. |
| **Manager** | Read/write **all** operational data. No settings or user management. |
| **Contributor** | Reads everything; creates records; edits/deletes **only the records they created**. |
| **Accountant** | Reads everything (incl. audit log) and runs/exports reports. No operational edits. |
| **Read-Only Auditor** | Read-only access to all records **and the audit log**. No writes. |

Enforcement is twofold: the UI hides actions a role can’t take, and **Postgres RLS policies**
enforce the same rules at the database — the API rejects unauthorized writes regardless of the
client. The first account to sign up bootstraps as **Owner**.

> Upgrading from Phase 1: migration `0006` renames `administrator → owner` and `staff → contributor`
> in place, so existing users keep their access automatically.

---

## Data model

All tables carry immutable `created_at` / `created_by` and auto-maintained `updated_at` /
`updated_by` (triggers in `0001_schema.sql`). Every change is mirrored into an append-only
`audit_log`.

- **entities** — the two legal entities (Foundation = primary, Operating LLC). Every record
  references one.
- **profiles** — users (1:1 with `auth.users`), carrying `role` and an optional default entity.
- **vehicles** — VIN, plate, year/make/model, odometer, insurance & registration (with expirations).
- **trip_categories** — editable; each maps to an `irs_rate_type` (business/medical/charitable/none).
- **expense_categories** — Fuel, Repairs, Maintenance, Parking, Tolls, Supplies (stable `key`).
- **mileage_rates** — date-effective IRS rates per type; the rate effective on a trip’s date is applied.
- **trips** — date, vehicle, category, entity, distance (entered or computed from odometer), notes.
- **expenses** — amount, date, category, entity, optional vehicle, optional receipt file.
- **audit_log** — immutable who/when/what (old & new JSON) for every insert/update/delete.

Two `security_invoker` views (`v_trip_details`, `v_expense_details`) flatten joins and compute the
per-trip applied rate + estimated deduction; they power the dashboard and reports while still
respecting each user’s RLS.

**Phase 2 adds:** `job_titles`, `location_types`, `saved_locations`, `maintenance_types`,
`maintenance_records`, `maintenance_schedules`, `document_types`, `documents` (+ a `documents`
storage bucket), and additive GPS/location columns on `trips`. New views: `v_vehicle_odometer`,
`v_maintenance_due`, `v_documents_expiring`, `v_driver_credentials`. Geofence helpers
`earth_distance_m()` / `find_location_for_point()` support auto-categorization.

---

## Reports & export

- **IRS-format mileage log**, **per-entity mileage summary**, **expense report** — filterable by
  entity (single or consolidated) and date range.
- Export any report to **CSV**, or to **Excel**. The **Full workbook** export produces one `.xlsx`
  with separate **Trips / Vehicles / Expenses** tabs.

---

## Phase 2 (this release)

Extends the Phase 1 schema (migrations `0006`–`0010`) — same conventions throughout.

- **Five-tier permissions** (owner / manager / contributor / accountant / auditor) plus a separate,
  editable **job title** lookup (nine titles).
- **Saved locations (geofences)** with destination recognition; **auto-categorization** — picking a
  saved location on a trip applies its default category (a manual category override clears it).
  Trips also carry GPS fields (lat/lng, timestamps, route) ready for the native app.
- **Fleet maintenance** — service history, schedules (mileage and/or time intervals), and a computed
  **what's-due** view based on each vehicle's odometer (derived from trips) and last service.
- **Documents & driver credentials** — one store for organization, vehicle, and per-person
  documents (license, insurance verification, background check, training certs) in a private
  `documents` bucket, with **expiration tracking** and a driver-credentials view. Sensitive
  per-person documents are visible only to the subject and oversight roles.
- **Dashboard "Needs attention"** — maintenance due, vehicle insurance/registration, and expiring
  documents at a glance. **Maintenance** added to reports + the Excel workbook.

## Phase 1 scope

- Two entities; every record assignable to one; reporting single-entity **and** consolidated.
- Auth: email + Google; three roles (Administrator, Staff, Read-Only Auditor).
- Manual trip/mileage logging (no GPS) with editable categories.
- Vehicle records with insurance/registration expirations.
- Expense capture with optional receipt image upload (file stored, **no OCR**).
- Consolidated dashboard: business miles (month + YTD), miles by entity, vehicle & fuel costs,
  estimated IRS mileage deduction.
- Reports + CSV/Excel export.
- Immutable created/edited timestamps + a dedicated audit log on every record.

### Decisions & assumptions to confirm

- **IRS rates** are seeded as editable, date-effective defaults. Charitable is statutory (14¢);
  the **2026 business/medical rows are placeholders** copied from 2025 — verify against current IRS
  guidance in **Settings → Mileage rates**.
- **Category → rate-type mapping** (e.g. Pharmacy → medical, Fundraising → charitable) is a sensible
  default; confirm classifications with your tax advisor and adjust in **Settings → Trip categories**.
- **Staff read everything** (shared operational picture) but write only their own records.
- **Expense → vehicle is optional** (covers non-vehicle costs like general supplies).
- Entity **legal names / EINs** are placeholders — set them in **Settings → Entities**.

## Out of scope (still upcoming)

- **Native GPS capture** — the schema and trip fields are ready, but automatic trip recording,
  live route polylines, and on-device geofencing require the Capacitor native app (not yet packaged).
- **Automated reminders/notifications** — expirations and maintenance-due are *surfaced* in-app
  (dashboard, badges), but no emails/push are sent.
- Residents/appointments/funding-source tracking; OCR; accounting, payroll, or banking integrations;
  incident reporting.

---

## Project layout

```
supabase/migrations/   SQL: schema, RLS, views, seed, storage
src/
  lib/                 supabase client, utils, metrics, export (csv/excel/reports)
  contexts/            AuthContext (session + profile + role)
  hooks/               TanStack Query data hooks (one per domain)
  components/
    ui/                primitives (button, input, modal, …)
    common/            DataTable, EntityFilter, StatCard, …
    forms/             TripForm, VehicleForm, ExpenseForm
    settings/          admin settings sections
    layout/            AppLayout (sidebar + topbar)
    auth/              route guards
  pages/               Dashboard, Trips, Vehicles, Expenses, Reports, Audit, Settings, Login
```

> `npm run db:types` regenerates `src/types/supabase.ts` from a linked Supabase project
> (requires the Supabase CLI). Hand-written row types live in `src/types/db.ts`.
