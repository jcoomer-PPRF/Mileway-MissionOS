import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { RequireRole } from '@/components/auth/RequireRole';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { TripsPage } from '@/pages/TripsPage';
import { VehiclesPage } from '@/pages/VehiclesPage';
import { ExpensesPage } from '@/pages/ExpensesPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { AuditLogPage } from '@/pages/AuditLogPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="trips" element={<TripsPage />} />
          <Route path="vehicles" element={<VehiclesPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route element={<RequireRole allow={['administrator', 'auditor']} />}>
            <Route path="audit" element={<AuditLogPage />} />
          </Route>
          <Route element={<RequireRole allow={['administrator']} />}>
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
