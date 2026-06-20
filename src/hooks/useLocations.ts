import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { SavedLocation } from '@/types/db';

export function useSavedLocations() {
  return useQuery({
    queryKey: ['saved_locations'],
    queryFn: async (): Promise<SavedLocation[]> => {
      const { data, error } = await supabase
        .from('saved_locations')
        .select('*')
        .order('is_active', { ascending: false })
        .order('name');
      if (error) throw error;
      return data as SavedLocation[];
    },
  });
}

export interface SavedLocationInput {
  entity_id: string | null;
  name: string;
  location_type_id: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  default_trip_category_id: string | null;
  is_active: boolean;
  notes: string | null;
}

export function useSavedLocationMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['saved_locations'] });
    qc.invalidateQueries({ queryKey: ['audit_log'] });
  };
  const create = useMutation({
    mutationFn: async (input: SavedLocationInput) => {
      const { error } = await supabase.from('saved_locations').insert(input);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<SavedLocationInput> }) => {
      const { error } = await supabase.from('saved_locations').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('saved_locations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { create, update, remove };
}
