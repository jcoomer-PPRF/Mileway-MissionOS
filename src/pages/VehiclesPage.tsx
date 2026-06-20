import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Car, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEntities } from '@/hooks/useReference';
import { useVehicles, useVehicleMutations, type VehicleInput } from '@/hooks/useVehicles';
import { formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/common/PageHeader';
import { EntityFilter } from '@/components/common/EntityFilter';
import { EntityBadge } from '@/components/common/EntityBadge';
import { ExpirationBadge } from '@/components/common/ExpirationBadge';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { PageLoader } from '@/components/ui/spinner';
import { VehicleForm } from '@/components/forms/VehicleForm';
import type { Entity, Vehicle } from '@/types/db';

export function VehiclesPage() {
  const { profile, canWrite, canEditAll } = useAuth();
  const { data: vehicles, isLoading } = useVehicles();
  const { data: entities } = useEntities();
  const { create, update, remove } = useVehicleMutations();

  const [entityFilter, setEntityFilter] = useState<string | 'all'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);

  const entityMap = useMemo(() => {
    const m = new Map<string, Entity>();
    for (const e of entities ?? []) m.set(e.id, e);
    return m;
  }, [entities]);

  const canEdit = (v: Vehicle) => canEditAll || v.created_by === profile?.id;
  const filtered = useMemo(
    () => (vehicles ?? []).filter((v) => entityFilter === 'all' || v.entity_id === entityFilter),
    [vehicles, entityFilter],
  );

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(v: Vehicle) {
    setEditing(v);
    setModalOpen(true);
  }
  async function handleSubmit(values: VehicleInput) {
    if (editing) await update.mutateAsync({ id: editing.id, input: values });
    else await create.mutateAsync(values);
    setModalOpen(false);
  }
  async function handleDelete(v: Vehicle) {
    if (!window.confirm('Delete this vehicle? Trips and expenses that reference it will block deletion.')) return;
    try {
      await remove.mutateAsync(v.id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not delete vehicle.');
    }
  }

  const columns = useMemo<ColumnDef<Vehicle>[]>(
    () => [
      {
        id: 'vehicle',
        header: 'Vehicle',
        accessorFn: (v) => [v.year, v.make, v.model].filter(Boolean).join(' '),
        cell: (c) => (
          <div className="flex items-center gap-2">
            <Car className="h-4 w-4 text-slate-400" />
            <span className="font-medium text-slate-800">
              {[c.row.original.year, c.row.original.make, c.row.original.model].filter(Boolean).join(' ') || '—'}
            </span>
          </div>
        ),
      },
      {
        id: 'entity',
        header: 'Entity',
        cell: (c) => {
          const e = entityMap.get(c.row.original.entity_id);
          return e ? <EntityBadge name={e.name} isPrimary={e.is_primary} /> : '—';
        },
      },
      { accessorKey: 'license_plate', header: 'Plate', cell: (c) => c.getValue<string>() || '—' },
      {
        accessorKey: 'current_odometer',
        header: 'Odometer',
        cell: (c) => (c.getValue<number>() != null ? formatNumber(c.getValue<number>(), 0) : '—'),
      },
      {
        accessorKey: 'insurance_expiration',
        header: 'Insurance',
        cell: (c) => <ExpirationBadge date={c.getValue<string | null>()} />,
      },
      {
        accessorKey: 'registration_expiration',
        header: 'Registration',
        cell: (c) => <ExpirationBadge date={c.getValue<string | null>()} />,
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: (c) => (c.getValue<boolean>() ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Retired</Badge>),
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
    [entityMap, profile?.id, canEditAll],
  );

  return (
    <div>
      <PageHeader
        title="Vehicles"
        subtitle="VIN, plate, odometer, insurance & registration."
        actions={
          canWrite && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add vehicle
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
          <DataTable columns={columns} data={filtered} emptyMessage="No vehicles yet." />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit vehicle' : 'Add vehicle'}
        className="max-w-3xl"
      >
        <VehicleForm
          initial={editing ?? undefined}
          onSubmit={handleSubmit}
          onCancel={() => setModalOpen(false)}
        />
      </Modal>
    </div>
  );
}
