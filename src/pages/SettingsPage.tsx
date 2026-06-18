import { useState } from 'react';
import { PageHeader } from '@/components/common/PageHeader';
import { cn } from '@/lib/utils';
import { EntitiesSettings } from '@/components/settings/EntitiesSettings';
import { TripCategoriesSettings } from '@/components/settings/TripCategoriesSettings';
import { ExpenseCategoriesSettings } from '@/components/settings/ExpenseCategoriesSettings';
import { MileageRatesSettings } from '@/components/settings/MileageRatesSettings';
import { UsersSettings } from '@/components/settings/UsersSettings';

const TABS = [
  { id: 'entities', label: 'Entities' },
  { id: 'trip_categories', label: 'Trip categories' },
  { id: 'expense_categories', label: 'Expense categories' },
  { id: 'rates', label: 'Mileage rates' },
  { id: 'users', label: 'Users' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function SettingsPage() {
  const [tab, setTab] = useState<TabId>('entities');

  return (
    <div>
      <PageHeader title="Settings" subtitle="Entities, categories, mileage rates, and user roles." />

      <div className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === t.id
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'entities' && <EntitiesSettings />}
      {tab === 'trip_categories' && <TripCategoriesSettings />}
      {tab === 'expense_categories' && <ExpenseCategoriesSettings />}
      {tab === 'rates' && <MileageRatesSettings />}
      {tab === 'users' && <UsersSettings />}
    </div>
  );
}
