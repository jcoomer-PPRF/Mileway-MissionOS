-- ============================================================================
-- Mileway — Phase 2 (0010): documents & driver credentials
--   One table, three uses (no polymorphic owner table):
--     org doc      -> vehicle_id NULL and profile_id NULL
--     vehicle doc  -> vehicle_id set
--     driver cred. -> profile_id set (license, insurance verification,
--                     background check, training/safety certs)
--
--   NOTE: vehicle insurance/registration EXPIRATIONS stay on the vehicles
--   table (source of truth + dashboard cues). A document may attach the PDF,
--   but its expiration_date must be left NULL so v_documents_expiring does not
--   double-count them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- document_types — editable lookup
-- ---------------------------------------------------------------------------
create table public.document_types (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  name       text not null,
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id)
);
alter table public.document_types enable row level security;
select public.attach_audit('public.document_types');
grant select, insert, update, delete on public.document_types to authenticated;

insert into public.document_types (key, name, sort_order) values
  ('bylaws',                'Bylaws',                       1),
  ('irs_determination',     'IRS Determination Letter',     2),
  ('insurance_policy',      'Insurance Policy',             3),
  ('policy_procedure',      'Policy / Procedure',           4),
  ('vehicle_title',         'Vehicle Title',                5),
  ('registration_document', 'Registration Document',        6),
  ('insurance_card',        'Insurance Card',               7),
  ('drivers_license',       'Driver License',               8),
  ('insurance_verification','Insurance Verification',       9),
  ('background_check',      'Background Check',             10),
  ('training_certificate',  'Training / Safety Certificate', 11),
  ('other',                 'Other',                        12)
on conflict (key) do nothing;

create policy document_types_select on public.document_types
  for select to authenticated using (true);
create policy document_types_admin_write on public.document_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
create table public.documents (
  id               uuid primary key default gen_random_uuid(),
  entity_id        uuid not null references public.entities (id),
  vehicle_id       uuid references public.vehicles (id),
  profile_id       uuid references public.profiles (id),
  document_type_id uuid not null references public.document_types (id),
  title            text not null,
  file_path        text,
  issued_date      date,
  expiration_date  date,
  tags             text[] not null default '{}',
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references public.profiles (id),
  updated_by       uuid references public.profiles (id)
);
create index documents_entity_idx     on public.documents (entity_id);
create index documents_vehicle_idx    on public.documents (vehicle_id);
create index documents_profile_idx    on public.documents (profile_id);
create index documents_type_idx       on public.documents (document_type_id);
create index documents_expiration_idx on public.documents (expiration_date);
alter table public.documents enable row level security;
select public.attach_audit('public.documents');
grant select, insert, update, delete on public.documents to authenticated;

-- Personal (driver-credential) docs are visible only to the subject and to
-- oversight roles (owner/manager/accountant/auditor). Org & vehicle docs
-- (profile_id IS NULL) are visible to all authenticated users.
create policy documents_select on public.documents
  for select to authenticated
  using (profile_id is null or profile_id = auth.uid() or public.can_read_financials());
create policy documents_insert on public.documents
  for insert to authenticated with check (public.can_write());
create policy documents_update on public.documents
  for update to authenticated
  using (public.can_edit_all() or created_by = auth.uid())
  with check (public.can_edit_all() or created_by = auth.uid());
create policy documents_delete on public.documents
  for delete to authenticated using (public.can_edit_all() or created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Private storage bucket for document files (parallel to receipts)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create policy "documents_read" on storage.objects
  for select to authenticated using (bucket_id = 'documents');
create policy "documents_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'documents' and public.can_write());
create policy "documents_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and (public.is_admin() or owner = auth.uid()))
  with check (bucket_id = 'documents');
create policy "documents_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (public.is_admin() or owner = auth.uid()));

-- ---------------------------------------------------------------------------
-- Expiration views (configurable window is applied by the UI via days_until_*)
-- ---------------------------------------------------------------------------
create or replace view public.v_documents_expiring
with (security_invoker = true) as
select
  d.id,
  d.entity_id,
  e.name as entity_name,
  d.document_type_id,
  dt.name as document_type_name,
  d.title,
  d.vehicle_id,
  case when v.id is not null
       then trim(coalesce(v.year::text, '') || ' ' || coalesce(v.make, '') || ' ' || coalesce(v.model, ''))
       else null end as vehicle_label,
  d.profile_id,
  p.full_name as profile_name,
  d.issued_date,
  d.expiration_date,
  (d.expiration_date - current_date) as days_until_expiration,
  d.file_path
from public.documents d
join public.entities e          on e.id = d.entity_id
join public.document_types dt    on dt.id = d.document_type_id
left join public.vehicles v      on v.id = d.vehicle_id
left join public.profiles p      on p.id = d.profile_id
where d.expiration_date is not null;

grant select on public.v_documents_expiring to authenticated;

-- Driver credentials = documents attached to a person.
create or replace view public.v_driver_credentials
with (security_invoker = true) as
select
  d.id,
  d.profile_id,
  p.full_name as profile_name,
  p.email     as profile_email,
  d.document_type_id,
  dt.name as document_type_name,
  d.title,
  d.entity_id,
  d.issued_date,
  d.expiration_date,
  case when d.expiration_date is not null then (d.expiration_date - current_date) end as days_until_expiration,
  d.file_path,
  d.created_at,
  d.updated_at
from public.documents d
join public.profiles p        on p.id = d.profile_id
join public.document_types dt  on dt.id = d.document_type_id
where d.profile_id is not null;

grant select on public.v_driver_credentials to authenticated;
