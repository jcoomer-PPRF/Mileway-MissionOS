import * as XLSX from 'xlsx';
import { triggerDownload, type ColumnSpec } from './csv';

export interface SheetSpec {
  name: string;
  columns: ColumnSpec[];
  rows: Record<string, unknown>[];
}

/** Writes a multi-tab .xlsx workbook (e.g. Trips / Vehicles / Expenses). */
export function downloadXLSX(filename: string, sheets: SheetSpec[]): void {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const aoa: unknown[][] = [
      sheet.columns.map((c) => c.label),
      ...sheet.rows.map((r) => sheet.columns.map((c) => r[c.key] ?? '')),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = sheet.columns.map((c) => ({ wch: Math.max(12, c.label.length + 2) }));
    // Sheet names are capped at 31 chars and can't contain certain symbols.
    const safeName = sheet.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  triggerDownload(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    filename,
  );
}
