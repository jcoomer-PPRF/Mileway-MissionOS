import { VEHICLE_COST_KEYS } from './constants';
import type { ExpenseDetail, TripDetail } from '@/types/db';

export interface EntityBreakdown {
  entity_id: string;
  entity_name: string;
  total_miles: number;
  business_miles: number;
  deduction: number;
}

export interface DashboardMetrics {
  businessMilesThisMonth: number;
  businessMilesYTD: number;
  totalMilesYTD: number;
  deductionThisMonth: number;
  deductionYTD: number;
  fuelCostsYTD: number;
  vehicleCostsYTD: number;
  totalExpensesYTD: number;
  tripCount: number;
  byEntity: EntityBreakdown[];
  /** Miles + deduction per month index 0-11, for the YTD trend chart. */
  monthly: { month: string; business_miles: number; total_miles: number; deduction: number }[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthIndex(iso: string): number {
  // 'YYYY-MM-DD' → month 0-11
  return Number(iso.slice(5, 7)) - 1;
}

export function computeDashboard(
  trips: TripDetail[],
  expenses: ExpenseDetail[],
  entityId: string | 'all',
  currentMonthIndex: number,
): DashboardMetrics {
  const t = entityId === 'all' ? trips : trips.filter((x) => x.entity_id === entityId);
  const e = entityId === 'all' ? expenses : expenses.filter((x) => x.entity_id === entityId);

  const isBusiness = (r: TripDetail) => r.irs_rate_type === 'business';

  const businessMilesYTD = t.filter(isBusiness).reduce((s, r) => s + Number(r.distance_miles), 0);
  const businessMilesThisMonth = t
    .filter((r) => isBusiness(r) && monthIndex(r.trip_date) === currentMonthIndex)
    .reduce((s, r) => s + Number(r.distance_miles), 0);
  const totalMilesYTD = t.reduce((s, r) => s + Number(r.distance_miles), 0);
  const deductionYTD = t.reduce((s, r) => s + Number(r.deduction_amount), 0);
  const deductionThisMonth = t
    .filter((r) => monthIndex(r.trip_date) === currentMonthIndex)
    .reduce((s, r) => s + Number(r.deduction_amount), 0);

  const fuelCostsYTD = e.filter((x) => x.category_key === 'fuel').reduce((s, x) => s + Number(x.amount), 0);
  const vehicleCostsYTD = e
    .filter((x) => VEHICLE_COST_KEYS.includes(x.category_key))
    .reduce((s, x) => s + Number(x.amount), 0);
  const totalExpensesYTD = e.reduce((s, x) => s + Number(x.amount), 0);

  // Per-entity breakdown (always computed across both, ignores entity filter)
  const byEntityMap = new Map<string, EntityBreakdown>();
  for (const r of trips) {
    const b = byEntityMap.get(r.entity_id) ?? {
      entity_id: r.entity_id,
      entity_name: r.entity_name,
      total_miles: 0,
      business_miles: 0,
      deduction: 0,
    };
    b.total_miles += Number(r.distance_miles);
    if (isBusiness(r)) b.business_miles += Number(r.distance_miles);
    b.deduction += Number(r.deduction_amount);
    byEntityMap.set(r.entity_id, b);
  }

  const monthly = MONTHS.map((m) => ({ month: m, business_miles: 0, total_miles: 0, deduction: 0 }));
  for (const r of t) {
    const mi = monthIndex(r.trip_date);
    if (mi < 0 || mi > 11) continue;
    monthly[mi].total_miles += Number(r.distance_miles);
    if (isBusiness(r)) monthly[mi].business_miles += Number(r.distance_miles);
    monthly[mi].deduction += Number(r.deduction_amount);
  }

  return {
    businessMilesThisMonth,
    businessMilesYTD,
    totalMilesYTD,
    deductionThisMonth,
    deductionYTD,
    fuelCostsYTD,
    vehicleCostsYTD,
    totalExpensesYTD,
    tripCount: t.length,
    byEntity: [...byEntityMap.values()].sort((a, b) => b.total_miles - a.total_miles),
    monthly,
  };
}
