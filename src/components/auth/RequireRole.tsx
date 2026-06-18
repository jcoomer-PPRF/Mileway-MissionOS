import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PageLoader } from '@/components/ui/spinner';
import type { UserRole } from '@/types/db';

export function RequireRole({ allow }: { allow: UserRole[] }) {
  const { profile, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!profile || !allow.includes(profile.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
