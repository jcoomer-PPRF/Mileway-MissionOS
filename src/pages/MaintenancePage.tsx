import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useVehicles } from '@/hooks/useVehicles';
import { useMaintenanceTypes } from '@/hooks/useLookups';
import {
  useMaintenanceDue,
  useMaintenanceRecords,
  useMaintenanceRecordMutations,
  useMaintenanceSchedules,
  useMaintenanceScheduleMutations,
  type MaintenanceRecordInput,
  type MaintenanceScheduleInput,
} from '@/hooks/useMaintenance';
import { cn, formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { PageLoader } from '@/components/ui/spinner';
import { MaintenanceRecordForm } from '@/components/forms/MaintenanceRecordForm';
import { MaintenanceScheduleForm } from '@/components/forms/MaintenanceScheduleForm';
import type { MaintenanceDue, MaintenanceRecord, MaintenanceSchedule } from '@/types/db';

type Tab = 'due' | 'history' | 'schedules';

export function MaintenancePage() {
  const { profile, canWrite, canEditAll } = useAuth();
  const [tab, setTab] = useState<Tab>('due');

  const due = useMaintenanceDue();
  const records = useMaintenanceRecords();
  const schedules = useMaintenanceSchedules();
  const { data: vehicles } = useVehicles();
  const { data: types } = useMaintenanceTypes();

  const recMut = useMaintenanceRecordMutations();
  const schedMut = useMaintenanceScheduleMutations();

  const [recordModal, setRecordModal] = useState(false);
  const [editRecord, setEditRecord] = useState<MaintenanceRecord | null>(null);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [editSchedule, setEditSchedule] = useState<MaintenanceSchedule | null>(null);

  const vehicleLabel = (id: string) => {
    const v = vehicles?.find((x) => x.id === id);
    return v ? [v.year, v.make, v.model].filter(Boolean).join(' ') || v.license_plate || '—' : '—';
  };
  const typeName = (id: string) => types?.find((t) => t.id === id)?.name ?? '—';
  const dueCount = (due.data ?? []).filter((d) => d.is_due).length;

  // ---- Due columns ----
  const dueColumns = useMemo<ColumnDef<MaintenanceDue>[]>(
    () => [
      {
        accessorKey: 'is_due',
        header: 'Status',
        cell: (c) =>
          c.row.original.is_due ? (
            <Badge tone="red">
              <AlertTriangle className="mr-1 h-3 w-3" /> Due
            </Badge>
          ) : (
            <Badge tone="green">
              <CheckCircle2 className="mr-1 h-3 w-3" /> OK
            </Badge>
          ),
      },
      { accessorKey: 'vehicle_label', header: 'Vehicle' },
      { accessorKey: 'maintenance_type_name', header: 'Service' },
      {
        id: 'next_due',
        header: 'Next due',
        cell: (c) => {
          const r = c.row.original;
          const parts: string[] = [];
          if (r.next_due_odometer != null) parts.push(`${formatNumber(r.next_due_odometer, 0)} mi`);
          if (r.next_due_date) parts.push(formatDate(r.next_due_date));
          return parts.join(' · ') || '—';
        },
      },
      {
        id: 'remaining',
        header: 'Remaining',
        cell: (c) => {
          const r = c.row.original;
          const parts: string[] = [];
          if (r.miles_remaining != null) parts.push(`${formatNumber(r.miles_remaining, 0)} mi`);
          if (r.days_remaining != null) parts.push(`${r.days_remaining} d`);
          return <span className={cn('tabular-nums', r.is_due && 'font-medium text-red-600')}>{parts.join(' · ') || '—'}</span>;
        },
      },
    ],
    [],
  );

  // ---- History columns ----
  const recordCanEdit = (r: MaintenanceRecord) => canEditAll || r.created_by === profile?.id;
  const recordColumns = useMemo<ColumnDef<MaintenanceRecord>[]>(
    () => [
      { accessorKey: 'service_date', header: 'Date', cell: (c) => formatDate(c.getValue<string>()) },
      { id: 'vehicle', header: 'Vehicle', cell: (c) => vehicleLabel(c.row.original.vehicle_id) },
      { id: 'type', header: 'Service', cell: (c) => typeName(c.row.original.maintenance_type_id) },
      {
        accessorKey: 'odometer_at_service',
        header: 'Odometer',
        cell: (c) => (c.getValue<number>() != null ? formatNumber(c.getValue<number>(), 0) : '—'),
      },
      {
        accessorKey: 'cost',
        header: 'Cost',
        cell: (c) => (c.getValue<number>() != null ? formatCurrency(c.getValue<number>()) : '—'),
      },
      { accessorKey: 'vendor', header: 'Vendor', cell: (c) => c.getValue<string>() || '—' },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: (c) =>
          recordCanEdit(c.row.original) ? (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" onClick={() => { setEditRecord(c.row.original); setRecordModal(true); }} aria-label="Edit">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  if (window.confirm('Delete this service record?')) await recMut.remove.mutateAsync(c.row.original.id);
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
    [vehicles, types, profile?.id, canEditAll],
  );

  // ---- Schedule columns ----
  const scheduleColumns = useMemo<ColumnDef<MaintenanceSchedule>[]>(
    () => [
      { id: 'vehicle', header: 'Vehicle', cell: (c) => vehicleLabel(c.row.original.vehicle_id) },
      { id: 'type', header: 'Service', cell: (c) => typeName(c.row.original.maintenance_type_id) },
      {
        id: 'interval',
        header: 'Interval',
        cell: (c) => {
          const r = c.row.original;
          const parts: string[] = [];
          if (r.interval_miles != null) parts.push(`${formatNumber(r.interval_miles, 0)} mi`);
          if (r.interval_months != null) parts.push(`${r.interval_months} mo`);
          return parts.join(' / ') || '—';
        },
      },
      {
        id: 'last',
        header: 'Last service',
        cell: (c) => {
          const r = c.row.original;
          const parts: string[] = [];
          if (r.last_service_date) parts.push(formatDate(r.last_service_date));
          if (r.last_service_odometer != null) parts.push(`${formatNumber(r.last_service_odometer, 0)} mi`);
          return parts.join(' · ') || '—';
        },
      },
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
              <Button variant="ghost" size="icon" onClick={() => { setEditSchedule(c.row.original); setScheduleModal(true); }} aria-label="Edit">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  if (window.confirm('Delete this schedule?')) await schedMut.remove.mutateAsync(c.row.original.id);
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
    [vehicles, types, canEditAll],
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'due', label: dueCount > 0 ? `Due (${dueCount})` : 'Due' },
    { id: 'history', label: 'Service history' },
    { id: 'schedules', label: 'Schedules' },
  ];

  return (
    <div>
      <PageHeader
        title="Maintenance"
        subtitle="Service history, schedules, and what's due across the fleet."
        actions={
          tab === 'history' && canWrite ? (
            <Button onClick={() => { setEditRecord(null); setRecordModal(true); }}>
              <Plus className="h-4 w-4" /> Log service
            </Button>
          ) : tab === 'schedules' && canEditAll ? (
            <Button onClick={() => { setEditSchedule(null); setScheduleModal(true); }}>
              <Plus className="h-4 w-4" /> Add schedule
            </Button>
          ) : null
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
        {tab === 'due' &&
          (due.isLoading ? (
            <PageLoader />
          ) : (
            <DataTable
              columns={dueColumns}
              data={due.data ?? []}
              emptyMessage="No active schedules. Add one under Schedules to track what's due."
              initialSort={[{ id: 'is_due', desc: true }]}
            />
          ))}
        {tab === 'history' &&
          (records.isLoading ? (
            <PageLoader />
          ) : (
            <DataTable
              columns={recordColumns}
              data={records.data ?? []}
              emptyMessage="No service records yet."
              initialSort={[{ id: 'service_date', desc: true }]}
            />
          ))}
        {tab === 'schedules' &&
          (schedules.isLoading ? (
            <PageLoader />
          ) : (
            <DataTable columns={scheduleColumns} data={schedules.data ?? []} emptyMessage="No schedules yet." />
          ))}
      </Card>

      <Modal open={recordModal} onClose={() => setRecordModal(false)} title={editRecord ? 'Edit service record' : 'Log service'}>
        <MaintenanceRecordForm
          initial={editRecord ?? undefined}
          onSubmit={async (values: MaintenanceRecordInput) => {
            if (editRecord) await recMut.update.mutateAsync({ id: editRecord.id, input: values });
            else await recMut.create.mutateAsync(values);
            setRecordModal(false);
          }}
          onCancel={() => setRecordModal(false)}
        />
      </Modal>

      <Modal open={scheduleModal} onClose={() => setScheduleModal(false)} title={editSchedule ? 'Edit schedule' : 'Add schedule'}>
        <MaintenanceScheduleForm
          initial={editSchedule ?? undefined}
          onSubmit={async (values: MaintenanceScheduleInput) => {
            if (editSchedule) await schedMut.update.mutateAsync({ id: editSchedule.id, input: values });
            else await schedMut.create.mutateAsync(values);
            setScheduleModal(false);
          }}
          onCancel={() => setScheduleModal(false)}
        />
      </Modal>
    </div>
  );
}
