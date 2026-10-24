import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/pagination';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { ALL_ROLES } from '@/hooks/useUsers';
import { ROLE_LABELS } from '@/lib/constants';
import type { UserRole } from '@/types/db';

interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  expires_at: string;
  accepted_at: string | null;
}
export function InvitationsSettings() {
  const qc = useQueryClient();
  const invitations = useQuery({
    queryKey: ['user_invitations'],
    queryFn: ({ signal }) =>
      fetchAllRows<Invitation>(
        (from, to) =>
          supabase
            .from('user_invitations')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .order('id')
            .range(from, to)
            .abortSignal(signal),
        signal,
      ),
  });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('contributor');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (revoke?: string) => {
      const result = revoke
        ? await supabase.from('user_invitations').delete().eq('id', revoke).select('id').single()
        : await supabase
            .from('user_invitations')
            .insert({ email: email.trim().toLowerCase(), role });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['user_invitations'] });
    },
  });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await mutation.mutateAsync(undefined);
      setEmail('');
    } catch {
      setError(
        'Could not add this invitation. Revoke an expired invitation before adding it again.',
      );
    }
  }
  return (
    <Card>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          Allow someone to create an account using this email within seven days. Share the app link
          with them; this action does not send email.
        </p>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <Field label="Email" required>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Button disabled={mutation.isPending}>Allow signup</Button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <ul className="divide-y divide-slate-100">
          {(invitations.data ?? []).map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
            >
              <span>
                {i.email} · {ROLE_LABELS[i.role]} ·{' '}
                {i.accepted_at ? 'Accepted' : `Expires ${formatDate(i.expires_at)}`}
              </span>
              {!i.accepted_at && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={async () => {
                    setError(null);
                    try {
                      await mutation.mutateAsync(i.id);
                    } catch {
                      setError('Could not revoke the invitation. Please retry.');
                    }
                  }}
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
