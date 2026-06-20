import { useState, type FormEvent } from 'react';
import { useVehicles } from '@/hooks/useVehicles';
import { useMaintenanceTypes } from '@/hooks/useLookups';
import type { MaintenanceScheduleInput } from '@/hooks/useMaintenance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { ModalFooter } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';

const numOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s));
const strOrNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

export function MaintenanceScheduleForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<MaintenanceScheduleInput>;
  onSubmit: (values: MaintenanceScheduleInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { data: vehicles } = useVehicles();
  const { data: types } = useMaintenanceTypes();

  const [vehicleId, setVehicleId] = useState(initial?.vehicle_id ?? '');
  const [typeId, setTypeId] = useState(initial?.maintenance_type_id ?? '');
  const [intervalMiles, setIntervalMiles] = useState(initial?.interval_miles?.toString() ?? '');
  const [intervalMonths, setIntervalMonths] = useState(initial?.interval_months?.toString() ?? '');
  const [lastDate, setLastDate] = useState(initial?.last_service_date ?? '');
  const [lastOdo, setLastOdo] = useState(initial?.last_service_odometer?.toString() ?? '');
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const errs: Record<string, string> = {};
    if (!vehicleId) errs.vehicle_id = 'Select a vehicle';
    if (!typeId) errs.maintenance_type_id = 'Select a type';
    const miles = numOrNull(intervalMiles);
    const months = numOrNull(intervalMonths);
    if (miles == null && months == null) errs.interval_miles = 'Set a mileage and/or month interval';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    try {
      await onSubmit({
        vehicle_id: vehicleId,
        maintenance_type_id: typeId,
        interval_miles: miles,
        interval_months: months,
        last_service_date: lastDate || null,
        last_service_odometer: numOrNull(lastOdo),
        is_active: active,
        notes: strOrNull(notes),
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save schedule (one per vehicle + type).');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vehicle" required error={errors.vehicle_id}>
          <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">Select…</option>
            {(vehicles ?? []).filter((v) => v.is_active || v.id === vehicleId).map((v) => (
              <option key={v.id} value={v.id}>
                {[v.year, v.make, v.model].filter(Boolean).join(' ')} {v.license_plate ? `· ${v.license_plate}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Service type" required error={errors.maintenance_type_id}>
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Select…</option>
            {(types ?? []).filter((t) => t.is_active || t.id === typeId).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Every (miles)" error={errors.interval_miles} hint="Leave blank if not mileage-based.">
          <Input type="number" min="1" value={intervalMiles} onChange={(e) => setIntervalMiles(e.target.value)} placeholder="5000" />
        </Field>
        <Field label="Every (months)" hint="Leave blank if not time-based.">
          <Input type="number" min="1" value={intervalMonths} onChange={(e) => setIntervalMonths(e.target.value)} placeholder="6" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Last service date">
          <Input type="date" value={lastDate} onChange={(e) => setLastDate(e.target.value)} />
        </Field>
        <Field label="Last service odometer">
          <Input type="number" step="0.1" min="0" value={lastOdo} onChange={(e) => setLastOdo(e.target.value)} />
        </Field>
      </div>

      <Field label="Status">
        <Select value={active ? 'active' : 'inactive'} onChange={(e) => setActive(e.target.value === 'active')}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </Field>

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
          Save schedule
        </Button>
      </ModalFooter>
    </form>
  );
}
