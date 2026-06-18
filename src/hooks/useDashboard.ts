import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ExpenseDetail, TripDetail } from '@/types/db';

/** Fetches a single calendar year of trip + expense detail for the dashboard. */
export function useDashboardData(year: number) {
  const trips = useQuery({
    queryKey: ['dashboard', 'trips', year],
    queryFn: async (): Promise<TripDetail[]> => {
      const { data, error } = await supabase
        .from('v_trip_details')
        .select('*')
        .gte('trip_date', `${year}-01-01`)
        .lte('trip_date', `${year}-12-31`);
      if (error) throw error;
      return data as TripDetail[];
    },
  });

  const expenses = useQuery({
    queryKey: ['dashboard', 'expenses', year],
    queryFn: async (): Promise<ExpenseDetail[]> => {
      const { data, error } = await supabase
        .from('v_expense_details')
        .select('*')
        .gte('expense_date', `${year}-01-01`)
        .lte('expense_date', `${year}-12-31`);
      if (error) throw error;
      return data as ExpenseDetail[];
    },
  });

  return { trips, expenses };
}
