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
import { Link } from 'react-router-dom';
import { Calculator, Car, FileWarning, Fuel, Gauge, Receipt, Route, ShieldAlert, TrendingUp, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useDashboardData } from '@/hooks/useDashboard';
import { useMaintenanceDue } from '@/hooks/useMaintenance';
import { useDocumentsExpiring } from '@/hooks/useDocuments';
import { useVehicles } from '@/hooks/useVehicles';
import { computeDashboard } from '@/lib/metrics';
import { EXPIRATION_WINDOW_DAYS } from '@/lib/constants';
import { daysUntil, formatCurrency, formatDate, formatMiles, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/common/PageHeader';
import { EntityFilter } from '@/components/common/EntityFilter';
import { StatCard } from '@/components/common/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { PageLoader } from '@/components/ui/spinner';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function expiryNote(days: number, date: string): string {
  const when = formatDate(date);
  if (days < 0) return `Expired ${Math.abs(days)}d ago · ${when}`;
  if (days === 0) return `Due today · ${when}`;
  return `In ${days}d · ${when}`;
}

export function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [entity, setEntity] = useState<string | 'all'>('all');

  const { trips, expenses } = useDashboardData(year);
  const maintenanceDue = useMaintenanceDue();
  const docsExpiring = useDocumentsExpiring();
  const { data: vehicles } = useVehicles();
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

  // ---- "Needs attention" surface (respects the entity filter) ----
  const dueItems = (maintenanceDue.data ?? []).filter(
    (d) => d.is_due && (entity === 'all' || d.entity_id === entity),
  );
  const expiringDocs = (docsExpiring.data ?? []).filter(
    (d) => d.days_until_expiration <= EXPIRATION_WINDOW_DAYS && (entity === 'all' || d.entity_id === entity),
  );
  const vehicleAlerts = (vehicles ?? [])
    .filter((v) => entity === 'all' || v.entity_id === entity)
    .flatMap((v) => {
      const label = [v.year, v.make, v.model].filter(Boolean).join(' ') || v.license_plate || 'Vehicle';
      const items: { key: string; primary: string; secondary: string; days: number }[] = [];
      const ins = daysUntil(v.insurance_expiration);
      if (v.insurance_expiration && ins != null && ins <= EXPIRATION_WINDOW_DAYS)
        items.push({ key: v.id + 'i', primary: `${label} — Insurance`, secondary: expiryNote(ins, v.insurance_expiration), days: ins });
      const reg = daysUntil(v.registration_expiration);
      if (v.registration_expiration && reg != null && reg <= EXPIRATION_WINDOW_DAYS)
        items.push({ key: v.id + 'r', primary: `${label} — Registration`, secondary: expiryNote(reg, v.registration_expiration), days: reg });
      return items;
    })
    .sort((a, b) => a.days - b.days);

  const attentionCount = dueItems.length + expiringDocs.length + vehicleAlerts.length;

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

          {attentionCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Needs attention</CardTitle>
                <Badge tone="amber">{attentionCount}</Badge>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 sm:grid-cols-3">
                  <AttentionBlock
                    icon={Wrench}
                    title="Maintenance due"
                    to="/maintenance"
                    count={dueItems.length}
                    items={dueItems.slice(0, 4).map((d) => ({
                      key: d.id,
                      primary: d.vehicle_label,
                      secondary: d.maintenance_type_name,
                    }))}
                  />
                  <AttentionBlock
                    icon={ShieldAlert}
                    title="Vehicle insurance / registration"
                    to="/vehicles"
                    count={vehicleAlerts.length}
                    items={vehicleAlerts.slice(0, 4)}
                  />
                  <AttentionBlock
                    icon={FileWarning}
                    title="Expiring documents"
                    to="/documents"
                    count={expiringDocs.length}
                    items={expiringDocs.slice(0, 4).map((d) => ({
                      key: d.id,
                      primary: d.title,
                      secondary: expiryNote(d.days_until_expiration, d.expiration_date),
                    }))}
                  />
                </div>
              </CardContent>
            </Card>
          )}

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

function AttentionBlock({
  icon: Icon,
  title,
  to,
  count,
  items,
}: {
  icon: LucideIcon;
  title: string;
  to: string;
  count: number;
  items: { key: string; primary: string; secondary: string }[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-medium text-slate-700">{title}</span>
        <Badge tone={count > 0 ? 'amber' : 'gray'}>{count}</Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">None</p>
      ) : (
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.key} className="text-sm leading-tight">
              <span className="text-slate-700">{it.primary}</span>{' '}
              <span className="text-xs text-slate-400">· {it.secondary}</span>
            </li>
          ))}
        </ul>
      )}
      <Link to={to} className="mt-2 inline-block text-xs font-medium text-emerald-700 hover:underline">
        View all →
      </Link>
    </div>
  );
}
