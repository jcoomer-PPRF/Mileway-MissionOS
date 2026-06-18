import { useState, type FormEvent } from 'react';
import { Pencil } from 'lucide-react';
import { useEntities, useEntityMutations } from '@/hooks/useReference';
import { ENTITY_TYPE_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { PageLoader, Spinner } from '@/components/ui/spinner';
import type { Entity } from '@/types/db';

export function EntitiesSettings() {
  const { data: entities, isLoading } = useEntities();
  const { update } = useEntityMutations();
  const [editing, setEditing] = useState<Entity | null>(null);

  if (isLoading) return <PageLoader />;

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Legal name</th>
            <th className="px-4 py-2">EIN</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {(entities ?? []).map((e) => (
            <tr key={e.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-2 font-medium text-slate-800">
                {e.name} {e.is_primary && <Badge tone="green">Primary</Badge>}
              </td>
              <td className="px-4 py-2">{ENTITY_TYPE_LABELS[e.entity_type] ?? e.entity_type}</td>
              <td className="px-4 py-2 text-slate-600">{e.legal_name || '—'}</td>
              <td className="px-4 py-2 text-slate-600">{e.ein || '—'}</td>
              <td className="px-4 py-2 text-right">
                <Button variant="ghost" size="sm" onClick={() => setEditing(e)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <EditEntityModal entity={editing} onClose={() => setEditing(null)} onSave={(input) => update.mutateAsync({ id: editing.id, input })} />
      )}
    </Card>
  );
}

function EditEntityModal({
  entity,
  onClose,
  onSave,
}: {
  entity: Entity;
  onClose: () => void;
  onSave: (input: { name: string; legal_name: string | null; ein: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState(entity.name);
  const [legal, setLegal] = useState(entity.legal_name ?? '');
  const [ein, setEin] = useState(entity.ein ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({ name: name.trim(), legal_name: legal.trim() || null, ein: ein.trim() || null });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${entity.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Display name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Legal name">
          <Input value={legal} onChange={(e) => setLegal(e.target.value)} />
        </Field>
        <Field label="EIN">
          <Input value={ein} onChange={(e) => setEin(e.target.value)} placeholder="00-0000000" />
        </Field>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Spinner className="text-white" />}
            Save
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
