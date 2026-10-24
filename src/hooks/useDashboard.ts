import { todayISO } from '@/lib/utils';
import { fetchAllRows } from '@/lib/pagination';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ExpenseDetail, TripDetail } from '@/types/db';

/** Fetches a single calendar year of trip + expense detail for the dashboard. */
export function useDashboardData(year: number) {
  const until = year === new Date().getFullYear() ? todayISO() : `${year}-12-31`;
  const trips = useQuery({
    queryKey: ['dashboard', 'trips', year, until],
    queryFn: async ({ signal }): Promise<TripDetail[]> =>
      fetchAllRows<TripDetail>(
        (from, to) =>
          supabase
            .from('v_trip_details')
            .select('*', { count: 'exact' })
            .gte('trip_date', `${year}-01-01`)
            .lte('trip_date', until)
            .order('id')
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
  });

  const expenses = useQuery({
    queryKey: ['dashboard', 'expenses', year, until],
    queryFn: async ({ signal }): Promise<ExpenseDetail[]> =>
      fetchAllRows<ExpenseDetail>(
        (from, to) =>
          supabase
            .from('v_expense_details')
            .select('*', { count: 'exact' })
            .gte('expense_date', `${year}-01-01`)
            .lte('expense_date', until)
            .order('id')
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
  });

  return { trips, expenses };
}
