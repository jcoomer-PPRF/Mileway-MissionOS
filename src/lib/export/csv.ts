export interface ColumnSpec {
  key: string;
  label: string;
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  // Keep real numbers numeric; user-controlled text must not become a formula
  // when a report is opened by Excel or another spreadsheet application.
  const safe = typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCSV(rows: Record<string, unknown>[], columns: ColumnSpec[]): string {
  const head = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => escapeCell(r[c.key])).join(',')).join('\n');
  return `${head}\n${body}`;
}

export function downloadCSV(
  filename: string,
  rows: Record<string, unknown>[],
  columns: ColumnSpec[],
): void {
  const csv = toCSV(rows, columns);
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
}
