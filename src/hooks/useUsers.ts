import { fetchAllRows } from '@/lib/pagination';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types/db';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async ({ signal }): Promise<Profile[]> =>
      fetchAllRows<Profile>(
        (from, to) =>
          supabase
            .from('profiles')
            .select('*', { count: 'exact' })
            .order('full_name')
            .order('id')
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
  });
}

/** Map of user id → display name, for resolving created_by/changed_by. */
export function useUserMap() {
  const { data } = useUsers();
  const map = new Map<string, string>();
  for (const u of data ?? []) map.set(u.id, u.full_name || u.email);
  return map;
}

export function useUserMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['users'] });
    void qc.invalidateQueries({ queryKey: ['auth_access_sync'] });
  };
  const update = useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: Partial<Pick<Profile, 'role' | 'default_entity_id' | 'full_name' | 'job_title_id'>> & {
        is_active: boolean;
      };
    }) => {
      const { is_active, ...fields } = input;
      return saveAccount(id, is_active, fields);
    },
    onSettled: invalidate,
  });
  const retrySync = useMutation({
    mutationFn: async (id: string) => {
      return saveAccount(id, undefined, {}, true);
    },
    onSettled: invalidate,
  });
  return { update, retrySync };
}

async function saveAccount(
  id: string,
  active?: boolean,
  fields: Record<string, unknown> = {},
  retry = false,
): Promise<{ pending: boolean }> {
  const { data, error } = await supabase.functions.invoke('set-user-active', {
    body: { user_id: id, active, fields, retry },
  });
  if (error) {
    let message = error.message;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body?.error) message = body.error;
    } catch {
      // keep the default message
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return { pending: Boolean(data?.pending) };
}

export interface AccessSync {
  profile_id: string;
  desired_active: boolean;
  revision: number;
  synced_revision: number;
}
export function useAccessSync() {
  return useQuery({
    queryKey: ['auth_access_sync'],
    queryFn: async ({ signal }) =>
      fetchAllRows<AccessSync>(
        (from, to) =>
          supabase
            .from('auth_access_sync')
            .select('*', { count: 'exact' })
            .order('profile_id')
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
  });
}

export const ALL_ROLES: UserRole[] = ['owner', 'manager', 'contributor', 'accountant', 'auditor'];
