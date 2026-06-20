import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { DistanceSource, TripDetail } from '@/types/db';

export function useTripDetails() {
  return useQuery({
    queryKey: ['trip_details'],
    queryFn: async (): Promise<TripDetail[]> => {
      const { data, error } = await supabase
        .from('v_trip_details')
        .select('*')
        .order('trip_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as TripDetail[];
    },
  });
}

export interface TripInput {
  entity_id: string;
  vehicle_id: string;
  category_id: string;
  trip_date: string;
  distance_source: DistanceSource;
  odometer_start: number | null;
  odometer_end: number | null;
  distance_miles: number;
  destination: string | null;
  notes: string | null;
  start_location_id: string | null;
  end_location_id: string | null;
  auto_categorized: boolean;
}

export function useTripMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['trip_details'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['audit_log'] });
  };
  const create = useMutation({
    mutationFn: async (input: TripInput) => {
      const { error } = await supabase.from('trips').insert(input);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<TripInput> }) => {
      const { error } = await supabase.from('trips').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trips').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { create, update, remove };
}
