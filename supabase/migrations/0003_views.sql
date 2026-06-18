-- ============================================================================
-- Mileway — reporting views
-- security_invoker = true → the caller's RLS applies when querying the view.
-- ============================================================================

-- Trip details with the IRS rate effective on the trip date and the resulting
-- estimated deduction. Powers the dashboard and the IRS-format mileage log.
create or replace view public.v_trip_details
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
  t.updated_at
from public.trips t
join public.entities e        on e.id = t.entity_id
join public.vehicles v        on v.id = t.vehicle_id
join public.trip_categories c on c.id = t.category_id
left join lateral (
  select mr.rate_per_mile
  from public.mileage_rates mr
  where mr.rate_type = c.irs_rate_type
    and mr.effective_date <= t.trip_date
  order by mr.effective_date desc
  limit 1
) r on true;

-- Expense details flattened for reporting/export.
create or replace view public.v_expense_details
with (security_invoker = true) as
select
  x.id,
  x.expense_date,
  x.entity_id,
  e.name       as entity_name,
  e.is_primary as entity_is_primary,
  x.vehicle_id,
  case
    when v.id is not null
    then trim(coalesce(v.year::text, '') || ' ' || coalesce(v.make, '') || ' ' || coalesce(v.model, ''))
    else null
  end as vehicle_label,
  x.expense_category_id,
  c.key  as category_key,
  c.name as category_name,
  x.amount,
  x.merchant,
  x.notes,
  x.receipt_path,
  x.created_by,
  x.created_at,
  x.updated_at
from public.expenses x
join public.entities e            on e.id = x.entity_id
left join public.vehicles v       on v.id = x.vehicle_id
join public.expense_categories c  on c.id = x.expense_category_id;

grant select on public.v_trip_details   to authenticated;
grant select on public.v_expense_details to authenticated;
