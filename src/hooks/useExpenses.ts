import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ExpenseDetail } from '@/types/db';

export function useExpenseDetails() {
  return useQuery({
    queryKey: ['expense_details'],
    queryFn: async (): Promise<ExpenseDetail[]> => {
      const { data, error } = await supabase
        .from('v_expense_details')
        .select('*')
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ExpenseDetail[];
    },
  });
}

export interface ExpenseInput {
  entity_id: string;
  vehicle_id: string | null;
  expense_category_id: string;
  amount: number;
  expense_date: string;
  merchant: string | null;
  notes: string | null;
  receipt_path: string | null;
}

/** Uploads a receipt to the private `receipts` bucket and returns its path. */
export async function uploadReceipt(file: File, entityId: string): Promise<string> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const path = `${entityId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('receipts').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function getReceiptUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

export function useExpenseMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['expense_details'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['audit_log'] });
  };
  const create = useMutation({
    mutationFn: async (input: ExpenseInput) => {
      const { error } = await supabase.from('expenses').insert(input);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<ExpenseInput> }) => {
      const { error } = await supabase.from('expenses').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { create, update, remove };
}
