import { Badge } from '@/components/ui/badge';

export function EntityBadge({ name, isPrimary }: { name: string; isPrimary: boolean }) {
  return <Badge tone={isPrimary ? 'green' : 'blue'}>{name}</Badge>;
}
