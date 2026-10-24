-- File authorization follows the document row, including scope changes.
-- Existing files retain their paths; unreferenced uploads are private to their
-- uploader and fleet managers. No objects or business records are moved/deleted.

create table public.access_control_lock (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 0
);
insert into public.access_control_lock default values;
alter table public.access_control_lock enable row level security;
revoke all on public.access_control_lock from public, anon, authenticated;

-- Acquire the shared lock before locking any target profile row. This gives
-- direct updates and the account-management RPC the same lock order.
create or replace function public.tg_lock_profile_access()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ begin
  update public.access_control_lock set revision=revision+1 where singleton;
  return null;
end $$;
create trigger trg_lock_profile_access before update of role,is_active on public.profiles
  for each statement execute function public.tg_lock_profile_access();

create or replace function public.tg_protect_profile_role()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.role is not distinct from old.role
     and new.is_active is not distinct from old.is_active then return new; end if;
  -- A write, rather than a snapshot-only count, also forces a serialization
  -- failure under REPEATABLE READ if another owner change committed first.
  update public.access_control_lock set revision = revision + 1 where singleton;
  if not coalesce((select role = 'owner' and is_active from public.profiles
                   where id = auth.uid()), false) then
    raise exception 'Only an owner may change a user role or active status.';
  end if;
  if old.role = 'owner' and old.is_active
     and (new.role <> 'owner' or not new.is_active)
     and not exists (select 1 from public.profiles
                     where role = 'owner' and is_active and id <> old.id) then
    raise exception 'Cannot demote or deactivate the last active owner.';
  end if;
  return new;
end;
$$;

create table public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email)) and position('@' in email) > 1),
  role public.user_role not null default 'contributor',
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);
alter table public.user_invitations enable row level security;
select public.attach_audit('public.user_invitations');
grant select, insert, delete on public.user_invitations to authenticated;
create policy invitations_read on public.user_invitations for select to authenticated
  using (public.is_owner());
create policy invitations_create on public.user_invitations for insert to authenticated
  with check (public.is_owner() and accepted_at is null);
create policy invitations_revoke on public.user_invitations for delete to authenticated
  using (public.is_owner() and accepted_at is null);

-- Existing users are preserved. For a fresh install an operator seeds the first
-- owner's invitation in SQL before signup; there is no public first-user race.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare invitation public.user_invitations;
begin
  select * into invitation from public.user_invitations
    where email = lower(btrim(new.email)) and accepted_at is null and expires_at > now()
    for update;
  if not found then raise exception 'An invitation is required. Ask an owner for access.'; end if;
  insert into public.profiles(id, email, full_name, role)
    values (new.id, new.email,
      coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
      invitation.role);
  update public.user_invitations set accepted_at = now() where id = invitation.id;
  return new;
end;
$$;

alter table public.documents add constraint documents_single_scope
  check (vehicle_id is null or profile_id is null);
create unique index documents_unique_file on public.documents(file_path) where file_path is not null;

create or replace function public.can_read_document_file(p_path text, p_owner text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select public.is_active_user() and (
    exists (select 1 from public.documents d where d.file_path = p_path and
      (d.profile_id is null or d.profile_id = auth.uid() or public.can_read_financials()))
    or (not exists (select 1 from public.documents where file_path = p_path)
        and (public.can_edit_all() or (public.can_write() and p_owner = auth.uid()::text)))
  );
$$;

create or replace function public.can_manage_document_file(p_path text, p_owner text)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select public.can_edit_all() or (public.can_write() and p_owner = auth.uid()::text
    and not exists (select 1 from public.documents d where d.file_path = p_path
      and (d.created_by is distinct from auth.uid()
        or (d.profile_id is not null and d.profile_id <> auth.uid()))));
$$;
revoke all on function public.can_read_document_file(text,text),
  public.can_manage_document_file(text,text) from public;
grant execute on function public.can_read_document_file(text,text),
  public.can_manage_document_file(text,text) to authenticated;

create or replace function public.tg_validate_document_file()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.file_path is not null and
     (tg_op = 'INSERT' or new.file_path is distinct from old.file_path) then
    if not exists (select 1 from storage.objects o where o.bucket_id = 'documents'
      and o.name = new.file_path and public.can_manage_document_file(o.name, coalesce(o.owner_id,o.owner::text))) then
      raise exception 'Upload a file you are allowed to manage before attaching it.';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_validate_document_file before insert or update on public.documents
  for each row execute function public.tg_validate_document_file();

drop policy documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (public.can_write() and
    (profile_id is null or profile_id = auth.uid() or public.can_edit_all()));
drop policy documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated
  using (public.can_edit_all() or (public.can_write() and created_by = auth.uid()))
  with check (public.can_edit_all() or (public.can_write() and created_by = auth.uid()
    and (profile_id is null or profile_id = auth.uid())));

drop policy documents_read on storage.objects;
create policy documents_read on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.can_read_document_file(name, coalesce(owner_id,owner::text)));
drop policy documents_update on storage.objects;
create policy documents_update on storage.objects for update to authenticated
  using (bucket_id = 'documents' and public.can_manage_document_file(name, coalesce(owner_id,owner::text)))
  with check (bucket_id = 'documents' and public.can_manage_document_file(name, coalesce(owner_id,owner::text)));
drop policy documents_delete on storage.objects;
create policy documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and public.can_manage_document_file(name, coalesce(owner_id,owner::text)));

drop policy receipts_update on storage.objects;
create policy receipts_update on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and
    (public.can_edit_all() or (public.can_write() and coalesce(owner_id,owner::text) = auth.uid()::text)))
  with check (bucket_id = 'receipts' and
    (public.can_edit_all() or (public.can_write() and coalesce(owner_id,owner::text) = auth.uid()::text)));
drop policy receipts_delete on storage.objects;
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and
    (public.can_edit_all() or (public.can_write() and coalesce(owner_id,owner::text) = auth.uid()::text)));

-- Keep Supabase-managed storage tables unchanged. Public helper functions
-- enforce immutable object identities and references through RLS only.
create or replace function public.file_identity_matches(p_id uuid,p_name text,p_bucket text,p_owner text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from storage.objects o where o.id=p_id and (
    (o.bucket_id not in ('documents','receipts') and p_bucket not in ('documents','receipts'))
    or (o.name=p_name and o.bucket_id=p_bucket
      and coalesce(o.owner_id,o.owner::text) is not distinct from p_owner)));
$$;
create or replace function public.file_is_unreferenced(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case p_bucket
    when 'documents' then not exists(select 1 from public.documents where file_path=p_path)
    when 'receipts' then not exists(select 1 from public.expenses where receipt_path=p_path)
    else false end;
$$;
revoke all on function public.file_identity_matches(uuid,text,text,text),public.file_is_unreferenced(text,text) from public;
grant execute on function public.file_identity_matches(uuid,text,text,text),public.file_is_unreferenced(text,text) to authenticated;

create policy app_files_identity on storage.objects as restrictive for update to authenticated
  using (true) with check (public.file_identity_matches(id,name,bucket_id,coalesce(owner_id,owner::text)));
create policy app_files_references on storage.objects as restrictive for delete to authenticated
  using (bucket_id not in ('documents','receipts') or public.file_is_unreferenced(bucket_id,name));
