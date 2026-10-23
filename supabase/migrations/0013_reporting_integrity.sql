-- Fail preflight rather than silently rewrite historical mileage.
do $$ begin
  if exists (select 1 from public.trips where distance_source = 'odometer'
    and distance_miles <> odometer_end - odometer_start) then
    raise exception 'Correct inconsistent historical odometer distances before applying 0013.';
  end if;
end $$;

create or replace function public.tg_trip_distance()
returns trigger language plpgsql as $$
begin
  if new.distance_source = 'odometer' then
    new.distance_miles := new.odometer_end - new.odometer_start;
  end if;
  return new;
end;
$$;
create trigger trg_trip_distance before insert or update on public.trips
  for each row execute function public.tg_trip_distance();
alter table public.trips add constraint trips_distance_matches_odometer
  check (distance_source <> 'odometer' or distance_miles = odometer_end - odometer_start);

create or replace view public.v_vehicle_odometer with (security_invoker = true) as
select v.id as vehicle_id, greatest(
  coalesce(v.current_odometer, 0),
  coalesce((select max(t.odometer_end) from public.trips t where t.vehicle_id = v.id and t.trip_date <= current_date), 0),
  coalesce((select max(t.odometer_start) from public.trips t where t.vehicle_id = v.id and t.trip_date <= current_date), 0),
  coalesce((select max(m.odometer_at_service) from public.maintenance_records m
            where m.vehicle_id = v.id and m.service_date <= current_date), 0)
) as current_odometer from public.vehicles v;

create or replace view public.v_maintenance_due with (security_invoker = true) as
with baseline as (
  select s.id, s.vehicle_id, s.maintenance_type_id, s.interval_miles, s.interval_months,
    greatest(s.last_service_date, m.service_date) as last_service_date,
    greatest(s.last_service_odometer, m.odometer)::numeric(10,1) as last_service_odometer
  from public.maintenance_schedules s
  left join lateral (
    select max(service_date) as service_date, max(odometer_at_service) as odometer
    from public.maintenance_records r where r.vehicle_id = s.vehicle_id
      and r.maintenance_type_id = s.maintenance_type_id and r.service_date <= current_date
  ) m on true
  where s.is_active
)
select s.id, s.vehicle_id,
  trim(coalesce(v.year::text, '') || ' ' || coalesce(v.make, '') || ' ' || coalesce(v.model, '')) as vehicle_label,
  v.entity_id, s.maintenance_type_id, mt.name as maintenance_type_name,
  s.interval_miles, s.interval_months, s.last_service_date, s.last_service_odometer,
  vo.current_odometer,
  case when s.interval_miles is not null and s.last_service_odometer is not null
       then s.last_service_odometer + s.interval_miles end as next_due_odometer,
  case when s.interval_months is not null and s.last_service_date is not null
       then s.last_service_date + (s.interval_months * interval '1 month') end as next_due_date,
  case when s.interval_miles is not null and s.last_service_odometer is not null
       then s.last_service_odometer + s.interval_miles - vo.current_odometer end as miles_remaining,
  case when s.interval_months is not null and s.last_service_date is not null
       then (s.last_service_date + (s.interval_months * interval '1 month'))::date - current_date end as days_remaining,
  ((s.interval_miles is not null and s.last_service_odometer is not null
      and vo.current_odometer >= s.last_service_odometer + s.interval_miles)
    or (s.interval_months is not null and s.last_service_date is not null
      and current_date >= (s.last_service_date + (s.interval_months * interval '1 month'))::date)) as is_due
from baseline s join public.vehicles v on v.id = s.vehicle_id
join public.maintenance_types mt on mt.id = s.maintenance_type_id
left join public.v_vehicle_odometer vo on vo.vehicle_id = s.vehicle_id;
