import { fetchAllRows } from '@/lib/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Entity, ExpenseCategory, IrsRateType, MileageRate, TripCategory } from '@/types/db';

// ---- Entities --------------------------------------------------------------
export function useEntities() {
  return useQuery({
    queryKey: ['entities'],
    queryFn: async ({ signal }): Promise<Entity[]> =>
      fetchAllRows<Entity>(
        (from, to) =>
          supabase
            .from('entities')
            .select('*', { count: 'exact' })
            .order('is_primary', { ascending: false })
            .order('name')
            .order('id')
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
  });
}

export function useEntityMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['entities'] });
  const update = useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: Partial<Pick<Entity, 'name' | 'legal_name' | 'ein'>>;
    }) => {
      const { error } = await supabase
        .from('entities')
        .update(input)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { update };
}

// ---- Trip categories -------------------------------------------------------
export function useTripCategories() {
  return useQuery({
    queryKey: ['trip_categories'],
    queryFn: async ({ signal }): Promise<TripCategory[]> =>
      fetchAllRows<TripCategory>(
        (from, to) =>
          supabase
            .from('trip_categories')
            .select('*', { count: 'exact' })
            .order('sort_order')
            .order('name')
            .order('id')
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
  });
}

export interface TripCategoryInput {
  name: string;
  irs_rate_type: IrsRateType;
  is_active: boolean;
  sort_order: number;
}

export function useTripCategoryMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['trip_categories'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['trip_details'] });
  };
  const create = useMutation({
    mutationFn: async (input: TripCategoryInput) => {
      const { error } = await supabase.from('trip_categories').insert(input);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<TripCategoryInput> }) => {
      const { error } = await supabase
        .from('trip_categories')
        .update(input)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { create, update };
}

// ---- Expense categories ----------------------------------------------------
export function useExpenseCategories() {
  return useQuery({
    queryKey: ['expense_categories'],
    queryFn: async ({ signal }): Promise<ExpenseCategory[]> =>
      fetchAllRows<ExpenseCategory>(
        (from, to) =>
          supabase
            .from('expense_categories')
            .select('*', { count: 'exact' })
            .order('sort_order')
            .order('name')
            .order('id')
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
  });
}

export interface ExpenseCategoryInput {
  key: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

export function useExpenseCategoryMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['expense_categories'] });
    qc.invalidateQueries({ queryKey: ['expense_details'] });
  };
  const create = useMutation({
    mutationFn: async (input: ExpenseCategoryInput) => {
      const { error } = await supabase.from('expense_categories').insert(input);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<ExpenseCategoryInput> }) => {
      const { error } = await supabase
        .from('expense_categories')
        .update(input)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { create, update };
}

// ---- Mileage rates ---------------------------------------------------------
export function useMileageRates() {
  return useQuery({
    queryKey: ['mileage_rates'],
    queryFn: async ({ signal }): Promise<MileageRate[]> =>
      fetchAllRows<MileageRate>(
        (from, to) =>
          supabase
            .from('mileage_rates')
            .select('*', { count: 'exact' })
            .order('effective_date', { ascending: false })
            .order('rate_type')
            .order('id')
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
  });
}

export interface MileageRateInput {
  rate_type: IrsRateType;
  rate_per_mile: number;
  effective_date: string;
}

export function useMileageRateMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['mileage_rates'] });
    qc.invalidateQueries({ queryKey: ['trip_details'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const create = useMutation({
    mutationFn: async (input: MileageRateInput) => {
      const { error } = await supabase.from('mileage_rates').insert(input);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<MileageRateInput> }) => {
      const { error } = await supabase
        .from('mileage_rates')
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
        .from('mileage_rates')
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
