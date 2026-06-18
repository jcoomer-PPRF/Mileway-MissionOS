import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getReceiptUrl,
  useExpenseDetails,
  useExpenseMutations,
  type ExpenseInput,
} from '@/hooks/useExpenses';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/common/PageHeader';
import { EntityFilter } from '@/components/common/EntityFilter';
import { EntityBadge } from '@/components/common/EntityBadge';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { PageLoader } from '@/components/ui/spinner';
import { ExpenseForm } from '@/components/forms/ExpenseForm';
import type { ExpenseDetail } from '@/types/db';

export function ExpensesPage() {
  const { profile, canWrite, isAdmin } = useAuth();
  const { data: expenses, isLoading } = useExpenseDetails();
  const { create, update, remove } = useExpenseMutations();

  const [entityFilter, setEntityFilter] = useState<string | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseDetail | null>(null);

  const canEdit = (x: ExpenseDetail) => isAdmin || x.created_by === profile?.id;
  const filtered = useMemo(
    () => (expenses ?? []).filter((x) => entityFilter === 'all' || x.entity_id === entityFilter),
    [expenses, entityFilter],
  );

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(x: ExpenseDetail) {
    setEditing(x);
    setModalOpen(true);
  }
  async function handleSubmit(values: ExpenseInput) {
    if (editing) await update.mutateAsync({ id: editing.id, input: values });
    else await create.mutateAsync(values);
    setModalOpen(false);
  }
  async function handleDelete(x: ExpenseDetail) {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return;
    await remove.mutateAsync(x.id);
  }
  async function viewReceipt(path: string) {
    const url = await getReceiptUrl(path);
    if (url) window.open(url, '_blank');
  }

  const columns = useMemo<ColumnDef<ExpenseDetail>[]>(
    () => [
      { accessorKey: 'expense_date', header: 'Date', cell: (c) => formatDate(c.getValue<string>()) },
      {
        accessorKey: 'entity_name',
        header: 'Entity',
        cell: (c) => <EntityBadge name={c.row.original.entity_name} isPrimary={c.row.original.entity_is_primary} />,
      },
      { accessorKey: 'category_name', header: 'Category' },
      { accessorKey: 'vehicle_label', header: 'Vehicle', cell: (c) => c.getValue<string>() || '—' },
      { accessorKey: 'merchant', header: 'Merchant', cell: (c) => c.getValue<string>() || '—' },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: (c) => <span className="tabular-nums">{formatCurrency(c.getValue<number>())}</span>,
      },
      {
        id: 'receipt',
        header: 'Receipt',
        enableSorting: false,
        cell: (c) =>
          c.row.original.receipt_path ? (
            <Button variant="ghost" size="sm" onClick={() => viewReceipt(c.row.original.receipt_path!)}>
              <FileText className="h-4 w-4" /> View
            </Button>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: (c) =>
          canEdit(c.row.original) ? (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" onClick={() => openEdit(c.row.original)} aria-label="Edit">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(c.row.original)} aria-label="Delete">
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.id, isAdmin],
  );

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Fuel, repairs, maintenance, parking, tolls & supplies."
        actions={
          canWrite && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add expense
            </Button>
          )
        }
      />

      <Card className="mb-4 p-3">
        <EntityFilter value={entityFilter} onChange={setEntityFilter} />
      </Card>

      <Card>
        {isLoading ? (
          <PageLoader />
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            emptyMessage="No expenses yet."
            initialSort={[{ id: 'expense_date', desc: true }]}
          />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit expense' : 'Add expense'}>
        <ExpenseForm
          initial={
            editing
              ? {
                  entity_id: editing.entity_id,
                  expense_category_id: editing.expense_category_id,
                  vehicle_id: editing.vehicle_id,
                  amount: editing.amount,
                  expense_date: editing.expense_date,
                  merchant: editing.merchant,
                  notes: editing.notes,
                  receipt_path: editing.receipt_path,
                }
              : undefined
          }
          onSubmit={handleSubmit}
          onCancel={() => setModalOpen(false)}
        />
      </Modal>
    </div>
  );
}
