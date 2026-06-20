-- ============================================================================
-- Mileway — Phase 2 (0008): saved locations (geofences) + GPS trip fields
--
-- Auto-categorization rule (no separate rules engine): a trip whose start or
-- end point falls within a saved location's geofence inherits that location's
-- default trip category. A manual category override clears auto_categorized.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- location_types — editable lookup
-- ---------------------------------------------------------------------------
create table public.location_types (
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
alter table public.location_types enable row level security;
select public.attach_audit('public.location_types');
grant select, insert, update, delete on public.location_types to authenticated;

insert into public.location_types (key, name, sort_order) values
  ('home',            'Home',            1),
  ('group_home',      'Group Home',      2),
  ('hospital',        'Hospital',        3),
  ('pharmacy',        'Pharmacy',        4),
  ('county_office',   'County Office',   5),
  ('day_program',     'Day Program',     6),
  ('employment_site', 'Employment Site', 7),
  ('vendor',          'Vendor',          8)
on conflict (key) do nothing;

create policy location_types_select on public.location_types
  for select to authenticated using (true);
create policy location_types_admin_write on public.location_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- saved_locations — geofences for destination recognition + auto-categorization
--   entity_id NULL = shared across both entities
-- ---------------------------------------------------------------------------
create table public.saved_locations (
  id                       uuid primary key default gen_random_uuid(),
  entity_id                uuid references public.entities (id),
  name                     text not null,
  location_type_id         uuid references public.location_types (id),
  latitude                 numeric(9,6) not null,
  longitude                numeric(9,6) not null,
  radius_meters            int not null default 150 check (radius_meters > 0),
  default_trip_category_id uuid references public.trip_categories (id),
  is_active                boolean not null default true,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid references public.profiles (id),
  updated_by               uuid references public.profiles (id)
);
create index saved_locations_entity_idx on public.saved_locations (entity_id);
alter table public.saved_locations enable row level security;
select public.attach_audit('public.saved_locations');
grant select, insert, update, delete on public.saved_locations to authenticated;

create policy saved_locations_select on public.saved_locations
  for select to authenticated using (true);
create policy saved_locations_write on public.saved_locations
  for all to authenticated using (public.can_edit_all()) with check (public.can_edit_all());

-- ---------------------------------------------------------------------------
-- Geofence helpers (used by app/native logic and the auto-categorize path)
-- ---------------------------------------------------------------------------
create or replace function public.earth_distance_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) returns double precision
language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Nearest active geofence that contains the point (respecting entity scope).
create or replace function public.find_location_for_point(
  p_lat double precision, p_lng double precision, p_entity uuid
) returns uuid
language sql stable as $$
  select sl.id
  from public.saved_locations sl
  where sl.is_active
    and (sl.entity_id is null or sl.entity_id = p_entity)
    and public.earth_distance_m(p_lat, p_lng, sl.latitude, sl.longitude) <= sl.radius_meters
  order by public.earth_distance_m(p_lat, p_lng, sl.latitude, sl.longitude) asc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- trips: additive GPS / location columns (manual & odometer logging unchanged)
-- ---------------------------------------------------------------------------
alter table public.trips
  add column if not exists start_lat          numeric(9,6),
  add column if not exists start_lng          numeric(9,6),
  add column if not exists end_lat            numeric(9,6),
  add column if not exists end_lng            numeric(9,6),
  add column if not exists started_at         timestamptz,
  add column if not exists ended_at           timestamptz,
  add column if not exists route_polyline     text,
  add column if not exists start_location_id  uuid references public.saved_locations (id),
  add column if not exists end_location_id    uuid references public.saved_locations (id),
  add column if not exists auto_categorized   boolean not null default false;

create index if not exists trips_start_location_idx on public.trips (start_location_id);
create index if not exists trips_end_location_idx   on public.trips (end_location_id);

-- ---------------------------------------------------------------------------
-- Refresh v_trip_details to surface location + GPS context (security_invoker)
-- ---------------------------------------------------------------------------
drop view if exists public.v_trip_details;
create view public.v_trip_details
with (security_invoker = true) as
select
  t.id,
  t.trip_date,
  t.entity_id,
  e.name        as entity_name,
  e.is_primary  as entity_is_primary,
  t.vehicle_id,
  trim(coalesce(v.year::text, '') || ' ' || coalesce(v.make, '') || ' ' || coalesce(v.model, '')) as vehicle_label,
  v.license_plate,
  t.category_id,
  c.name          as category_name,
  c.irs_rate_type,
  t.odometer_start,
  t.odometer_end,
  t.distance_miles,
  t.distance_source,
  t.destination,
  t.notes,
  r.rate_per_mile as applied_rate,
  round(t.distance_miles * coalesce(r.rate_per_mile, 0), 2) as deduction_amount,
  t.created_by,
  t.created_at,
  t.updated_at,
  -- Phase 2 additions
  t.started_at,
  t.ended_at,
  t.start_location_id,
  sl_start.name as start_location_name,
  t.end_location_id,
  sl_end.name   as end_location_name,
  t.auto_categorized
from public.trips t
join public.entities e             on e.id = t.entity_id
join public.vehicles v             on v.id = t.vehicle_id
join public.trip_categories c      on c.id = t.category_id
left join public.saved_locations sl_start on sl_start.id = t.start_location_id
left join public.saved_locations sl_end   on sl_end.id = t.end_location_id
left join lateral (
  select mr.rate_per_mile
  from public.mileage_rates mr
  where mr.rate_type = c.irs_rate_type
    and mr.effective_date <= t.trip_date
  order by mr.effective_date desc
  limit 1
) r on true;

grant select on public.v_trip_details to authenticated;
