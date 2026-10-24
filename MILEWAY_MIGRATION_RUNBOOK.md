# Mileway — migration and hosted validation runbook

Use a disposable Supabase staging project first. Local suites exercise PostgreSQL policies
and fictional browser APIs; real Auth login/bans, Storage HTTP, and the deployed Edge Function
require this hosted pass. The completed staging results and remaining provider checks are in
[STAGING_VALIDATION.md](STAGING_VALIDATION.md). Production has not been changed.

## 1. Review existing data and back up

For an existing project, confirm applied migrations and take a restorable database backup
plus a Storage inventory/backup. Apply only migrations not already applied.
Start with the read-only `supabase/preflight/catalog.sql`. Once the schema through
`0010` is confirmed, `supabase/preflight/integrity.sql` gives aggregate integrity
checks without returning user emails or attachment paths. No migration history does
not prove the database is empty. See [PRODUCTION_RELEASE.md](PRODUCTION_RELEASE.md)
for the post-merge hosting and release preparation.
Review these queries before `0012` and `0013`; correct records deliberately, preserving the
audit history. Do not silently recalculate historical reimbursements.

```sql
-- Must be resolved before 0012: one scope and one attachment reference per document.
select id, vehicle_id, profile_id from public.documents
where vehicle_id is not null and profile_id is not null;
select file_path, count(*) from public.documents
where file_path is not null group by file_path having count(*) > 1;

-- Must be resolved before 0013: historical mileage agrees with odometer endpoints.
select id, trip_date, distance_miles, odometer_start, odometer_end
from public.trips where distance_source = 'odometer'
and distance_miles <> odometer_end - odometer_start;

-- Investigate missing attachments; files are not moved by migration.
select d.id, d.file_path from public.documents d
where d.file_path is not null and not exists (
  select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = d.file_path
);
```

`0012` fails on conflicting scopes or duplicate attachment paths; `0013` refuses inconsistent
historical mileage. Apply each file transactionally so a failed preflight rolls back the file.
Existing profiles are preserved. Invitation-only admission applies to new Auth accounts.

## 2. Apply migrations in order

Fresh staging projects need `0001` through `0014`, followed by
`20261023230154_hosted_function_permissions.sql` (15 files). Each file must commit separately: `0006`
adds enum values that `0007` uses. Never concatenate those files into one transaction.

Use the Supabase SQL Editor, one complete file per run, or the CLI:

```bash
supabase link --project-ref <staging-ref>
supabase db push
```

Confirm tables, reporting views, seed lookups, and both private buckets (`documents`, `receipts`).
Confirm `user_invitations` and `auth_access_sync` exist and new public tables have RLS enabled.
Do not alter the Supabase-managed Storage schema or insert/delete Storage metadata with SQL.

## 3. Configure the app and account-management function

Use Node 24 or newer, `npm ci`, and `.env.example` copied to `.env` with the staging URL and
anon public key. Keep the service-role key exclusively in the Edge environment.

```bash
supabase functions deploy set-user-active
npm run dev
```

Configure email/Google Auth providers and redirect URLs for the app origin. Keep email
confirmation enabled for real use. A throwaway project may disable it for fictional test users.

For a fresh database, seed the first owner invitation in the SQL Editor before signup:

```sql
insert into public.user_invitations(email,role)
values (lower('your-owner-email@example.org'),'owner');
```

Sign up with that email, then use Settings → Invitations to allow other fictional test users:
one manager, two contributors, one accountant, one auditor, and a second owner for concurrency
tests. Invitations expire in seven days, are consumed on account creation, and send no email.
Share the app link separately. Expired unused invitations can be revoked and recreated. Existing
accounts do not need new invitations during an upgrade.

## 4. Hosted acceptance checklist

Record results against the exact branch commit and staging project. Use fictional files/data.

- **Admission:** an uninvited, expired, or revoked email cannot create a profile; an invited email
  receives the chosen role. Email and Google flows must both respect the invitation gate.
- **Five roles:** owner manages settings/users; manager edits operational data but cannot manage
  users/settings; contributor changes only their own records; accountant/auditor cannot write.
  Contributors see shared documents and only their own personal documents. Audit-log readers are
  owner/accountant/auditor. Locations and schedules remain owner/manager-write-only.
- **Real file flow:** upload a personal PDF as contributor, save/download it, and verify another
  contributor cannot list/download it with their JWT, even knowing its path. Repeat with an old
  entity-prefixed file. Change org scope to personal and confirm the existing path becomes private
  immediately. An owner/manager can download it; the subject can download an owner-uploaded file.
- **File writes:** demote the uploader and verify blob replacement/deletion is denied. Object
  moves/renames cannot bypass references. Normal uploads and metadata updates must still work
  through the hosted Storage API with its current `owner_id` fields. The app does not rename files.
- **File lifecycle:** replace/delete a document and receipt; referenced blobs must not disappear
  before the business reference is removed. Failed database saves clean up their new upload.
  Storage cleanup failures leave successful records intact; retry unreferenced cleanup through the
  Storage API. Never manually delete `storage.objects` rows. Already downloaded files and existing
  signed URLs cannot be recalled; old signed URLs remain valid until their original expiry. Legacy cached responses may also
  survive until cache expiry; fresh app downloads use unique nonces and no-store fetches.
- **Account switch:** load private documents as owner, sign out, then sign in as contributor on
  the same browser. No previous-account rows or late responses may appear. Demote the signed-in
  owner using another owner and refresh the profile/session to verify permission cache resets.
- **Account editing:** save role/title/entity/status together. An invalid field or last-owner
  restriction rejects the entire database update. Confirm the last active owner cannot be lost,
  including two owners attempting concurrent self-demotions.
- **Deactivation:** disable a fictional contributor. Existing JWTs lose database reads/writes
  immediately and new sign-in is banned after Auth synchronization. Simulate an Auth failure:
  database status stays inactive, Users shows pending sync, and Retry sign-in sync reconciles it.
  Reactivation is owner-only. Pending jobs are retried manually; there is no scheduled worker.
- **Reports:** use more than 1,000 matching records and compare CSV/Excel row counts and totals
  with a privileged SQL control query. Verify entity/date filters, future-free YTD, formula-like
  text in CSV, and visible unavailability on query failure (no partial export).
- **Mileage/maintenance:** odometer endpoints determine distance even if a client supplies another
  distance; completed maintenance advances due thresholds; editing/deleting service recomputes
  them; future trip/service dates do not advance current readings.

## 5. Release

Review `STAGING_VALIDATION.md`, any remaining provider checks, and the code diff before merging. Confirm legal entity names/EINs,
IRS rates (2026 defaults are placeholders), category mappings, Auth providers/redirects, and
hosting environment values. Dependency advisories remain a separate upgrade task.

After release approval, apply outstanding migrations, deploy the matching Edge Function,
and publish the frontend together during a controlled release window. Avoid account edits while
the old frontend/function and new schema are temporarily mismatched. Validate live sign-in and a
fictional upload immediately afterward. This runbook does not authorize production deployment.
