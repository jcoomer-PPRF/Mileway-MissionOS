import { useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DataTableProps<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  data: T[];
  emptyMessage?: string;
  initialSort?: SortingState;
}

export function DataTable<T>({
  columns,
  data,
  emptyMessage = 'No records yet.',
  initialSort = [],
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              {hg.headers.map((h) => (
                <th key={h.id} className="whitespace-nowrap px-3 py-2 font-medium">
                  {h.isPlaceholder ? null : (
                    <button
                      type="button"
                      className={cn('inline-flex items-center gap-1', h.column.getCanSort() && 'cursor-pointer select-none hover:text-slate-700')}
                      onClick={h.column.getToggleSortingHandler()}
                      disabled={!h.column.getCanSort()}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getCanSort() && <ArrowUpDown className="h-3 w-3 opacity-50" />}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-12 text-center text-slate-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 align-middle text-slate-700">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
