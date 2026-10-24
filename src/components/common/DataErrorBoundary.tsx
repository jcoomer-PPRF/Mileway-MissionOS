import { Component, type ReactNode } from 'react';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

class ReadErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="m-6 rounded-lg border border-red-200 bg-white p-6">
        <h1 className="font-semibold">We couldn’t load this page.</h1>
        <p className="my-3 text-sm text-slate-600">
          Check your connection and access, then retry. Reports and totals are unavailable until
          loading succeeds.
        </p>
        <Button
          onClick={() => {
            this.props.onReset();
            this.setState({ failed: false });
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
}

export function DataErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => <ReadErrorBoundary onReset={reset}>{children}</ReadErrorBoundary>}
    </QueryErrorResetBoundary>
  );
}
