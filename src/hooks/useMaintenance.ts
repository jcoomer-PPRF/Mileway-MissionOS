import { fetchAllRows, applyRecordFilters, type RecordFilters } from '@/lib/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { MaintenanceDue, MaintenanceRecord, MaintenanceSchedule } from '@/types/db';

// ---- Service history ----
export function useMaintenanceRecords(filters: RecordFilters = {}) {
  return useQuery({
    queryKey: ['maintenance_records', filters],
    queryFn: async ({ signal }): Promise<MaintenanceRecord[]> =>
      fetchAllRows<MaintenanceRecord>(
        (from, to) =>
          applyRecordFilters(
            supabase
              .from('maintenance_records')
              .select('*', { count: 'exact' })
              .order('service_date', { ascending: false })
              .order('id'),
            filters,
            'service_date',
          )
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
  });
}

export interface MaintenanceRecordInput {
  vehicle_id: string;
  entity_id: string | null;
  maintenance_type_id: string;
  service_date: string;
  odometer_at_service: number | null;
  cost: number | null;
  vendor: string | null;
  notes: string | null;
  linked_expense_id: string | null;
}

export function useMaintenanceRecordMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['maintenance_records'] });
    qc.invalidateQueries({ queryKey: ['maintenance_due'] });
    qc.invalidateQueries({ queryKey: ['audit_log'] });
  };
  const create = useMutation({
    mutationFn: async (input: MaintenanceRecordInput) => {
      const { error } = await supabase.from('maintenance_records').insert(input);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<MaintenanceRecordInput> }) => {
      const { error } = await supabase
        .from('maintenance_records')
        .update(input)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('maintenance_records')
        .delete()
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { create, update, remove };
}

// ---- Schedules ----
export function useMaintenanceSchedules() {
  return useQuery({
    queryKey: ['maintenance_schedules'],
    queryFn: async ({ signal }): Promise<MaintenanceSchedule[]> =>
      fetchAllRows<MaintenanceSchedule>(
        (from, to) =>
          supabase
            .from('maintenance_schedules')
            .select('*', { count: 'exact' })
            .order('is_active', { ascending: false })
            .order('id')
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
  });
}

export interface MaintenanceScheduleInput {
  vehicle_id: string;
  maintenance_type_id: string;
  interval_miles: number | null;
  interval_months: number | null;
  last_service_date: string | null;
  last_service_odometer: number | null;
  is_active: boolean;
  notes: string | null;
}

export function useMaintenanceScheduleMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['maintenance_schedules'] });
    qc.invalidateQueries({ queryKey: ['maintenance_due'] });
    qc.invalidateQueries({ queryKey: ['audit_log'] });
  };
  const create = useMutation({
    mutationFn: async (input: MaintenanceScheduleInput) => {
      const { error } = await supabase.from('maintenance_schedules').insert(input);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<MaintenanceScheduleInput> }) => {
      const { error } = await supabase
        .from('maintenance_schedules')
        .update(input)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('maintenance_schedules')
        .delete()
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { create, update, remove };
}

// ---- Computed due/overdue ----
export function useMaintenanceDue() {
  return useQuery({
    queryKey: ['maintenance_due'],
    queryFn: async ({ signal }): Promise<MaintenanceDue[]> =>
      fetchAllRows<MaintenanceDue>(
        (from, to) =>
          supabase
            .from('v_maintenance_due')
            .select('*', { count: 'exact' })
            .order('id')
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
  });
}
