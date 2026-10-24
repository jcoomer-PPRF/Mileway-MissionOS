import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Compass, Menu, X, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface NavigationGroup {
  label: string;
  items: { to: string; label: string; icon: LucideIcon; documentLink?: boolean }[];
}

/** Presentation only; each entry point supplies its own identity and navigation. */
export function AppShell({
  groups,
  header,
  footer,
  children,
}: {
  groups: NavigationGroup[];
  header: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <a
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:p-3"
      >
        Skip to content
      </a>
      <aside
        id="workspace-menu"
        aria-label="Workspaces"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full invisible lg:visible',
        )}
      >
        <div className="flex h-20 shrink-0 items-center justify-between border-b border-slate-100 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-white">
              <Compass className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">MissionOS</p>
              <p className="text-xs text-slate-500">Peer Point</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav aria-label="Main navigation" className="flex-1 space-y-6 overflow-y-auto p-3">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const contents = (
                    <>
                      <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </>
                  );
                  const base =
                    'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-emerald-600';
                  return item.documentLink ? (
                    <a
                      key={item.to}
                      href={item.to}
                      onClick={() => setOpen(false)}
                      className={cn(base, 'text-slate-600 hover:bg-slate-100')}
                    >
                      {contents}
                    </a>
                  ) : (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          base,
                          isActive
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'text-slate-600 hover:bg-slate-100',
                        )
                      }
                    >
                      {contents}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        {footer && (
          <div className="border-t border-slate-100 p-5 text-xs text-slate-500">{footer}</div>
        )}
      </aside>
      {open && (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex min-h-20 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-controls="workspace-menu"
            aria-expanded={open}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center justify-end">{header}</div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-7xl p-4 outline-none lg:p-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
