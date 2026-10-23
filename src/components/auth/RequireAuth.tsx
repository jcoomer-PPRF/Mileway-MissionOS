import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PageLoader } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';

export function RequireAuth() {
  const { session, profile, loading, error, refreshProfile, signOut } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  if (error || !profile?.is_active)
    return (
      <div role="alert" className="m-6 space-y-3">
        <p>{error ?? 'Your account does not have access.'}</p>
        <Button onClick={() => void refreshProfile()}>Retry</Button>{' '}
        <Button variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    );
  return <Outlet />;
}
