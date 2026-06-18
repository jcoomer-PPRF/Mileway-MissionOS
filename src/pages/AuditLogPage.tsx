import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye } from 'lucide-react';
import { AUDITED_TABLES, useAuditLog } from '@/hooks/useAuditLog';
import { useUserMap } from '@/hooks/useUsers';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { PageLoader } from '@/components/ui/spinner';
import type { AuditAction, AuditLogRow } from '@/types/db';

const ACTION_TONE: Record<AuditAction, BadgeTone> = {
  insert: 'green',
  update: 'blue',
  delete: 'red',
};

export function AuditLogPage() {
  const [table, setTable] = useState<string | 'all'>('all');
  const { data: rows, isLoading } = useAuditLog(table);
  const userMap = useUserMap();
  const [detail, setDetail] = useState<AuditLogRow | null>(null);

  const columns = useMemo<ColumnDef<AuditLogRow>[]>(
    () => [
      { accessorKey: 'changed_at', header: 'When', cell: (c) => formatDateTime(c.getValue<string>()) },
      { accessorKey: 'table_name', header: 'Table' },
      {
        accessorKey: 'action',
        header: 'Action',
        cell: (c) => <Badge tone={ACTION_TONE[c.getValue<AuditAction>()]}>{c.getValue<string>()}</Badge>,
      },
      {
        accessorKey: 'changed_by',
        header: 'By',
        cell: (c) => userMap.get(c.getValue<string>() ?? '') ?? '—',
      },
      {
        accessorKey: 'record_id',
        header: 'Record',
        cell: (c) => <code className="text-xs text-slate-500">{c.getValue<string>().slice(0, 8)}</code>,
      },
      {
        id: 'details',
        header: '',
        enableSorting: false,
        cell: (c) => (
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setDetail(c.row.original)}>
              <Eye className="h-4 w-4" /> Details
            </Button>
          </div>
        ),
      },
    ],
    [userMap],
  );

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Immutable, append-only record of every create, edit, and delete."
      />

      <Card className="mb-4 p-3">
        <Select value={table} onChange={(e) => setTable(e.target.value)} className="w-auto min-w-[14rem]">
          <option value="all">All tables</option>
          {AUDITED_TABLES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Card>

      <Card>
        {isLoading ? (
          <PageLoader />
        ) : (
          <DataTable
            columns={columns}
            data={rows ?? []}
            emptyMessage="No audit entries yet."
            initialSort={[{ id: 'changed_at', desc: true }]}
          />
        )}
      </Card>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Audit entry">
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Info label="Table" value={detail.table_name} />
              <Info label="Action" value={detail.action} />
              <Info label="When" value={formatDateTime(detail.changed_at)} />
              <Info label="By" value={userMap.get(detail.changed_by ?? '') ?? '—'} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <JsonBlock title="Before" data={detail.old_data} />
              <JsonBlock title="After" data={detail.new_data} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="font-medium text-slate-700">{value}</p>
    </div>
  );
}

function JsonBlock({ title, data }: { title: string; data: Record<string, unknown> | null }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{title}</p>
      <pre className="max-h-64 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-600">
        {data ? JSON.stringify(data, null, 2) : '—'}
      </pre>
    </div>
  );
}
