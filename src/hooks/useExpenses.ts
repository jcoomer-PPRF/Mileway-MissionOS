import { fetchAllRows, applyRecordFilters, type RecordFilters } from '@/lib/pagination';
import { cleanupAttachment } from '@/lib/attachments';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ExpenseDetail } from '@/types/db';

export function useExpenseDetails(filters: RecordFilters = {}) {
  return useQuery({
    queryKey: ['expense_details', filters],
    queryFn: async ({ signal }): Promise<ExpenseDetail[]> =>
      fetchAllRows<ExpenseDetail>(
        (from, to) =>
          applyRecordFilters(
            supabase
              .from('v_expense_details')
              .select('*', { count: 'exact' })
              .order('expense_date', { ascending: false })
              .order('created_at', { ascending: false })
              .order('id'),
            filters,
            'expense_date',
          )
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
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
      const { error } = await supabase.from('expenses').insert(input).select('id').single();
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<ExpenseInput> }) => {
      const previous = await supabase.from('expenses').select('receipt_path').eq('id', id).single();
      if (previous.error) throw previous.error;
      const { error } = await supabase
        .from('expenses')
        .update(input)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
      if (input.receipt_path !== undefined && input.receipt_path !== previous.data.receipt_path) {
        await cleanupAttachment('receipts', previous.data.receipt_path);
      }
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)
        .select('receipt_path')
        .single();
      if (error) throw error;
      await cleanupAttachment('receipts', data.receipt_path);
    },
    onSuccess: invalidate,
  });
  return { create, update, remove };
}
