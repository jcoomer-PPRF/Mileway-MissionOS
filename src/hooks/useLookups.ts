import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { DocumentType, JobTitle, LocationType, MaintenanceType } from '@/types/db';

// ---- Generic keyed lookup (key + name + sort_order + is_active) ----
export interface KeyedLookupInput {
  key: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

function useKeyedList<T>(table: string) {
  return useQuery({
    queryKey: [table],
    queryFn: async (): Promise<T[]> => {
      const { data, error } = await supabase.from(table).select('*').order('sort_order').order('name');
      if (error) throw error;
      return data as T[];
    },
  });
}

function useKeyedMutations(table: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: [table] });
  const create = useMutation({
    mutationFn: async (input: KeyedLookupInput) => {
      const { error } = await supabase.from(table).insert(input);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<KeyedLookupInput> }) => {
      const { error } = await supabase.from(table).update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { create, update };
}

export const useLocationTypes = () => useKeyedList<LocationType>('location_types');
export const useLocationTypeMutations = () => useKeyedMutations('location_types');
export const useMaintenanceTypes = () => useKeyedList<MaintenanceType>('maintenance_types');
export const useMaintenanceTypeMutations = () => useKeyedMutations('maintenance_types');
export const useDocumentTypes = () => useKeyedList<DocumentType>('document_types');
export const useDocumentTypeMutations = () => useKeyedMutations('document_types');

// ---- job_titles (name only) ----
export interface JobTitleInput {
  name: string;
  sort_order: number;
  is_active: boolean;
}

export function useJobTitles() {
  return useQuery({
    queryKey: ['job_titles'],
    queryFn: async (): Promise<JobTitle[]> => {
      const { data, error } = await supabase.from('job_titles').select('*').order('sort_order').order('name');
      if (error) throw error;
      return data as JobTitle[];
    },
  });
}

export function useJobTitleMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['job_titles'] });
  const create = useMutation({
    mutationFn: async (input: JobTitleInput) => {
      const { error } = await supabase.from('job_titles').insert(input);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<JobTitleInput> }) => {
      const { error } = await supabase.from('job_titles').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { create, update };
}
