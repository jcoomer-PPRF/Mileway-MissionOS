-- ============================================================================
-- Mileway — Phase 1 schema
-- Tables, enums, indexes, and audit/immutability triggers.
-- ============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role        as enum ('administrator', 'staff', 'auditor');
create type public.entity_type      as enum ('nonprofit_501c3', 'llc');
create type public.distance_source  as enum ('manual', 'odometer');
create type public.irs_rate_type    as enum ('business', 'medical', 'charitable', 'none');
create type public.audit_action     as enum ('insert', 'update', 'delete');

-- ---------------------------------------------------------------------------
-- Shared trigger functions
-- ---------------------------------------------------------------------------

-- Sets created_by/updated_by/timestamps and makes created_* immutable on UPDATE.
create or replace function public.tg_set_audit_fields()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := auth.uid();
  elsif (tg_op = 'UPDATE') then
    -- created_* can never change after the row is born.
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

-- Writes an immutable row into audit_log for every insert/update/delete.
create or replace function public.tg_write_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id  uuid;
begin
  if (tg_op = 'DELETE') then
    v_old := to_jsonb(old);
    v_id  := old.id;
  elsif (tg_op = 'UPDATE') then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_id  := new.id;
  else
    v_new := to_jsonb(new);
    v_id  := new.id;
  end if;

  insert into public.audit_log (table_name, record_id, action, changed_by, old_data, new_data)
  values (tg_table_name, v_id, lower(tg_op)::public.audit_action, auth.uid(), v_old, v_new);

  if (tg_op = 'DELETE') then
    return old;
  end if;
  return new;
end;
$$;

-- Attaches the standard audit-field + audit-log triggers to a table.
create or replace function public.attach_audit(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create trigger trg_audit_fields before insert or update on %s
       for each row execute function public.tg_set_audit_fields();', p_table);
  execute format(
    'create trigger trg_audit_log after insert or update or delete on %s
       for each row execute function public.tg_write_audit();', p_table);
end;
$$;

-- ---------------------------------------------------------------------------
-- audit_log (append-only; immutability enforced via RLS having no write policy)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text        not null,
  record_id   uuid        not null,
  action      public.audit_action not null,
  changed_by  uuid,
  changed_at  timestamptz not null default now(),
  old_data    jsonb,
  new_data    jsonb
);
create index audit_log_record_idx on public.audit_log (table_name, record_id);
create index audit_log_changed_at_idx on public.audit_log (changed_at desc);

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users) — carries the role
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text not null,
  full_name         text,
  role              public.user_role not null default 'staff',
  default_entity_id uuid,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid
);

-- ---------------------------------------------------------------------------
-- entities (seeded with exactly two: Foundation [primary] + Operating LLC)
-- ---------------------------------------------------------------------------
create table public.entities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  legal_name  text,
  entity_type public.entity_type not null,
  is_primary  boolean not null default false,
  ein         text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id),
  updated_by  uuid references public.profiles (id)
);

-- Deferred FKs on profiles now that both tables exist.
alter table public.profiles
  add constraint profiles_default_entity_fk
    foreign key (default_entity_id) references public.entities (id) on delete set null,
  add constraint profiles_created_by_fk
    foreign key (created_by) references public.profiles (id),
  add constraint profiles_updated_by_fk
    foreign key (updated_by) references public.profiles (id);

-- ---------------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------------
create table public.vehicles (
  id                     uuid primary key default gen_random_uuid(),
  entity_id              uuid not null references public.entities (id),
  vin                    text,
  license_plate          text,
  year                   int check (year between 1900 and 2100),
  make                   text,
  model                  text,
  current_odometer       numeric(10,1) check (current_odometer >= 0),
  insurance_provider     text,
  insurance_policy_number text,
  insurance_expiration   date,
  registration_number    text,
  registration_expiration date,
  is_active              boolean not null default true,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid references public.profiles (id),
  updated_by             uuid references public.profiles (id)
);
create index vehicles_entity_idx on public.vehicles (entity_id);

-- ---------------------------------------------------------------------------
-- trip_categories (editable) + IRS rate-type mapping
-- ---------------------------------------------------------------------------
create table public.trip_categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  irs_rate_type public.irs_rate_type not null default 'business',
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.profiles (id),
  updated_by    uuid references public.profiles (id)
);

