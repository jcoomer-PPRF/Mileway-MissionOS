import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'gray' | 'green' | 'blue' | 'amber' | 'red' | 'purple';

const tones: Record<BadgeTone, string> = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-100 text-emerald-800',
  blue: 'bg-blue-100 text-blue-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  purple: 'bg-purple-100 text-purple-800',
};

export function Badge({
  tone = 'gray',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}
      {...props}
    />
  );
}
