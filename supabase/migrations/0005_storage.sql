-- ============================================================================
-- Mileway — Storage bucket + policies for receipt images (file only, no OCR)
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- All authenticated users may read receipts (access is via signed URLs).
create policy "receipts_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts');

-- Only staff/admins may upload.
create policy "receipts_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and public.can_write());

-- Owner or admin may replace/remove a receipt.
create policy "receipts_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and (public.is_admin() or owner = auth.uid()))
  with check (bucket_id = 'receipts');

create policy "receipts_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (public.is_admin() or owner = auth.uid()));
