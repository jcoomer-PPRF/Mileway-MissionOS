import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Calculator, Car, Fuel, Gauge, Receipt, Route, TrendingUp } from 'lucide-react';
import { useDashboardData } from '@/hooks/useDashboard';
import { computeDashboard } from '@/lib/metrics';
import { formatCurrency, formatMiles, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/common/PageHeader';
import { EntityFilter } from '@/components/common/EntityFilter';
import { StatCard } from '@/components/common/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { PageLoader } from '@/components/ui/spinner';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [entity, setEntity] = useState<string | 'all'>('all');

  const { trips, expenses } = useDashboardData(year);
  const isLoading = trips.isLoading || expenses.isLoading;

  const isCurrentYear = year === now.getFullYear();
  const monthIdx = isCurrentYear ? now.getMonth() : -1;

  const metrics = useMemo(
    () => computeDashboard(trips.data ?? [], expenses.data ?? [], entity, monthIdx),
    [trips.data, expenses.data, entity, monthIdx],
  );

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) list.push(y);
    return list;
  }, [now]);

  const thisMonthLabel = isCurrentYear ? MONTH_NAMES[monthIdx] : `${year} (n/a)`;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Consolidated view across the Foundation and Operating LLC."
        actions={
          <div className="flex items-center gap-2">
            <EntityFilter value={entity} onChange={setEntity} />
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={`Business miles — ${thisMonthLabel}`}
              value={formatMiles(metrics.businessMilesThisMonth)}
              sub={`YTD: ${formatMiles(metrics.businessMilesYTD)}`}
              icon={Gauge}
              tone="emerald"
            />
            <StatCard
              label="Total miles (YTD)"
              value={formatMiles(metrics.totalMilesYTD)}
              sub={`${formatNumber(metrics.tripCount, 0)} trips`}
              icon={Route}
              tone="blue"
            />
            <StatCard
              label="Est. IRS deduction (YTD)"
              value={formatCurrency(metrics.deductionYTD)}
              sub={`This month: ${formatCurrency(metrics.deductionThisMonth)}`}
              icon={Calculator}
              tone="purple"
            />
            <StatCard
              label="Fuel costs (YTD)"
              value={formatCurrency(metrics.fuelCostsYTD)}
              icon={Fuel}
              tone="amber"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Vehicle costs (YTD)" value={formatCurrency(metrics.vehicleCostsYTD)} icon={Car} tone="slate" />
            <StatCard label="Total expenses (YTD)" value={formatCurrency(metrics.totalExpensesYTD)} icon={Receipt} tone="slate" />
            <StatCard
              label="Net est. deduction − fuel"
              value={formatCurrency(metrics.deductionYTD - metrics.fuelCostsYTD)}
              icon={TrendingUp}
              tone="emerald"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Monthly business miles — {year}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                      <Tooltip
                        formatter={(v: number) => [formatMiles(v), 'Business miles']}
                        contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                      />
                      <Bar dataKey="business_miles" fill="#059669" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Miles by entity (YTD)</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.byEntity.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No trips this year.</p>
                ) : (
                  <ul className="space-y-4">
                    {metrics.byEntity.map((b) => (
                      <li key={b.entity_id}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-700">{b.entity_name}</span>
                          <span className="tabular-nums text-slate-500">{formatMiles(b.total_miles)}</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{
                              width: `${Math.min(100, (b.total_miles / Math.max(1, metrics.byEntity[0].total_miles)) * 100)}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatMiles(b.business_miles)} business · {formatCurrency(b.deduction)} est. deduction
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-slate-400">
            IRS deduction figures are estimates based on the editable mileage rates in Settings. Confirm rates and
            category classifications with your tax advisor.
          </p>
        </div>
      )}
    </div>
  );
}
