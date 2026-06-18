import { useState, type FormEvent } from 'react';
import { Pencil, Plus } from 'lucide-react';
import {
  useExpenseCategories,
  useExpenseCategoryMutations,
  type ExpenseCategoryInput,
} from '@/hooks/useReference';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { PageLoader, Spinner } from '@/components/ui/spinner';
import type { ExpenseCategory } from '@/types/db';

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export function ExpenseCategoriesSettings() {
  const { data: categories, isLoading } = useExpenseCategories();
  const { create, update } = useExpenseCategoryMutations();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(c: ExpenseCategory) {
    setEditing(c);
    setOpen(true);
  }
  async function save(input: ExpenseCategoryInput) {
    if (editing) await update.mutateAsync({ id: editing.id, input });
    else await create.mutateAsync(input);
    setOpen(false);
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Expense categories</CardTitle>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4" /> Add category
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
            {(categories ?? []).map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800">{c.name}</td>
                <td className="px-4 py-2">
                  <code className="text-xs text-slate-500">{c.key}</code>
                </td>
                <td className="px-4 py-2">
                  {c.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open && (
        <CategoryModal
          editing={editing}
          nextSort={(categories?.length ?? 0) + 1}
          onClose={() => setOpen(false)}
          onSave={save}
        />
      )}
    </Card>
  );
}

function CategoryModal({
  editing,
  nextSort,
  onClose,
  onSave,
}: {
  editing: ExpenseCategory | null;
  nextSort: number;
  onClose: () => void;
  onSave: (input: ExpenseCategoryInput) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [key, setKey] = useState(editing?.key ?? '');
  const [active, setActive] = useState(editing?.is_active ?? true);
  const [sort, setSort] = useState(String(editing?.sort_order ?? nextSort));
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        key: (key.trim() || slugify(name)) as string,
        is_active: active,
        sort_order: Number(sort) || 0,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit category' : 'Add category'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" required>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!editing && !key) setKey(slugify(e.target.value));
            }}
            required
          />
        </Field>
        <Field label="Key" hint="Stable identifier used by reports (e.g. fuel). Avoid changing once in use." required>
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
