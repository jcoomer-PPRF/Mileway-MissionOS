import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Entity, ExpenseCategory, IrsRateType, MileageRate, TripCategory } from '@/types/db';

// ---- Entities --------------------------------------------------------------
export function useEntities() {
  return useQuery({
    queryKey: ['entities'],
    queryFn: async (): Promise<Entity[]> => {
      const { data, error } = await supabase
        .from('entities')
        .select('*')
        .order('is_primary', { ascending: false })
        .order('name');
      if (error) throw error;
      return data as Entity[];
    },
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
      const { error } = await supabase.from('entities').update(input).eq('id', id);
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
    queryFn: async (): Promise<TripCategory[]> => {
      const { data, error } = await supabase
        .from('trip_categories')
        .select('*')
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return data as TripCategory[];
    },
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
      const { error } = await supabase.from('trip_categories').update(input).eq('id', id);
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
    queryFn: async (): Promise<ExpenseCategory[]> => {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return data as ExpenseCategory[];
    },
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
      const { error } = await supabase.from('expense_categories').update(input).eq('id', id);
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
    queryFn: async (): Promise<MileageRate[]> => {
      const { data, error } = await supabase
        .from('mileage_rates')
        .select('*')
        .order('effective_date', { ascending: false })
        .order('rate_type');
      if (error) throw error;
      return data as MileageRate[];
    },
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
      const { error } = await supabase.from('mileage_rates').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('mileage_rates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { create, update, remove };
}
