import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRows } from '../src/lib/pagination.ts';
import { createPrivateQueryClient, discardPrivateQueries } from '../src/lib/queryClient.ts';
import { computeDashboard } from '../src/lib/metrics.ts';
import { toCSV } from '../src/lib/export/csv.ts';
import { synchronizeAccess } from '../supabase/functions/set-user-active/synchronize.ts';

test('complete exports respect actual page sizes even below the requested size', async () => {
  const source = Array.from({ length: 1207 }, (_, id) => ({ id }));
  const offsets: number[] = [];
  const result = await fetchAllRows(async (from, to) => {
    offsets.push(from);
    return {
      data: source.slice(from, Math.min(to + 1, from + 137)),
      count: source.length,
      error: null,
    };
  });
  assert.deepEqual(result, source);
  assert.equal(offsets[1], 137);
});
test('a failed page never returns a partial report', async () => {
  await assert.rejects(
    fetchAllRows(async (from) =>
      from === 0
        ? { data: [{ id: 1 }], count: 2, error: null }
        : { data: null, count: 2, error: { message: 'Disconnected' } },
    ),
    /Disconnected/,
  );
});
test('changed counts, duplicate rows, and missing rows fail explicitly', async () => {
  await assert.rejects(
    fetchAllRows(async (from) => ({ data: [{ id: 1 }], count: from ? 3 : 2, error: null })),
    /Records changed/,
  );
  await assert.rejects(
    fetchAllRows(async () => ({ data: [{ id: 1 }], count: 2, error: null })),
    /Records changed/,
  );
  await assert.rejects(
    fetchAllRows(async (from) => ({ data: from ? [] : [{ id: 1 }], count: 2, error: null })),
    /Records changed/,
  );
});
test('abort cancels report collection', async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(
    fetchAllRows(async () => {
      called = true;
      return { data: [], error: null };
    }, controller.signal),
  );
  assert.equal(called, false);
});
test('a new account cannot observe the previous cache or a late private result', async () => {
  const previous = createPrivateQueryClient();
  previous.setQueryData(['documents'], [{ title: 'Private credential' }]);
  let finish!: (value: unknown[]) => void;
  const pending = previous.fetchQuery({
    queryKey: ['audit_log'],
    queryFn: () =>
      new Promise<unknown[]>((resolve) => {
        finish = resolve;
      }),
  });
  discardPrivateQueries(previous);
  const current = createPrivateQueryClient();
  assert.equal(current.getQueryData(['documents']), undefined);
  finish([{ event: 'private' }]);
  await pending.catch(() => {});
  assert.equal(current.getQueryData(['audit_log']), undefined);
  assert.deepEqual(
    await current.fetchQuery({ queryKey: ['documents'], queryFn: async () => [] }),
    [],
  );
  assert.equal(previous.getQueryCache().getAll().length, 0);
  assert.equal(current.getDefaultOptions().queries?.throwOnError, true);
  current.clear();
});
test('YTD and MTD exclude future trips and expenses', () => {
  const base = { entity_id: 'one', entity_name: 'One', irs_rate_type: 'business' };
  const trips = [
    { ...base, trip_date: '2026-10-01', distance_miles: 10, deduction_amount: 7 },
    { ...base, trip_date: '2026-10-31', distance_miles: 50, deduction_amount: 35 },
    { ...base, trip_date: '2026-12-01', distance_miles: 100, deduction_amount: 70 },
  ];
  const expenses = [
    { entity_id: 'one', expense_date: '2026-10-01', category_key: 'fuel', amount: 12 },
    { entity_id: 'one', expense_date: '2026-12-01', category_key: 'fuel', amount: 100 },
  ];
  const m = computeDashboard(trips as never, expenses as never, 'all', 9, '2026-10-23');
  assert.equal(m.businessMilesYTD, 10);
  assert.equal(m.businessMilesThisMonth, 10);
  assert.equal(m.fuelCostsYTD, 12);
  assert.equal(m.byEntity[0].total_miles, 10);
});
test('CSV neutralizes formula text without turning numeric values into strings', () => {
  const values = ['=1+1', ' +SUM(A1)', '-1+2', '@SUM(A1)', '\t=1+1', 'a,"b"\r\nc', -12];
  const csv = toCSV(
    values.map((value) => ({ value })),
    [{ key: 'value', label: 'Value' }],
  );
  assert.equal(
    csv,
    'Value\n\'=1+1\n\' +SUM(A1)\n\'-1+2\n\'@SUM(A1)\n\'\t=1+1\n"a,""b""\r\nc"\n-12',
  );
});
test('Auth outages leave pending work instead of reactivating an account', async () => {
  const calls: string[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      if (name === 'claim_access_sync')
        return {
          data: [{ profile_id: 'one', desired_active: false, revision: 2, lease_id: 'lease' }],
          error: null,
        };
      assert.equal(args.p_error, 'Auth unavailable');
      return { data: false, error: null };
    },
    auth: { admin: { updateUserById: async () => ({ error: { message: 'Auth unavailable' } }) } },
  };
  assert.equal(await synchronizeAccess(client, 'one'), false);
  assert.deepEqual(calls, ['claim_access_sync', 'finish_access_sync']);
});
test('a newer activation request follows an older leased restriction', async () => {
  let revision = 0;
  const bans: string[] = [];
  const client = {
    rpc: async (name: string) => ({
      data:
        name === 'claim_access_sync'
          ? [{ profile_id: 'one', desired_active: ++revision === 2, revision, lease_id: 'lease' }]
          : revision === 2,
      error: null,
    }),
    auth: {
      admin: {
        updateUserById: async (_id: string, args: { ban_duration: string }) => {
          bans.push(args.ban_duration);
          return { error: null };
        },
      },
    },
  };
  assert.equal(await synchronizeAccess(client, 'one'), true);
  assert.deepEqual(bans, ['876000h', 'none']);
});
test('a held lease does not launch another Auth update', async () => {
  let called = false;
  const client = {
    rpc: async () => ({ data: [], error: null }),
    auth: {
      admin: {
        updateUserById: async () => {
          called = true;
          return { error: null };
        },
      },
    },
  };
  assert.equal(await synchronizeAccess(client, 'one'), false);
  assert.equal(called, false);
});
