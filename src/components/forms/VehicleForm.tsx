import { useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useEntities } from '@/hooks/useReference';
import type { VehicleInput } from '@/hooks/useVehicles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { ModalFooter } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';

const numOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s));
const strOrNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

export function VehicleForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<VehicleInput>;
  onSubmit: (values: VehicleInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { profile } = useAuth();
  const { data: entities } = useEntities();

  const [v, setV] = useState({
    entity_id: initial?.entity_id ?? profile?.default_entity_id ?? '',
    year: initial?.year?.toString() ?? '',
    make: initial?.make ?? '',
    model: initial?.model ?? '',
    vin: initial?.vin ?? '',
    license_plate: initial?.license_plate ?? '',
    current_odometer: initial?.current_odometer?.toString() ?? '',
    insurance_provider: initial?.insurance_provider ?? '',
    insurance_policy_number: initial?.insurance_policy_number ?? '',
    insurance_expiration: initial?.insurance_expiration ?? '',
    registration_number: initial?.registration_number ?? '',
    registration_expiration: initial?.registration_expiration ?? '',
    is_active: initial?.is_active ?? true,
    notes: initial?.notes ?? '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function set<K extends keyof typeof v>(key: K, value: (typeof v)[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const errs: Record<string, string> = {};
    if (!v.entity_id) errs.entity_id = 'Select an entity';
    const yearNum = numOrNull(v.year);
    if (yearNum != null && (yearNum < 1900 || yearNum > 2100)) errs.year = 'Enter a valid year';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const values: VehicleInput = {
      entity_id: v.entity_id,
      year: yearNum,
      make: strOrNull(v.make),
      model: strOrNull(v.model),
      vin: strOrNull(v.vin),
      license_plate: strOrNull(v.license_plate),
      current_odometer: numOrNull(v.current_odometer),
      insurance_provider: strOrNull(v.insurance_provider),
      insurance_policy_number: strOrNull(v.insurance_policy_number),
      insurance_expiration: strOrNull(v.insurance_expiration),
      registration_number: strOrNull(v.registration_number),
      registration_expiration: strOrNull(v.registration_expiration),
      is_active: v.is_active,
      notes: strOrNull(v.notes),
    };

    setBusy(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save vehicle');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Entity" required error={errors.entity_id}>
          <Select value={v.entity_id} onChange={(e) => set('entity_id', e.target.value)}>
            <option value="">Select…</option>
            {(entities ?? []).map((en) => (
              <option key={en.id} value={en.id}>
                {en.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={v.is_active ? 'active' : 'retired'} onChange={(e) => set('is_active', e.target.value === 'active')}>
            <option value="active">Active</option>
            <option value="retired">Retired</option>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Year" error={errors.year}>
          <Input type="number" value={v.year} onChange={(e) => set('year', e.target.value)} placeholder="2022" />
        </Field>
        <Field label="Make">
          <Input value={v.make} onChange={(e) => set('make', e.target.value)} placeholder="Toyota" />
        </Field>
        <Field label="Model">
          <Input value={v.model} onChange={(e) => set('model', e.target.value)} placeholder="Sienna" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="VIN">
          <Input value={v.vin} onChange={(e) => set('vin', e.target.value)} />
        </Field>
        <Field label="License plate">
          <Input value={v.license_plate} onChange={(e) => set('license_plate', e.target.value)} />
        </Field>
        <Field label="Current odometer">
          <Input type="number" step="0.1" min="0" value={v.current_odometer} onChange={(e) => set('current_odometer', e.target.value)} />
        </Field>
      </div>

      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-600">Insurance</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Provider">
            <Input value={v.insurance_provider} onChange={(e) => set('insurance_provider', e.target.value)} />
          </Field>
          <Field label="Policy #">
            <Input value={v.insurance_policy_number} onChange={(e) => set('insurance_policy_number', e.target.value)} />
          </Field>
          <Field label="Expiration">
            <Input type="date" value={v.insurance_expiration} onChange={(e) => set('insurance_expiration', e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-slate-200 p-4">
        <legend className="px-1 text-sm font-medium text-slate-600">Registration</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registration #">
            <Input value={v.registration_number} onChange={(e) => set('registration_number', e.target.value)} />
          </Field>
          <Field label="Expiration">
            <Input type="date" value={v.registration_expiration} onChange={(e) => set('registration_expiration', e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <Field label="Notes">
        <Textarea value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>

      {submitError && <p className="text-sm text-red-600">{submitError}</p>}

      <ModalFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner className="text-white" />}
          Save vehicle
        </Button>
      </ModalFooter>
    </form>
  );
}
