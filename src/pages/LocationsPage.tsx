import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEntities, useTripCategories } from '@/hooks/useReference';
import { useLocationTypes } from '@/hooks/useLookups';
import { useSavedLocations, useSavedLocationMutations, type SavedLocationInput } from '@/hooks/useLocations';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { PageLoader } from '@/components/ui/spinner';
import { SavedLocationForm } from '@/components/forms/SavedLocationForm';
import type { SavedLocation } from '@/types/db';

export function LocationsPage() {
  const { canEditAll } = useAuth();
  const { data: locations, isLoading } = useSavedLocations();
  const { data: entities } = useEntities();
  const { data: types } = useLocationTypes();
  const { data: categories } = useTripCategories();
  const { create, update, remove } = useSavedLocationMutations();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SavedLocation | null>(null);

  const entityName = (id: string | null) => (id ? entities?.find((e) => e.id === id)?.name ?? '—' : null);
  const typeName = (id: string | null) => (id ? types?.find((t) => t.id === id)?.name ?? '—' : '—');
  const categoryName = (id: string | null) => (id ? categories?.find((c) => c.id === id)?.name ?? '—' : '—');

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(l: SavedLocation) {
    setEditing(l);
    setModalOpen(true);
  }
  async function handleSubmit(values: SavedLocationInput) {
    if (editing) await update.mutateAsync({ id: editing.id, input: values });
    else await create.mutateAsync(values);
    setModalOpen(false);
  }
  async function handleDelete(l: SavedLocation) {
    if (!window.confirm('Delete this saved location? Trips referencing it will block deletion.')) return;
    try {
      await remove.mutateAsync(l.id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not delete location.');
    }
  }

  const columns = useMemo<ColumnDef<SavedLocation>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: (c) => (
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-slate-400" />
            <span className="font-medium text-slate-800">{c.getValue<string>()}</span>
          </div>
        ),
      },
      { id: 'type', header: 'Type', cell: (c) => typeName(c.row.original.location_type_id) },
      {
        id: 'entity',
        header: 'Entity',
        cell: (c) => {
          const n = entityName(c.row.original.entity_id);
          return n ? <Badge tone="blue">{n}</Badge> : <Badge tone="purple">Shared</Badge>;
        },
      },
      {
        id: 'coords',
        header: 'Coordinates',
        cell: (c) => (
          <span className="tabular-nums text-xs text-slate-500">
            {c.row.original.latitude.toFixed(5)}, {c.row.original.longitude.toFixed(5)}
          </span>
        ),
      },
      { accessorKey: 'radius_meters', header: 'Radius (m)' },
      { id: 'category', header: 'Default category', cell: (c) => categoryName(c.row.original.default_trip_category_id) },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: (c) => (c.getValue<boolean>() ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: (c) =>
          canEditAll ? (
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
    [entities, types, categories, canEditAll],
  );

  return (
    <div>
      <PageHeader
        title="Locations"
        subtitle="Saved locations (geofences) drive destination recognition and trip auto-categorization."
        actions={
          canEditAll && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add location
            </Button>
          )
        }
      />

      <Card>
        {isLoading ? (
          <PageLoader />
        ) : (
          <DataTable columns={columns} data={locations ?? []} emptyMessage="No saved locations yet." />
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit location' : 'Add location'}
        className="max-w-3xl"
      >
        <SavedLocationForm initial={editing ?? undefined} onSubmit={handleSubmit} onCancel={() => setModalOpen(false)} />
      </Modal>
    </div>
  );
}
