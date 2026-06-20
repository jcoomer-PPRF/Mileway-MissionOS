import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Sheet } from 'lucide-react';
import { useTripDetails } from '@/hooks/useTrips';
import { useExpenseDetails } from '@/hooks/useExpenses';
import { useVehicles } from '@/hooks/useVehicles';
import { useEntities } from '@/hooks/useReference';
import { useMaintenanceRecords } from '@/hooks/useMaintenance';
import { useMaintenanceTypes } from '@/hooks/useLookups';
import {
  buildEntityMileageSummary,
  buildExpenseReport,
  buildMaintenanceReport,
  buildMileageLog,
  buildVehicleSheet,
  type ReportTable,
} from '@/lib/export/reports';
import { downloadCSV } from '@/lib/export/csv';
import { downloadXLSX } from '@/lib/export/excel';
import { todayISO } from '@/lib/utils';
import { PageHeader } from '@/components/common/PageHeader';
import { EntityFilter } from '@/components/common/EntityFilter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageLoader } from '@/components/ui/spinner';

function inRange(date: string, from: string, to: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export function ReportsPage() {
  const { data: trips, isLoading: l1 } = useTripDetails();
  const { data: expenses, isLoading: l2 } = useExpenseDetails();
  const { data: vehicles, isLoading: l3 } = useVehicles();
  const { data: maintenance, isLoading: l4 } = useMaintenanceRecords();
  const { data: maintenanceTypes } = useMaintenanceTypes();
  const { data: entities } = useEntities();

  const [entity, setEntity] = useState<string | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const stamp = todayISO();
  const isLoading = l1 || l2 || l3 || l4;

  const fTrips = useMemo(
    () =>
      (trips ?? []).filter(
        (t) => (entity === 'all' || t.entity_id === entity) && inRange(t.trip_date, from, to),
      ),
    [trips, entity, from, to],
  );
  const fExpenses = useMemo(
    () =>
      (expenses ?? []).filter(
        (x) => (entity === 'all' || x.entity_id === entity) && inRange(x.expense_date, from, to),
      ),
    [expenses, entity, from, to],
  );
  const fVehicles = useMemo(
    () => (vehicles ?? []).filter((v) => entity === 'all' || v.entity_id === entity),
    [vehicles, entity],
  );
  const scopedEntities = useMemo(
    () => (entity === 'all' ? (entities ?? []) : (entities ?? []).filter((e) => e.id === entity)),
    [entities, entity],
  );

  const fMaintenance = useMemo(
    () =>
      (maintenance ?? []).filter(
        (m) => (entity === 'all' || m.entity_id === entity) && inRange(m.service_date, from, to),
      ),
    [maintenance, entity, from, to],
  );

  const entityName = (id: string) => entities?.find((e) => e.id === id)?.name ?? '';
  const vehicleLabel = (id: string) => {
    const v = vehicles?.find((x) => x.id === id);
    return v ? [v.year, v.make, v.model].filter(Boolean).join(' ') || v.license_plate || '' : '';
  };
  const typeName = (id: string) => maintenanceTypes?.find((t) => t.id === id)?.name ?? '';

  const mileageLog = useMemo(() => buildMileageLog(fTrips), [fTrips]);
  const entitySummary = useMemo(() => buildEntityMileageSummary(fTrips, scopedEntities), [fTrips, scopedEntities]);
  const expenseReport = useMemo(() => buildExpenseReport(fExpenses), [fExpenses]);
  const maintenanceReport = buildMaintenanceReport(fMaintenance, { entityName, vehicleLabel, typeName });

  function exportFullWorkbook() {
    downloadXLSX(`mileway-export-${stamp}.xlsx`, [
      { name: 'Trips', columns: mileageLog.columns, rows: mileageLog.rows },
      { name: 'Vehicles', ...buildVehicleSheet(fVehicles, entityName) },
      { name: 'Expenses', columns: expenseReport.columns, rows: expenseReport.rows },
      { name: 'Maintenance', columns: maintenanceReport.columns, rows: maintenanceReport.rows },
    ]);
  }

  return (
    <div>
      <PageHeader
        title="Reports & export"
        subtitle="IRS mileage log, per-entity mileage, and expenses — CSV or Excel."
        actions={
          <Button onClick={exportFullWorkbook} disabled={isLoading}>
            <FileSpreadsheet className="h-4 w-4" /> Full workbook (Excel)
          </Button>
        }
      />

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <span className="block text-sm font-medium text-slate-700">Entity</span>
            <EntityFilter value={entity} onChange={setEntity} />
          </div>
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          {(from || to) && (
            <Button
              variant="ghost"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
            >
              Clear dates
            </Button>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="space-y-6">
          <ReportSection
            title="IRS-format mileage log"
            table={mileageLog}
            onCSV={() => downloadCSV(`mileway-irs-mileage-log-${stamp}.csv`, mileageLog.rows, mileageLog.columns)}
            onXLSX={() =>
              downloadXLSX(`mileway-irs-mileage-log-${stamp}.xlsx`, [
                { name: 'Mileage Log', columns: mileageLog.columns, rows: mileageLog.rows },
              ])
            }
          />
          <ReportSection
            title="Per-entity mileage summary"
            table={entitySummary}
            onCSV={() => downloadCSV(`mileway-entity-mileage-${stamp}.csv`, entitySummary.rows, entitySummary.columns)}
            onXLSX={() =>
              downloadXLSX(`mileway-entity-mileage-${stamp}.xlsx`, [
                { name: 'Entity Mileage', columns: entitySummary.columns, rows: entitySummary.rows },
              ])
            }
          />
          <ReportSection
            title="Expense report"
            table={expenseReport}
            onCSV={() => downloadCSV(`mileway-expenses-${stamp}.csv`, expenseReport.rows, expenseReport.columns)}
            onXLSX={() =>
              downloadXLSX(`mileway-expenses-${stamp}.xlsx`, [
                { name: 'Expenses', columns: expenseReport.columns, rows: expenseReport.rows },
              ])
            }
          />
          <ReportSection
            title="Maintenance report"
            table={maintenanceReport}
            onCSV={() => downloadCSV(`mileway-maintenance-${stamp}.csv`, maintenanceReport.rows, maintenanceReport.columns)}
            onXLSX={() =>
              downloadXLSX(`mileway-maintenance-${stamp}.xlsx`, [
                { name: 'Maintenance', columns: maintenanceReport.columns, rows: maintenanceReport.rows },
              ])
            }
          />
        </div>
      )}
    </div>
  );
}

function ReportSection({
  title,
  table,
  onCSV,
  onXLSX,
}: {
  title: string;
  table: ReportTable;
  onCSV: () => void;
  onXLSX: () => void;
}) {
  const MAX = 25;
  const rows = table.rows.slice(0, MAX);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onCSV} disabled={table.rows.length === 0}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={onXLSX} disabled={table.rows.length === 0}>
            <Sheet className="h-4 w-4" /> Excel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0 py-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                {table.columns.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={table.columns.length} className="px-3 py-10 text-center text-slate-400">
                    No data for the selected filters.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    {table.columns.map((c) => (
                      <td key={c.key} className="whitespace-nowrap px-3 py-2 text-slate-700">
                        {String(r[c.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {table.rows.length > MAX && (
          <p className="px-3 py-2 text-xs text-slate-400">
            Showing {MAX} of {table.rows.length} rows. Export for the full report.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
