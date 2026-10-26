-- Run only after catalog inspection confirms the MissionOS schema through 0010.
-- Counts identify blockers; review affected records privately before changing data.
-- This is a preflight, not a database/Storage backup or a release authorization.
begin read only;
set local statement_timeout = '30s';

select jsonb_build_object(
  'checked_at', now(),
  'profiles', (select count(*) from public.profiles),
  'active_owners', (select count(*) from public.profiles
    where is_active and role::text in ('owner', 'administrator')),
  'trips', (select count(*) from public.trips),
  'expenses', (select count(*) from public.expenses),
  'documents', (select count(*) from public.documents),
  'conflicting_document_scopes', (select count(*) from public.documents
    where vehicle_id is not null and profile_id is not null),
  'duplicate_document_paths', (select count(*) from (
    select file_path from public.documents where file_path is not null
    group by file_path having count(*) > 1
  ) duplicates),
  'inconsistent_odometer_trips', (select count(*) from public.trips
    where distance_source = 'odometer'
    and distance_miles is distinct from odometer_end - odometer_start),
  'missing_document_objects', (select count(*) from public.documents d
    where d.file_path is not null and not exists (
      select 1 from storage.objects o where o.bucket_id = 'documents' and o.name = d.file_path
    )),
  'missing_receipt_objects', (select count(*) from public.expenses e
    where e.receipt_path is not null and not exists (
      select 1 from storage.objects o where o.bucket_id = 'receipts' and o.name = e.receipt_path
    )),
  'entities_needing_review', (select count(*) from public.entities
    where legal_name is null or btrim(legal_name) = ''
      or legal_name ilike '%set legal name%' or ein is null or btrim(ein) = ''),
  'mileage_rates', (select jsonb_agg(jsonb_build_object(
    'type', rate_type, 'effective_date', effective_date, 'dollars_per_mile', rate_per_mile
  ) order by effective_date, rate_type) from public.mileage_rates)
) as preflight_integrity;

rollback;
