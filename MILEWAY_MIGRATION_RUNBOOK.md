# Mileway — Migration Apply & Role-Test Runbook

Keep this open beside the Supabase dashboard. It takes the 10 migrations on `main` from files to a working database, then proves the five role tiers actually enforce before you trust any of it.

**The one rule that matters:** apply `0001` → `0010` in order, each as its own step. `0006` adds the new role values to a Postgres enum; `0007` uses them. Postgres will not add an enum value and use it in the same transaction — so if you paste several files into one run, it fails at `0007`. One file, one run, every time.

---

## Before you start

- Do this on a **throwaway Supabase project first** — not one holding anything you care about. If a migration fails halfway, you delete the project and start over instead of untangling a half-applied schema.
- The migration files are in `supabase/migrations/` on `main`, named `0001_*.sql` through `0010_*.sql`.
- You'll need the project's **Project URL** and **anon public key** (Project Settings → API) for the app in Step 4.

---

## Step 1 — Create the throwaway project

1. At supabase.com, create a new project. Any name; free tier is fine for testing.
2. Wait for it to finish provisioning — the database has to spin up before the SQL Editor will run anything.

---

## Step 2 — Apply the migrations

### Method A — SQL Editor (recommended; works from any browser)

1. Open the project → **SQL Editor** → new query.
2. Open `0001_*.sql` from the repo, copy the full contents, paste, **Run**. Wait for success.
3. Repeat for `0002`, `0003`, `0004`, `0005`, `0006`, `0007`, `0008`, `0009`, `0010` — one file per run, in order, confirming success before the next.
4. Don't batch them. Running each file as its own query is exactly what keeps `0006` committed before `0007` uses its enum values.

If a run errors, **stop.** Read the error, and don't proceed past a failed step — later migrations assume the earlier ones landed.

### Method B — Supabase CLI (for later, when you want it repeatable)

```
supabase link --project-ref <your-project-ref>
supabase db push
```

`db push` applies each migration as its own step, so the enum ordering is handled. Use this once you're comfortable; Method A is the lower-friction path for a first run.

---

## Step 3 — Confirm the schema landed

In the dashboard, check:

- **Table Editor** — Phase 1 tables (`entities`, `profiles`, `vehicles`, `trips`, `expenses`, `trip_categories`, `expense_categories`, `mileage_rates`, `audit_log`) and Phase 2 tables (`saved_locations`, `maintenance_types`, `maintenance_records`, `maintenance_schedules`, `documents`, `job_titles`).
- **Database → Views** — the computed views: `v_trip_details` and `v_expense_details` (trip rate + estimated deduction), `v_maintenance_due` (maintenance due), plus the document/credential expiration views. Confirm the exact set here; names may carry a `v_` prefix.
- **Storage** — two private buckets: `receipts` and `documents`.
- **Seed data** — `entities` holds your two entities; `trip_categories` (9), `expense_categories` (6), `mileage_rates`, and the Phase 2 lookups (job titles, location types, maintenance types, document types) are populated.

Anything missing means a migration didn't fully apply — go back before moving on.

---

## Step 4 — Point the app at the project

1. In the repo, copy `.env.example` to `.env` and fill in:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public key
2. In the dashboard, **Authentication → Providers**:
   - For fast testing, turn **off** "Confirm email" so test signups work immediately — or use Google.
   - If using Google, add the OAuth client ID/secret, and add your app origin (e.g. `http://localhost:5173`) under **Authentication → URL Configuration → Redirect URLs**.
3. `npm install`, then `npm run dev`.

---

## Step 5 — Create the test users

- **First signup becomes `owner`** automatically (the bootstrap). Sign up account 1 — that's your owner.
- Create four more accounts (sign up in the app, or add them under **Authentication → Users**). Each defaults to `contributor`.
- Signed in as the owner, go to **Settings → Users** and set the four accounts to `manager`, `contributor`, `accountant`, and `auditor` — so all five tiers are covered across your accounts.
- Label them so you don't lose track: `owner@…`, `manager@…`, and so on.

---

## Step 6 — The role test (the important part)

This is the review the fast-forward merge skipped. **Try each action as each user — don't just check whether a button is visible.** A hidden button proves the UI is polite; a *rejected action* proves the RLS policy in `0007` actually enforces at the database. Sign in as each tier and confirm against the expected result.

| Action | owner | manager | contributor | accountant | auditor |
|---|---|---|---|---|---|
| See all records | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create a trip / expense / vehicle | ✓ | ✓ | ✓ | ✗ | ✗ |
| Edit or delete **their own** record | ✓ | ✓ | ✓ | ✗ | ✗ |
| Edit or delete **another user's** record | ✓ | ✓ | ✗ | ✗ | ✗ |
| Open Settings (entities, categories, rates) | ✓ | ✗ | ✗ | ✗ | ✗ |
| Manage users / change roles | ✓ | ✗ | ✗ | ✗ | ✗ |
| Read the audit log | ✓ | ✗ | ✗ | ✓ | ✓ |

Two checks the table can't fully settle — confirm them against how you intend the app to work:

- **Report export.** Owner and accountant should be able to run and export financial reports. Confirm whether manager and auditor can too — both read all data, so viewing is expected; whether they get the export is a design call.
- **The contributor boundary — the one that matters most.** Signed in as the contributor, try to edit a record another user created. It must be refused. If it goes through, the "write own only" rule isn't holding and `0007` needs a look.

Where reality doesn't match the expected column, that's a finding — note it and check the relevant policy in `0007` before this schema goes near real data.

> **Only if you ever apply Phase 2 on top of a project that already had Phase 1 users** (old `administrator` / `staff` roles): add one check — confirm those users landed as `owner` / `contributor` and kept their access. On a fresh all-10 apply there are no old rows to convert, so this doesn't apply.

---

## If something breaks

- On a throwaway project, the fastest fix is to **delete the project and start over** from Step 1 — no half-applied state to debug.
- The most likely failure is the enum ordering: an error at `0007` about an invalid or unrecognized role value means `0006` didn't commit first. Confirm you ran them as separate queries, not one paste.

---

## When it's all green

1. Apply the same `0001` → `0010`, in order, to the **real** project — same steps.
2. The schema is then trustworthy, and the build is clear to move to the next roadmap item or hand to the next agent.
3. This run closes the "apply the migrations" and "do the skipped review" gates in section 7 of `MILEWAY_ENTERPRISE_HANDOFF.md`.
