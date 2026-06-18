import { Select } from '@/components/ui/select';
import { useEntities } from '@/hooks/useReference';

interface EntityFilterProps {
  value: string | 'all';
  onChange: (value: string | 'all') => void;
  includeAll?: boolean;
  allLabel?: string;
}

/** Drives the "single entity vs. consolidated" reporting toggle. */
export function EntityFilter({
  value,
  onChange,
  includeAll = true,
  allLabel = 'All entities (consolidated)',
}: EntityFilterProps) {
  const { data: entities } = useEntities();
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-auto min-w-[14rem]">
      {includeAll && <option value="all">{allLabel}</option>}
      {(entities ?? []).map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </Select>
  );
}
