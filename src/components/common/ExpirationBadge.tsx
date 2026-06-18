import { Badge } from '@/components/ui/badge';
import { daysUntil, formatDate } from '@/lib/utils';

/** Highlights upcoming/expired insurance & registration dates (read-only cue;
 *  automated reminders are explicitly out of scope for Phase 1). */
export function ExpirationBadge({ date }: { date: string | null }) {
  if (!date) return <span className="text-slate-400">—</span>;
  const days = daysUntil(date);
  if (days === null) return <span>{formatDate(date)}</span>;
  if (days < 0) return <Badge tone="red">Expired {formatDate(date)}</Badge>;
  if (days <= 30) return <Badge tone="amber">{formatDate(date)} ({days}d)</Badge>;
  return <span className="text-slate-600">{formatDate(date)}</span>;
}
