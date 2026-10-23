import { fetchAllRows } from '@/lib/pagination';
import { cleanupAttachment } from '@/lib/attachments';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { DocumentExpiring, DocumentRow, DriverCredential } from '@/types/db';

export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: async ({ signal }): Promise<DocumentRow[]> =>
      fetchAllRows<DocumentRow>(
        (from, to) =>
          supabase
            .from('documents')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .order('id')
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
  });
}

export interface DocumentInput {
  entity_id: string;
  vehicle_id: string | null;
  profile_id: string | null;
  document_type_id: string;
  title: string;
  file_path: string | null;
  issued_date: string | null;
  expiration_date: string | null;
  tags: string[];
  notes: string | null;
}

/**
 * Uploads a file to the private `documents` bucket and returns its path.
 * Person-scoped files go under personal/<profile_id>/ — the storage policies
 * use the saved document row as the authorization source. Prefixes organize
 * uploads; they do not determine who can download a saved attachment.
 */
export async function uploadDocumentFile(
  file: File,
  entityId: string,
  profileId?: string | null,
): Promise<string> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const prefix = profileId ? `personal/${profileId}` : entityId;
  const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('documents').upload(path, file, {
    cacheControl: '0',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export function useDocumentMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['documents'] });
    qc.invalidateQueries({ queryKey: ['documents_expiring'] });
    qc.invalidateQueries({ queryKey: ['driver_credentials'] });
    qc.invalidateQueries({ queryKey: ['audit_log'] });
  };
  const create = useMutation({
    mutationFn: async (input: DocumentInput) => {
      const { error } = await supabase.from('documents').insert(input).select('id').single();
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Partial<DocumentInput> }) => {
      const previous = await supabase.from('documents').select('file_path').eq('id', id).single();
      if (previous.error) throw previous.error;
      const { error } = await supabase
        .from('documents')
        .update(input)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
      if (input.file_path !== undefined && input.file_path !== previous.data.file_path) {
        await cleanupAttachment('documents', previous.data.file_path);
      }
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id)
        .select('file_path')
        .single();
      if (error) throw error;
      await cleanupAttachment('documents', data.file_path);
    },
    onSuccess: invalidate,
  });
  return { create, update, remove };
}

export function useDocumentsExpiring() {
  return useQuery({
    queryKey: ['documents_expiring'],
    queryFn: async ({ signal }): Promise<DocumentExpiring[]> =>
      fetchAllRows<DocumentExpiring>(
        (from, to) =>
          supabase
            .from('v_documents_expiring')
            .select('*', { count: 'exact' })
            .order('expiration_date')
            .order('id')
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
  });
}

export function useDriverCredentials() {
  return useQuery({
    queryKey: ['driver_credentials'],
    queryFn: async ({ signal }): Promise<DriverCredential[]> =>
      fetchAllRows<DriverCredential>(
        (from, to) =>
          supabase
            .from('v_driver_credentials')
            .select('*', { count: 'exact' })
            .order('expiration_date', { nullsFirst: false })
            .order('id')
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
  });
}
