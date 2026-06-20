import { useState, type FormEvent } from 'react';
import { useVehicles } from '@/hooks/useVehicles';
import { useMaintenanceTypes } from '@/hooks/useLookups';
import { useExpenseDetails } from '@/hooks/useExpenses';
import type { MaintenanceRecordInput } from '@/hooks/useMaintenance';
import { formatCurrency, formatDate, todayISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { ModalFooter } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';

const numOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s));
const strOrNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

export function MaintenanceRecordForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<MaintenanceRecordInput>;
  onSubmit: (values: MaintenanceRecordInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { data: vehicles } = useVehicles();
  const { data: types } = useMaintenanceTypes();
  const { data: expenses } = useExpenseDetails();

  const [vehicleId, setVehicleId] = useState(initial?.vehicle_id ?? '');
  const [typeId, setTypeId] = useState(initial?.maintenance_type_id ?? '');
  const [serviceDate, setServiceDate] = useState(initial?.service_date ?? todayISO());
  const [odometer, setOdometer] = useState(initial?.odometer_at_service?.toString() ?? '');
  const [cost, setCost] = useState(initial?.cost?.toString() ?? '');
  const [vendor, setVendor] = useState(initial?.vendor ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [linkedExpense, setLinkedExpense] = useState(initial?.linked_expense_id ?? '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const linkable = (expenses ?? []).filter((x) => !vehicleId || x.vehicle_id === vehicleId || x.id === linkedExpense);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const errs: Record<string, string> = {};
    if (!vehicleId) errs.vehicle_id = 'Select a vehicle';
    if (!typeId) errs.maintenance_type_id = 'Select a type';
    if (!serviceDate) errs.service_date = 'Required';
    const costN = numOrNull(cost);
    if (costN != null && costN < 0) errs.cost = 'Must be ≥ 0';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    try {
      await onSubmit({
        vehicle_id: vehicleId,
        entity_id: null, // defaults from the vehicle via DB trigger
        maintenance_type_id: typeId,
        service_date: serviceDate,
        odometer_at_service: numOrNull(odometer),
        cost: costN,
        vendor: strOrNull(vendor),
        notes: strOrNull(notes),
        linked_expense_id: linkedExpense || null,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save record');
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
        <Field label="Service date" required error={errors.service_date}>
          <Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
        </Field>
        <Field label="Odometer at service">
          <Input type="number" step="0.1" min="0" value={odometer} onChange={(e) => setOdometer(e.target.value)} />
        </Field>
        <Field label="Cost (USD)" error={errors.cost}>
          <Input type="number" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <Field label="Vendor">
          <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
        </Field>
      </div>

      <Field label="Linked expense" hint="Optionally tie this to a recorded expense.">
        <Select value={linkedExpense} onChange={(e) => setLinkedExpense(e.target.value)}>
          <option value="">None</option>
          {linkable.map((x) => (
            <option key={x.id} value={x.id}>
              {formatDate(x.expense_date)} · {x.category_name} · {formatCurrency(x.amount)}
            </option>
          ))}
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
          Save record
        </Button>
      </ModalFooter>
    </form>
  );
}
