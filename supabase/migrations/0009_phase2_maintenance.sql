-- ============================================================================
-- Mileway — Phase 2 (0009): fleet maintenance
--   maintenance_types (lookup), maintenance_records (service history),
--   maintenance_schedules (intervals). "Due" is never stored — it is computed
--   in v_maintenance_due against each vehicle's derived current odometer.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- maintenance_types — editable lookup
-- ---------------------------------------------------------------------------
create table public.maintenance_types (
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
alter table public.maintenance_types enable row level security;
select public.attach_audit('public.maintenance_types');
grant select, insert, update, delete on public.maintenance_types to authenticated;

insert into public.maintenance_types (key, name, sort_order) values
  ('oil_change',           'Oil Change',           1),
  ('tire_rotation',        'Tire Rotation',        2),
  ('brake_service',        'Brake Service',        3),
  ('repair',               'Repair',               4),
  ('inspection',           'Inspection',           5),
  ('registration_renewal', 'Registration Renewal', 6),
  ('insurance_renewal',    'Insurance Renewal',    7)
on conflict (key) do nothing;

create policy maintenance_types_select on public.maintenance_types
  for select to authenticated using (true);
create policy maintenance_types_admin_write on public.maintenance_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- maintenance_records — service history (entity defaults from the vehicle)
-- ---------------------------------------------------------------------------
create table public.maintenance_records (
  id                  uuid primary key default gen_random_uuid(),
  vehicle_id          uuid not null references public.vehicles (id),
  entity_id           uuid not null references public.entities (id),
  maintenance_type_id uuid not null references public.maintenance_types (id),
  service_date        date not null,
  odometer_at_service numeric(10,1) check (odometer_at_service >= 0),
  cost                numeric(12,2) check (cost >= 0),
  vendor              text,
  notes               text,
  linked_expense_id   uuid references public.expenses (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references public.profiles (id),
  updated_by          uuid references public.profiles (id)
);
create index maintenance_records_vehicle_idx on public.maintenance_records (vehicle_id);
create index maintenance_records_type_idx    on public.maintenance_records (maintenance_type_id);
create index maintenance_records_date_idx     on public.maintenance_records (service_date);
alter table public.maintenance_records enable row level security;

-- entity_id defaults from the vehicle when omitted.
create or replace function public.tg_maintenance_record_entity()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.entity_id is null then
    select entity_id into new.entity_id from public.vehicles where id = new.vehicle_id;
  end if;
  return new;
end;
$$;
create trigger trg_maintenance_record_entity
  before insert or update on public.maintenance_records
  for each row execute function public.tg_maintenance_record_entity();

select public.attach_audit('public.maintenance_records');
grant select, insert, update, delete on public.maintenance_records to authenticated;

create policy maintenance_records_select on public.maintenance_records
  for select to authenticated using (true);
create policy maintenance_records_insert on public.maintenance_records
  for insert to authenticated with check (public.can_write());
create policy maintenance_records_update on public.maintenance_records
  for update to authenticated
  using (public.can_edit_all() or created_by = auth.uid())
  with check (public.can_edit_all() or created_by = auth.uid());
create policy maintenance_records_delete on public.maintenance_records
  for delete to authenticated using (public.can_edit_all() or created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- maintenance_schedules — intervals per vehicle + type (fleet config)
-- ---------------------------------------------------------------------------
create table public.maintenance_schedules (
  id                    uuid primary key default gen_random_uuid(),
  vehicle_id            uuid not null references public.vehicles (id),
  maintenance_type_id   uuid not null references public.maintenance_types (id),
  interval_miles        int check (interval_miles > 0),
  interval_months       int check (interval_months > 0),
  last_service_date     date,
  last_service_odometer numeric(10,1) check (last_service_odometer >= 0),
  is_active             boolean not null default true,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references public.profiles (id),
  updated_by            uuid references public.profiles (id),
  unique (vehicle_id, maintenance_type_id),
  constraint maintenance_schedule_has_interval
    check (interval_miles is not null or interval_months is not null)
);
create index maintenance_schedules_vehicle_idx on public.maintenance_schedules (vehicle_id);
alter table public.maintenance_schedules enable row level security;
select public.attach_audit('public.maintenance_schedules');
grant select, insert, update, delete on public.maintenance_schedules to authenticated;

create policy maintenance_schedules_select on public.maintenance_schedules
  for select to authenticated using (true);
create policy maintenance_schedules_write on public.maintenance_schedules
  for all to authenticated using (public.can_edit_all()) with check (public.can_edit_all());

-- ---------------------------------------------------------------------------
-- Derived current odometer per vehicle (max of vehicle reading + trip odometers)
-- ---------------------------------------------------------------------------
create or replace view public.v_vehicle_odometer
with (security_invoker = true) as
select
  v.id as vehicle_id,
  greatest(
    coalesce(v.current_odometer, 0),
    coalesce((select max(t.odometer_end) from public.trips t where t.vehicle_id = v.id), 0),
    coalesce((select max(t.odometer_start) from public.trips t where t.vehicle_id = v.id), 0)
  ) as current_odometer
from public.vehicles v;

grant select on public.v_vehicle_odometer to authenticated;

-- ---------------------------------------------------------------------------
-- Computed maintenance-due view (never stores "due")
-- ---------------------------------------------------------------------------
create or replace view public.v_maintenance_due
with (security_invoker = true) as
select
  s.id,
  s.vehicle_id,
  trim(coalesce(v.year::text, '') || ' ' || coalesce(v.make, '') || ' ' || coalesce(v.model, '')) as vehicle_label,
  v.entity_id,
  s.maintenance_type_id,
  mt.name as maintenance_type_name,
  s.interval_miles,
  s.interval_months,
  s.last_service_date,
  s.last_service_odometer,
  vo.current_odometer,
  case when s.interval_miles is not null and s.last_service_odometer is not null
       then s.last_service_odometer + s.interval_miles end as next_due_odometer,
  case when s.interval_months is not null and s.last_service_date is not null
       then s.last_service_date + (s.interval_months * interval '1 month') end as next_due_date,
  case when s.interval_miles is not null and s.last_service_odometer is not null
       then s.last_service_odometer + s.interval_miles - vo.current_odometer end as miles_remaining,
  case when s.interval_months is not null and s.last_service_date is not null
       then (s.last_service_date + (s.interval_months * interval '1 month'))::date - current_date end as days_remaining,
  (
    (s.interval_miles is not null and s.last_service_odometer is not null
       and vo.current_odometer >= s.last_service_odometer + s.interval_miles)
    or
    (s.interval_months is not null and s.last_service_date is not null
       and current_date >= (s.last_service_date + (s.interval_months * interval '1 month'))::date)
  ) as is_due
from public.maintenance_schedules s
join public.vehicles v          on v.id = s.vehicle_id
join public.maintenance_types mt on mt.id = s.maintenance_type_id
left join public.v_vehicle_odometer vo on vo.vehicle_id = s.vehicle_id
where s.is_active;

grant select on public.v_maintenance_due to authenticated;
