import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Car,
  FileText,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  MapPin,
  Menu,
  Receipt,
  Settings,
  ShieldCheck,
  Wrench,
  LogOut,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { UserRole } from '@/types/db';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Gauge;
  roles?: UserRole[]; // undefined = all roles
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/trips', label: 'Trips', icon: Gauge },
  { to: '/vehicles', label: 'Vehicles', icon: Car },
  { to: '/maintenance', label: 'Maintenance', icon: Wrench },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/locations', label: 'Locations', icon: MapPin },
  { to: '/documents', label: 'Documents', icon: FolderOpen },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/audit', label: 'Audit Log', icon: ShieldCheck, roles: ['owner', 'accountant', 'auditor'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['owner'] },
];

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const role = profile?.role;
  const items = NAV.filter((n) => !n.roles || (role && n.roles.includes(role)));

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Gauge className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900">Mileway</span>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="space-y-1 p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100',
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex flex-1 items-center justify-end gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-800">{profile?.full_name || profile?.email}</p>
              <p className="text-xs text-slate-500">{role ? ROLE_LABELS[role] : ''}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => signOut()}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