-- ---------------------------------------------------------------------------
-- expense_categories (stable `key` so reporting survives a rename)
-- ---------------------------------------------------------------------------
create table public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  name        text not null,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles (id),
  updated_by  uuid references public.profiles (id)
);

-- ---------------------------------------------------------------------------
-- mileage_rates (date-effective IRS standard rates, editable by admins)
-- ---------------------------------------------------------------------------
create table public.mileage_rates (
  id             uuid primary key default gen_random_uuid(),
  rate_type      public.irs_rate_type not null,
  rate_per_mile  numeric(6,3) not null check (rate_per_mile >= 0),
  effective_date date not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references public.profiles (id),
  updated_by     uuid references public.profiles (id),
  unique (rate_type, effective_date)
);

-- ---------------------------------------------------------------------------
-- trips (manual mileage log — no GPS)
-- ---------------------------------------------------------------------------
create table public.trips (
  id              uuid primary key default gen_random_uuid(),
  entity_id       uuid not null references public.entities (id),
  vehicle_id      uuid not null references public.vehicles (id),
  category_id     uuid not null references public.trip_categories (id),
  trip_date       date not null,
  odometer_start  numeric(10,1) check (odometer_start >= 0),
  odometer_end    numeric(10,1) check (odometer_end >= 0),
  distance_miles  numeric(10,1) not null check (distance_miles >= 0),
  distance_source public.distance_source not null default 'manual',
  destination     text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references public.profiles (id),
  updated_by      uuid references public.profiles (id),
  constraint trips_odometer_valid check (
    distance_source <> 'odometer'
    or (odometer_start is not null and odometer_end is not null and odometer_end >= odometer_start)
  )
);
create index trips_entity_idx   on public.trips (entity_id);
create index trips_vehicle_idx  on public.trips (vehicle_id);
create index trips_category_idx on public.trips (category_id);
create index trips_date_idx     on public.trips (trip_date);
create index trips_created_by_idx on public.trips (created_by);

-- ---------------------------------------------------------------------------
-- expenses (receipt is stored as a Storage path only — no OCR)
-- ---------------------------------------------------------------------------
create table public.expenses (
  id                  uuid primary key default gen_random_uuid(),
  entity_id           uuid not null references public.entities (id),
  vehicle_id          uuid references public.vehicles (id),
  expense_category_id uuid not null references public.expense_categories (id),
  amount              numeric(12,2) not null check (amount >= 0),
  expense_date        date not null,
  merchant            text,
  notes               text,
  receipt_path        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.profiles (id),
  updated_by          uuid references public.profiles (id)
);
create index expenses_entity_idx   on public.expenses (entity_id);
create index expenses_vehicle_idx  on public.expenses (vehicle_id);
create index expenses_category_idx on public.expenses (expense_category_id);
create index expenses_date_idx     on public.expenses (expense_date);
create index expenses_created_by_idx on public.expenses (created_by);

-- ---------------------------------------------------------------------------
-- Attach audit triggers to every business table
-- ---------------------------------------------------------------------------
select public.attach_audit('public.profiles');
select public.attach_audit('public.entities');
select public.attach_audit('public.vehicles');
select public.attach_audit('public.trip_categories');
select public.attach_audit('public.expense_categories');
select public.attach_audit('public.mileage_rates');
select public.attach_audit('public.trips');
select public.attach_audit('public.expenses');

-- ---------------------------------------------------------------------------
-- Prevent non-admins from changing their own (or anyone's) role.
-- ---------------------------------------------------------------------------
create or replace function public.tg_protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.role is distinct from old.role)
     and not coalesce((select role = 'administrator' from public.profiles where id = auth.uid()), false) then
    raise exception 'Only an administrator may change a user role.';
  end if;
  return new;
end;
$$;

create trigger trg_protect_profile_role
  before update on public.profiles
  for each row execute function public.tg_protect_profile_role();

-- ---------------------------------------------------------------------------
-- Auto-provision a profile when a new auth user is created.
-- The very first user becomes the administrator (bootstrap); the rest are staff.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.user_role;
begin
  if exists (select 1 from public.profiles where role = 'administrator') then
    v_role := 'staff';
  else
    v_role := 'administrator';
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
