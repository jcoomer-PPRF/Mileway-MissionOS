-- ============================================================================
-- Mileway — Phase 2 (0007): role model
--
-- Splits "role" into two ideas:
--   * job_title  — display/reporting only (the nine titles)
--   * role       — the permission tier (owner | manager | contributor |
--                  accountant | auditor)
--
-- Permission tiers:
--   owner       full access incl. user management + settings (was: administrator)
--   manager     read/write ALL operational data; no user mgmt, no settings
--   contributor read all; create/edit only their OWN records (was: staff)
--   accountant  read all + run/export financial reports; no operational edits
--   auditor     read-only (unchanged)
--
-- Data migration: the enum RENAME in 0006 already mapped existing users
-- (administrator -> owner, staff -> contributor, auditor -> auditor) in place,
-- without dropping any profile rows or their access.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- job_titles — editable lookup, display/reporting only
-- ---------------------------------------------------------------------------
create table public.job_titles (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id)
);
alter table public.job_titles enable row level security;
select public.attach_audit('public.job_titles');
grant select, insert, update, delete on public.job_titles to authenticated;

insert into public.job_titles (name, sort_order) values
  ('Super Administrator',      1),
  ('Executive Director',       2),
  ('Administrator',            3),
  ('Program Manager',          4),
  ('Transportation Coordinator', 5),
  ('Employee',                 6),
  ('Driver',                   7),
  ('Read-Only Auditor',        8),
  ('Accountant',               9)
on conflict (name) do nothing;

-- profiles gains a (nullable) job title; default role is now contributor.
alter table public.profiles add column if not exists job_title_id uuid references public.job_titles (id);
alter table public.profiles alter column role set default 'contributor';

create policy job_titles_select on public.job_titles
  for select to authenticated using (true);
create policy job_titles_admin_write on public.job_titles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Permission helper functions (redefined for the five tiers)
--   is_admin()  is kept (now == owner) so all existing Phase 1 settings/user
--   policies continue to mean "owner only" with no rewrite.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public, pg_temp
  as $$ select coalesce((select role = 'owner' from public.profiles where id = auth.uid()), false); $$;

create or replace function public.is_owner() returns boolean
  language sql stable security definer set search_path = public, pg_temp
  as $$ select coalesce((select role = 'owner' from public.profiles where id = auth.uid()), false); $$;

-- May edit ANY operational record (owner + manager).
create or replace function public.can_edit_all() returns boolean
  language sql stable security definer set search_path = public, pg_temp
  as $$ select coalesce((select role in ('owner','manager') from public.profiles where id = auth.uid()), false); $$;

-- May create operational records (owner + manager + contributor).
create or replace function public.can_write() returns boolean
  language sql stable security definer set search_path = public, pg_temp
  as $$ select coalesce((select role in ('owner','manager','contributor') from public.profiles where id = auth.uid()), false); $$;

-- May read financial/sensitive data & reports (owner + manager + accountant + auditor).
create or replace function public.can_read_financials() returns boolean
  language sql stable security definer set search_path = public, pg_temp
  as $$ select coalesce((select role in ('owner','manager','accountant','auditor') from public.profiles where id = auth.uid()), false); $$;

-- ---------------------------------------------------------------------------
-- Update Phase 1 operational write policies so MANAGERS can edit all records
-- (Phase 1 allowed only admin-or-owner; contributors still edit only their own.)
-- ---------------------------------------------------------------------------
drop policy if exists vehicles_update on public.vehicles;
drop policy if exists vehicles_delete on public.vehicles;
create policy vehicles_update on public.vehicles for update to authenticated
  using (public.can_edit_all() or created_by = auth.uid())
  with check (public.can_edit_all() or created_by = auth.uid());
create policy vehicles_delete on public.vehicles for delete to authenticated
  using (public.can_edit_all() or created_by = auth.uid());

drop policy if exists trips_update on public.trips;
drop policy if exists trips_delete on public.trips;
create policy trips_update on public.trips for update to authenticated
  using (public.can_edit_all() or created_by = auth.uid())
  with check (public.can_edit_all() or created_by = auth.uid());
create policy trips_delete on public.trips for delete to authenticated
  using (public.can_edit_all() or created_by = auth.uid());

drop policy if exists expenses_update on public.expenses;
drop policy if exists expenses_delete on public.expenses;
create policy expenses_update on public.expenses for update to authenticated
  using (public.can_edit_all() or created_by = auth.uid())
  with check (public.can_edit_all() or created_by = auth.uid());
create policy expenses_delete on public.expenses for delete to authenticated
  using (public.can_edit_all() or created_by = auth.uid());

-- Audit log: owner, accountant, and auditor may read.
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.is_owner() or public.current_user_role() in ('auditor','accountant'));

-- ---------------------------------------------------------------------------
-- Only owners may change a role; first signup bootstraps as owner.
-- ---------------------------------------------------------------------------
create or replace function public.tg_protect_profile_role()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if (new.role is distinct from old.role)
     and not coalesce((select role = 'owner' from public.profiles where id = auth.uid()), false) then
    raise exception 'Only an owner may change a user role.';
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_role public.user_role;
begin
  if exists (select 1 from public.profiles where role = 'owner') then
    v_role := 'contributor';
  else
    v_role := 'owner';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    v_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
