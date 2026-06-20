import { useState, type FormEvent } from 'react';
import { useEntities, useTripCategories } from '@/hooks/useReference';
import { useLocationTypes } from '@/hooks/useLookups';
import type { SavedLocationInput } from '@/hooks/useLocations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { ModalFooter } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';

const numOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s));
const strOrNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

export function SavedLocationForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<SavedLocationInput>;
  onSubmit: (values: SavedLocationInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { data: entities } = useEntities();
  const { data: types } = useLocationTypes();
  const { data: categories } = useTripCategories();

  const [name, setName] = useState(initial?.name ?? '');
  const [entityId, setEntityId] = useState(initial?.entity_id ?? '');
  const [typeId, setTypeId] = useState(initial?.location_type_id ?? '');
  const [lat, setLat] = useState(initial?.latitude?.toString() ?? '');
  const [lng, setLng] = useState(initial?.longitude?.toString() ?? '');
  const [radius, setRadius] = useState(initial?.radius_meters?.toString() ?? '150');
  const [categoryId, setCategoryId] = useState(initial?.default_trip_category_id ?? '');
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Required';
    const latN = numOrNull(lat);
    const lngN = numOrNull(lng);
    if (latN == null || latN < -90 || latN > 90) errs.latitude = 'Latitude -90 to 90';
    if (lngN == null || lngN < -180 || lngN > 180) errs.longitude = 'Longitude -180 to 180';
    const radN = numOrNull(radius);
    if (radN == null || radN <= 0) errs.radius_meters = 'Radius must be > 0';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        entity_id: entityId || null,
        location_type_id: typeId || null,
        latitude: latN as number,
        longitude: lngN as number,
        radius_meters: radN as number,
        default_trip_category_id: categoryId || null,
        is_active: active,
        notes: strOrNull(notes),
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save location');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Name" required error={errors.name}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Riverside Day Program" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Entity" hint="Leave as Shared to apply across both entities.">
          <Select value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            <option value="">Shared (both entities)</option>
            {(entities ?? []).map((en) => (
              <option key={en.id} value={en.id}>
                {en.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Location type">
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">—</option>
            {(types ?? []).filter((t) => t.is_active || t.id === typeId).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Latitude" required error={errors.latitude}>
          <Input type="number" step="0.000001" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="40.712800" />
        </Field>
        <Field label="Longitude" required error={errors.longitude}>
          <Input type="number" step="0.000001" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-74.006000" />
        </Field>
        <Field label="Radius (meters)" required error={errors.radius_meters}>
          <Input type="number" min="1" value={radius} onChange={(e) => setRadius(e.target.value)} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Default trip category" hint="Auto-applied to trips starting/ending here.">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">None</option>
            {(categories ?? []).filter((c) => c.is_active || c.id === categoryId).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={active ? 'active' : 'inactive'} onChange={(e) => setActive(e.target.value === 'active')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      </div>

      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <ModalFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner className="text-white" />}
          Save location
        </Button>
      </ModalFooter>
    </form>
  );
}
