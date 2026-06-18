import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useEntities, useTripCategories } from '@/hooks/useReference';
import { useVehicles } from '@/hooks/useVehicles';
import type { TripInput } from '@/hooks/useTrips';
import { todayISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { ModalFooter } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';

const numOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s));

export interface TripFormInitial extends Partial<TripInput> {}

export function TripForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: TripFormInitial;
  onSubmit: (values: TripInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { profile } = useAuth();
  const { data: entities } = useEntities();
  const { data: vehicles } = useVehicles();
  const { data: categories } = useTripCategories();

  const activeVehicles = (vehicles ?? []).filter((v) => v.is_active || v.id === initial?.vehicle_id);
  const activeCategories = (categories ?? []).filter((c) => c.is_active || c.id === initial?.category_id);

  const [entityId, setEntityId] = useState(initial?.entity_id ?? profile?.default_entity_id ?? '');
  const [vehicleId, setVehicleId] = useState(initial?.vehicle_id ?? '');
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '');
  const [tripDate, setTripDate] = useState(initial?.trip_date ?? todayISO());
  const [source, setSource] = useState<'manual' | 'odometer'>(initial?.distance_source ?? 'manual');
  const [odoStart, setOdoStart] = useState(initial?.odometer_start?.toString() ?? '');
  const [odoEnd, setOdoEnd] = useState(initial?.odometer_end?.toString() ?? '');
  const [miles, setMiles] = useState(initial?.distance_miles?.toString() ?? '');
  const [destination, setDestination] = useState(initial?.destination ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const computedDistance = useMemo(() => {
    if (source !== 'odometer') return null;
    const s = numOrNull(odoStart);
    const e = numOrNull(odoEnd);
    if (s == null || e == null) return null;
    return Math.round((e - s) * 10) / 10;
  }, [source, odoStart, odoEnd]);

  function validate(): TripInput | null {
    const errs: Record<string, string> = {};
    if (!entityId) errs.entity_id = 'Select an entity';
    if (!vehicleId) errs.vehicle_id = 'Select a vehicle';
    if (!categoryId) errs.category_id = 'Select a category';
    if (!tripDate) errs.trip_date = 'Required';

    let distance = 0;
    let oStart: number | null = null;
    let oEnd: number | null = null;

    if (source === 'odometer') {
      oStart = numOrNull(odoStart);
      oEnd = numOrNull(odoEnd);
      if (oStart == null || oEnd == null) errs.odometer_end = 'Enter start and end odometer';
      else if (oEnd < oStart) errs.odometer_end = 'End must be ≥ start';
      else distance = Math.round((oEnd - oStart) * 10) / 10;
    } else {
      const m = numOrNull(miles);
      if (m == null || m <= 0) errs.distance_miles = 'Enter miles greater than 0';
      else distance = m;
    }

    setErrors(errs);
    if (Object.keys(errs).length > 0) return null;

    return {
      entity_id: entityId,
      vehicle_id: vehicleId,
      category_id: categoryId,
      trip_date: tripDate,
      distance_source: source,
      odometer_start: oStart,
      odometer_end: oEnd,
      distance_miles: distance,
      destination: destination.trim() || null,
      notes: notes.trim() || null,
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const values = validate();
    if (!values) return;
    setBusy(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save trip');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Entity" required error={errors.entity_id}>
          <Select value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            <option value="">Select…</option>
            {(entities ?? []).map((en) => (
              <option key={en.id} value={en.id}>
                {en.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" required error={errors.trip_date}>
          <Input type="date" value={tripDate} onChange={(e) => setTripDate(e.target.value)} />
        </Field>
        <Field label="Vehicle" required error={errors.vehicle_id}>
          <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">Select…</option>
            {activeVehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {[v.year, v.make, v.model].filter(Boolean).join(' ')} {v.license_plate ? `· ${v.license_plate}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" required error={errors.category_id}>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select…</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Distance entry">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={source === 'manual' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setSource('manual')}
          >
            Enter miles
          </Button>
          <Button
            type="button"
            variant={source === 'odometer' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setSource('odometer')}
          >
            From odometer
          </Button>
        </div>
      </Field>

      {source === 'odometer' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Odometer start" required>
            <Input type="number" step="0.1" min="0" value={odoStart} onChange={(e) => setOdoStart(e.target.value)} />
          </Field>
          <Field label="Odometer end" required error={errors.odometer_end}>
            <Input type="number" step="0.1" min="0" value={odoEnd} onChange={(e) => setOdoEnd(e.target.value)} />
          </Field>
          <Field label="Distance">
            <Input value={computedDistance != null ? `${computedDistance} mi` : '—'} disabled />
          </Field>
        </div>
      ) : (
        <Field label="Distance (miles)" required error={errors.distance_miles}>
          <Input type="number" step="0.1" min="0" value={miles} onChange={(e) => setMiles(e.target.value)} className="sm:w-48" />
        </Field>
      )}

      <Field label="Destination" hint="Optional — strengthens the IRS log.">
        <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. County clinic" />
      </Field>
      <Field label="Notes / purpose">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <ModalFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner className="text-white" />}
          Save trip
        </Button>
      </ModalFooter>
    </form>
  );
}
