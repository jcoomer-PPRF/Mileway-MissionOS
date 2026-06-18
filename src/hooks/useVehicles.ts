import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Vehicle } from '@/types/db';

export function useVehicles() {
  return useQuery({
    queryKey: ['vehicles'],
    queryFn: async (): Promise<Vehicle[]> => {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .order('is_active', { ascending: false })
        .order('make');
      if (error) throw error;
      return data as Vehicle[];
    },
  });
}

export interface VehicleInput {
  entity_id: string;
  vin: string | null;
  license_plate: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  current_odometer: number | null;
  insurance_provider: string | null;
  insurance_policy_number: string | null;
  insurance_expiration: string | null;
  registration_number: string | null;
  registration_expiration: string | null;
  is_active: boolean;
  notes: string | null;
}

export function useVehicleMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['vehicles'] });
    qc.invalidateQueries({ queryKey: ['audit_log'] });
  };
  const create = useMutation({
    mutationFn: async (input: VehicleInput) => {
      const { error } = await supabase.from('vehicles').insert(input);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<VehicleInput> }) => {
      const { error } = await supabase.from('vehicles').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vehicles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { create, update, remove };
}
