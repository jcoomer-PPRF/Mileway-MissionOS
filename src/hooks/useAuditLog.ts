import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AuditLogRow } from '@/types/db';

export function useAuditLog(tableName: string | 'all', limit = 200) {
  return useQuery({
    queryKey: ['audit_log', tableName, limit],
    queryFn: async (): Promise<AuditLogRow[]> => {
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(limit);
      if (tableName !== 'all') query = query.eq('table_name', tableName);
      const { data, error } = await query;
      if (error) throw error;
      return data as AuditLogRow[];
    },
  });
}

export const AUDITED_TABLES = [
  'trips',
  'expenses',
  'vehicles',
  'entities',
  'trip_categories',
  'expense_categories',
  'mileage_rates',
  'profiles',
];
