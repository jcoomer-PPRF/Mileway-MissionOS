import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-5xl font-bold text-slate-300">404</p>
      <h1 className="mt-2 text-xl font-semibold text-slate-800">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">That page doesn’t exist or you don’t have access to it.</p>
      <Link to="/" className="mt-4">
        <Button>Back to dashboard</Button>
      </Link>
    </div>
  );
}
