import { Outlet } from 'react-router-dom';
import {
  Car,
  FileText,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  MapPin,
  Receipt,
  Settings,
  ShieldCheck,
  Wrench,
  LogOut,
  CalendarDays,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { AppShell, type NavigationGroup } from './AppShell';

export function AppLayout() {
  const { profile, role, signOut } = useAuth();
  const groups: NavigationGroup[] = [
    { label: 'Mission Delivery', items: [{ to: '/', label: 'My Day', icon: CalendarDays }] },
    {
      label: 'Operations',
      items: [
        { to: '/operations', label: 'Fleet dashboard', icon: LayoutDashboard },
        { to: '/trips', label: 'Trips', icon: Gauge },
        { to: '/vehicles', label: 'Vehicles', icon: Car },
        { to: '/maintenance', label: 'Maintenance', icon: Wrench },
        { to: '/expenses', label: 'Expenses', icon: Receipt },
        { to: '/locations', label: 'Locations', icon: MapPin },
        { to: '/reports', label: 'Reports', icon: FileText },
      ],
    },
    {
      label: 'Shared platform',
      items: [
        { to: '/documents', label: 'Documents', icon: FolderOpen },
        ...(role && ['owner', 'accountant', 'auditor'].includes(role)
          ? [{ to: '/audit', label: 'Audit Log', icon: ShieldCheck }]
          : []),
        ...(role === 'owner' ? [{ to: '/settings', label: 'Settings', icon: Settings }] : []),
      ],
    },
  ];
  return (
    <AppShell
      groups={groups}
      footer="Mission Delivery · Operations · Shared platform"
      header={
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-slate-800">
              {profile?.full_name || profile?.email}
            </p>
            <p className="text-xs text-slate-500">{role ? ROLE_LABELS[role] : ''}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void signOut()}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      }
    >
      <Outlet />
    </AppShell>
  );
}
