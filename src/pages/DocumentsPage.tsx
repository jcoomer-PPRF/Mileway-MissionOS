import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEntities } from '@/hooks/useReference';
import { useVehicles } from '@/hooks/useVehicles';
import { useUsers } from '@/hooks/useUsers';
import { useDocumentTypes } from '@/hooks/useLookups';
import {
  getDocumentUrl,
  useDocuments,
  useDocumentMutations,
  useDocumentsExpiring,
  useDriverCredentials,
  type DocumentInput,
} from '@/hooks/useDocuments';
import { EXPIRATION_WINDOW_DAYS } from '@/lib/constants';
import { cn, formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { EntityBadge } from '@/components/common/EntityBadge';
import { ExpirationBadge } from '@/components/common/ExpirationBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { PageLoader } from '@/components/ui/spinner';
import { DocumentForm } from '@/components/forms/DocumentForm';
import type { DocumentExpiring, DocumentRow, DriverCredential, Entity } from '@/types/db';

type Tab = 'all' | 'expiring' | 'credentials';

async function openFile(path: string | null) {
  if (!path) return;
  const url = await getDocumentUrl(path);
  if (url) window.open(url, '_blank');
}

export function DocumentsPage() {
  const { profile, canWrite, canEditAll } = useAuth();
  const [tab, setTab] = useState<Tab>('all');

  const docs = useDocuments();
  const expiring = useDocumentsExpiring();
  const credentials = useDriverCredentials();
  const { data: types } = useDocumentTypes();
  const { data: entities } = useEntities();
  const { data: vehicles } = useVehicles();
  const { data: users } = useUsers();
  const { create, update, remove } = useDocumentMutations();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DocumentRow | null>(null);

  const entityMap = useMemo(() => {
    const m = new Map<string, Entity>();
    for (const e of entities ?? []) m.set(e.id, e);
    return m;
  }, [entities]);
  const typeName = (id: string) => types?.find((t) => t.id === id)?.name ?? '—';
  const vehicleLabel = (id: string | null) => {
    if (!id) return null;
    const v = vehicles?.find((x) => x.id === id);
    return v ? [v.year, v.make, v.model].filter(Boolean).join(' ') || v.license_plate || 'Vehicle' : 'Vehicle';
  };
  const personName = (id: string | null) => {
    if (!id) return null;
    const u = users?.find((x) => x.id === id);
    return u ? u.full_name || u.email : 'Person';
  };
  const scopeBadge = (d: DocumentRow) => {
    if (d.profile_id) return <Badge tone="amber">Driver: {personName(d.profile_id)}</Badge>;
    if (d.vehicle_id) return <Badge tone="blue">Vehicle: {vehicleLabel(d.vehicle_id)}</Badge>;
    return <Badge tone="purple">Organization</Badge>;
  };

  const canEdit = (d: DocumentRow) => canEditAll || d.created_by === profile?.id;
  const windowExpiring = (expiring.data ?? []).filter((d) => d.days_until_expiration <= EXPIRATION_WINDOW_DAYS);

  // ---- All documents ----
  const docColumns = useMemo<ColumnDef<DocumentRow>[]>(
    () => [
      { accessorKey: 'title', header: 'Title', cell: (c) => <span className="font-medium text-slate-800">{c.getValue<string>()}</span> },
      { id: 'type', header: 'Type', cell: (c) => typeName(c.row.original.document_type_id) },
      { id: 'scope', header: 'Attached to', enableSorting: false, cell: (c) => scopeBadge(c.row.original) },
      {
        id: 'entity',
        header: 'Entity',
        cell: (c) => {
          const e = entityMap.get(c.row.original.entity_id);
          return e ? <EntityBadge name={e.name} isPrimary={e.is_primary} /> : '—';
        },
      },
      { accessorKey: 'expiration_date', header: 'Expires', cell: (c) => <ExpirationBadge date={c.getValue<string | null>()} /> },
      {
        id: 'file',
        header: 'File',
        enableSorting: false,
        cell: (c) =>
          c.row.original.file_path ? (
            <Button variant="ghost" size="sm" onClick={() => openFile(c.row.original.file_path)}>
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
              <Button variant="ghost" size="icon" onClick={() => { setEditing(c.row.original); setModalOpen(true); }} aria-label="Edit">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  if (window.confirm('Delete this document?')) await remove.mutateAsync(c.row.original.id);
                }}
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [types, entities, vehicles, users, profile?.id, canEditAll],
  );

  // ---- Expiring ----
  const expiringColumns = useMemo<ColumnDef<DocumentExpiring>[]>(
    () => [
      { accessorKey: 'title', header: 'Title' },
      { accessorKey: 'document_type_name', header: 'Type' },
      {
        id: 'scope',
        header: 'Attached to',
        cell: (c) =>
          c.row.original.profile_name
            ? `Driver: ${c.row.original.profile_name}`
            : c.row.original.vehicle_label
              ? `Vehicle: ${c.row.original.vehicle_label}`
              : 'Organization',
      },
      { accessorKey: 'expiration_date', header: 'Expires', cell: (c) => <ExpirationBadge date={c.getValue<string>()} /> },
      {
        accessorKey: 'days_until_expiration',
        header: 'Days',
        cell: (c) => {
          const d = c.getValue<number>();
          return <span className={cn('tabular-nums', d < 0 ? 'text-red-600' : d <= 14 ? 'text-amber-600' : 'text-slate-500')}>{d}</span>;
        },
      },
    ],
    [],
  );

  // ---- Driver credentials ----
  const credColumns = useMemo<ColumnDef<DriverCredential>[]>(
    () => [
      { id: 'person', header: 'Person', accessorFn: (r) => r.profile_name || r.profile_email },
      { accessorKey: 'document_type_name', header: 'Credential' },
      { accessorKey: 'title', header: 'Title' },
      { accessorKey: 'issued_date', header: 'Issued', cell: (c) => formatDate(c.getValue<string | null>()) },
      { accessorKey: 'expiration_date', header: 'Expires', cell: (c) => <ExpirationBadge date={c.getValue<string | null>()} /> },
      {
        id: 'file',
        header: 'File',
        enableSorting: false,
        cell: (c) =>
          c.row.original.file_path ? (
            <Button variant="ghost" size="sm" onClick={() => openFile(c.row.original.file_path)}>
              <FileText className="h-4 w-4" /> View
            </Button>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
    ],
    [],
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'all', label: 'All documents' },
    { id: 'expiring', label: windowExpiring.length > 0 ? `Expiring (${windowExpiring.length})` : 'Expiring' },
    { id: 'credentials', label: 'Driver credentials' },
  ];

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle="Organization, vehicle, and driver-credential files with expiration tracking."
        actions={
          canWrite && (
            <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
              <Plus className="h-4 w-4" /> Add document
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === t.id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card>
        {tab === 'all' &&
          (docs.isLoading ? <PageLoader /> : <DataTable columns={docColumns} data={docs.data ?? []} emptyMessage="No documents yet." />)}
        {tab === 'expiring' &&
          (expiring.isLoading ? (
            <PageLoader />
          ) : (
            <DataTable
              columns={expiringColumns}
              data={windowExpiring}
              emptyMessage={`Nothing expiring within ${EXPIRATION_WINDOW_DAYS} days.`}
              initialSort={[{ id: 'days_until_expiration', desc: false }]}
            />
          ))}
        {tab === 'credentials' &&
          (credentials.isLoading ? (
            <PageLoader />
          ) : (
            <DataTable columns={credColumns} data={credentials.data ?? []} emptyMessage="No driver credentials on file." />
          ))}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit document' : 'Add document'}
        className="max-w-3xl"
      >
        <DocumentForm
          initial={
            editing
              ? {
                  entity_id: editing.entity_id,
                  vehicle_id: editing.vehicle_id,
                  profile_id: editing.profile_id,
                  document_type_id: editing.document_type_id,
                  title: editing.title,
                  file_path: editing.file_path,
                  issued_date: editing.issued_date,
                  expiration_date: editing.expiration_date,
                  tags: editing.tags,
                  notes: editing.notes,
                }
              : undefined
          }
          onSubmit={async (values: DocumentInput) => {
            if (editing) await update.mutateAsync({ id: editing.id, input: values });
            else await create.mutateAsync(values);
            setModalOpen(false);
          }}
          onCancel={() => setModalOpen(false)}
        />
      </Modal>
    </div>
  );
}
