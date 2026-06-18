import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTripDetails, useTripMutations, type TripInput } from '@/hooks/useTrips';
import { formatCurrency, formatDate, formatMiles } from '@/lib/utils';
import { RATE_TYPE_LABELS } from '@/lib/constants';
import { PageHeader } from '@/components/common/PageHeader';
import { EntityFilter } from '@/components/common/EntityFilter';
import { EntityBadge } from '@/components/common/EntityBadge';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { PageLoader } from '@/components/ui/spinner';
import { TripForm } from '@/components/forms/TripForm';
import type { TripDetail } from '@/types/db';

export function TripsPage() {
  const { profile, canWrite, isAdmin } = useAuth();
  const { data: trips, isLoading } = useTripDetails();
  const { create, update, remove } = useTripMutations();

  const [entityFilter, setEntityFilter] = useState<string | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TripDetail | null>(null);

  const canEdit = (t: TripDetail) => isAdmin || t.created_by === profile?.id;

  const filtered = useMemo(
    () => (trips ?? []).filter((t) => entityFilter === 'all' || t.entity_id === entityFilter),
    [trips, entityFilter],
  );

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(t: TripDetail) {
    setEditing(t);
    setModalOpen(true);
  }
  async function handleSubmit(values: TripInput) {
    if (editing) await update.mutateAsync({ id: editing.id, input: values });
    else await create.mutateAsync(values);
    setModalOpen(false);
  }
  async function handleDelete(t: TripDetail) {
    if (!window.confirm('Delete this trip? This cannot be undone.')) return;
    await remove.mutateAsync(t.id);
  }

  const columns = useMemo<ColumnDef<TripDetail>[]>(
    () => [
      { accessorKey: 'trip_date', header: 'Date', cell: (c) => formatDate(c.getValue<string>()) },
      {
        accessorKey: 'entity_name',
        header: 'Entity',
        cell: (c) => <EntityBadge name={c.row.original.entity_name} isPrimary={c.row.original.entity_is_primary} />,
      },
      { accessorKey: 'vehicle_label', header: 'Vehicle' },
      {
        accessorKey: 'category_name',
        header: 'Category',
        cell: (c) => (
          <div className="flex items-center gap-2">
            <span>{c.row.original.category_name}</span>
            <Badge tone="gray">{RATE_TYPE_LABELS[c.row.original.irs_rate_type]}</Badge>
          </div>
        ),
      },
      {
        accessorKey: 'distance_miles',
        header: 'Miles',
        cell: (c) => <span className="tabular-nums">{formatMiles(c.getValue<number>())}</span>,
      },
      {
        accessorKey: 'deduction_amount',
        header: 'Est. deduction',
        cell: (c) => <span className="tabular-nums">{formatCurrency(c.getValue<number>())}</span>,
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
        title="Trips"
        subtitle="Manual mileage log — no GPS."
        actions={
          canWrite && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Log trip
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
            emptyMessage="No trips logged yet."
            initialSort={[{ id: 'trip_date', desc: true }]}
          />
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit trip' : 'Log trip'}>
        <TripForm
          initial={
            editing
              ? {
                  entity_id: editing.entity_id,
                  vehicle_id: editing.vehicle_id,
                  category_id: editing.category_id,
                  trip_date: editing.trip_date,
                  distance_source: editing.distance_source,
                  odometer_start: editing.odometer_start,
                  odometer_end: editing.odometer_end,
                  distance_miles: editing.distance_miles,
                  destination: editing.destination,
                  notes: editing.notes,
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
