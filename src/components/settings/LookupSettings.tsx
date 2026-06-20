import { useState, type FormEvent } from 'react';
import { Pencil, Plus } from 'lucide-react';
import {
  useDocumentTypes,
  useDocumentTypeMutations,
  useJobTitles,
  useJobTitleMutations,
  useLocationTypes,
  useLocationTypeMutations,
  useMaintenanceTypes,
  useMaintenanceTypeMutations,
  type KeyedLookupInput,
} from '@/hooks/useLookups';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { PageLoader, Spinner } from '@/components/ui/spinner';

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

interface LookupRow {
  id: string;
  key?: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Generic keyed lookup (key + name)
// ---------------------------------------------------------------------------
function KeyedLookupSettings({
  title,
  items,
  isLoading,
  onSave,
}: {
  title: string;
  items: LookupRow[] | undefined;
  isLoading: boolean;
  onSave: (id: string | null, input: KeyedLookupInput) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LookupRow | null>(null);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </CardHeader>
      {isLoading ? (
        <PageLoader />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Key</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800">{c.name}</td>
                <td className="px-4 py-2"><code className="text-xs text-slate-500">{c.key}</code></td>
                <td className="px-4 py-2">{c.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}</td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(c); setOpen(true); }}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && (
        <KeyedModal
          editing={editing}
          nextSort={(items?.length ?? 0) + 1}
          onClose={() => setOpen(false)}
          onSave={async (input) => {
            await onSave(editing?.id ?? null, input);
            setOpen(false);
          }}
        />
      )}
    </Card>
  );
}

function KeyedModal({
  editing,
  nextSort,
  onClose,
  onSave,
}: {
  editing: LookupRow | null;
  nextSort: number;
  onClose: () => void;
  onSave: (input: KeyedLookupInput) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [key, setKey] = useState(editing?.key ?? '');
  const [sort, setSort] = useState(String(editing?.sort_order ?? nextSort));
  const [active, setActive] = useState(editing?.is_active ?? true);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({ name: name.trim(), key: (key.trim() || slugify(name)), sort_order: Number(sort) || 0, is_active: active });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit' : 'Add'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" required>
          <Input value={name} onChange={(e) => { setName(e.target.value); if (!editing && !key) setKey(slugify(e.target.value)); }} required />
        </Field>
        <Field label="Key" required hint="Stable identifier; avoid changing once in use.">
          <Input value={key} onChange={(e) => setKey(slugify(e.target.value))} required disabled={!!editing} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Sort order">
            <Input type="number" value={sort} onChange={(e) => setSort(e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={active ? 'active' : 'inactive'} onChange={(e) => setActive(e.target.value === 'active')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy && <Spinner className="text-white" />}Save</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Wrappers
// ---------------------------------------------------------------------------
export function LocationTypesSettings() {
  const { data, isLoading } = useLocationTypes();
  const { create, update } = useLocationTypeMutations();
  return (
    <KeyedLookupSettings
      title="Location types"
      items={data}
      isLoading={isLoading}
      onSave={(id, input) => (id ? update.mutateAsync({ id, input }) : create.mutateAsync(input))}
    />
  );
}

export function MaintenanceTypesSettings() {
  const { data, isLoading } = useMaintenanceTypes();
  const { create, update } = useMaintenanceTypeMutations();
  return (
    <KeyedLookupSettings
      title="Maintenance types"
      items={data}
      isLoading={isLoading}
      onSave={(id, input) => (id ? update.mutateAsync({ id, input }) : create.mutateAsync(input))}
    />
  );
}

export function DocumentTypesSettings() {
  const { data, isLoading } = useDocumentTypes();
  const { create, update } = useDocumentTypeMutations();
  return (
    <KeyedLookupSettings
      title="Document types"
      items={data}
      isLoading={isLoading}
      onSave={(id, input) => (id ? update.mutateAsync({ id, input }) : create.mutateAsync(input))}
    />
  );
}

// ---------------------------------------------------------------------------
// Job titles (name only)
// ---------------------------------------------------------------------------
export function JobTitlesSettings() {
  const { data, isLoading } = useJobTitles();
  const { create, update } = useJobTitleMutations();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LookupRow | null>(null);

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Job titles</CardTitle>
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </CardHeader>
      {isLoading ? (
        <PageLoader />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800">{c.name}</td>
                <td className="px-4 py-2">{c.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}</td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(c); setOpen(true); }}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="px-4 py-3 text-xs text-slate-400">Job titles are for display/reporting only and do not affect permissions.</p>
      {open && (
        <NamedModal
          editing={editing}
          nextSort={(data?.length ?? 0) + 1}
          onClose={() => setOpen(false)}
          onSave={async (input) => {
            if (editing) await update.mutateAsync({ id: editing.id, input });
            else await create.mutateAsync(input);
            setOpen(false);
          }}
        />
      )}
    </Card>
  );
}

function NamedModal({
  editing,
  nextSort,
  onClose,
  onSave,
}: {
  editing: LookupRow | null;
  nextSort: number;
  onClose: () => void;
  onSave: (input: { name: string; sort_order: number; is_active: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [sort, setSort] = useState(String(editing?.sort_order ?? nextSort));
  const [active, setActive] = useState(editing?.is_active ?? true);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({ name: name.trim(), sort_order: Number(sort) || 0, is_active: active });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit job title' : 'Add job title'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Sort order">
            <Input type="number" value={sort} onChange={(e) => setSort(e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={active ? 'active' : 'inactive'} onChange={(e) => setActive(e.target.value === 'active')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy && <Spinner className="text-white" />}Save</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
