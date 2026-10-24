interface Page<T> {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
}

/** Advance by the actual result length: a hosted API cap may be below 500. */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  signal?: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<unknown>();
  let expectedCount: number | null | undefined;
  while (true) {
    signal?.throwIfAborted();
    const result = await page(rows.length, rows.length + 499);
    signal?.throwIfAborted();
    if (result.error) throw new Error(result.error.message);
    if (expectedCount !== undefined && result.count != null && result.count !== expectedCount) {
      throw new Error('Records changed while loading. Please retry the report.');
    }
    expectedCount = result.count ?? expectedCount;
    const batch = result.data ?? [];
    for (const row of batch) {
      const id = (row as { id?: unknown }).id;
      if (id != null && seen.has(id))
        throw new Error('Records changed while loading. Please retry the report.');
      if (id != null) seen.add(id);
    }
    rows.push(...batch);
    if (result.count != null && rows.length >= result.count) return rows;
    if (batch.length === 0) {
      if (result.count != null && rows.length < result.count) {
        throw new Error('Records changed while loading. Please retry the report.');
      }
      return rows;
    }
  }
}

export interface RecordFilters {
  entity?: string;
  from?: string;
  to?: string;
}
interface Filterable<T> {
  eq(column: string, value: string): T;
  gte(column: string, value: string): T;
  lte(column: string, value: string): T;
}
export function applyRecordFilters<T extends Filterable<T>>(
  query: T,
  filters: RecordFilters,
  dateColumn: string,
): T {
  if (filters.entity && filters.entity !== 'all') query = query.eq('entity_id', filters.entity);
  if (filters.from) query = query.gte(dateColumn, filters.from);
  if (filters.to) query = query.lte(dateColumn, filters.to);
  return query;
}
