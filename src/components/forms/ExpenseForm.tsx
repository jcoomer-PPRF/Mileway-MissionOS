import { useState, type FormEvent } from 'react';
import { Paperclip } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useEntities, useExpenseCategories } from '@/hooks/useReference';
import { useVehicles } from '@/hooks/useVehicles';
import { getReceiptUrl, uploadReceipt, type ExpenseInput } from '@/hooks/useExpenses';
import { todayISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/ui/field';
import { ModalFooter } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/spinner';

const strOrNull = (s: string): string | null => (s.trim() === '' ? null : s.trim());

export function ExpenseForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<ExpenseInput>;
  onSubmit: (values: ExpenseInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { profile } = useAuth();
  const { data: entities } = useEntities();
  const { data: vehicles } = useVehicles();
  const { data: categories } = useExpenseCategories();

  const activeVehicles = (vehicles ?? []).filter((v) => v.is_active || v.id === initial?.vehicle_id);
  const activeCategories = (categories ?? []).filter((c) => c.is_active || c.id === initial?.expense_category_id);

  const [entityId, setEntityId] = useState(initial?.entity_id ?? profile?.default_entity_id ?? '');
  const [categoryId, setCategoryId] = useState(initial?.expense_category_id ?? '');
  const [vehicleId, setVehicleId] = useState(initial?.vehicle_id ?? '');
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? '');
  const [date, setDate] = useState(initial?.expense_date ?? todayISO());
  const [merchant, setMerchant] = useState(initial?.merchant ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [receiptPath, setReceiptPath] = useState<string | null>(initial?.receipt_path ?? null);
  const [file, setFile] = useState<File | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function viewReceipt() {
    if (!receiptPath) return;
    const url = await getReceiptUrl(receiptPath);
    if (url) window.open(url, '_blank');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const errs: Record<string, string> = {};
    if (!entityId) errs.entity_id = 'Select an entity';
    if (!categoryId) errs.expense_category_id = 'Select a category';
    const amt = amount.trim() === '' ? NaN : Number(amount);
    if (!Number.isFinite(amt) || amt < 0) errs.amount = 'Enter a valid amount';
    if (!date) errs.expense_date = 'Required';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    try {
      let path = receiptPath;
      if (file) path = await uploadReceipt(file, entityId);

      const values: ExpenseInput = {
        entity_id: entityId,
        expense_category_id: categoryId,
        vehicle_id: vehicleId || null,
        amount: amt,
        expense_date: date,
        merchant: strOrNull(merchant),
        notes: strOrNull(notes),
        receipt_path: path,
      };
      await onSubmit(values);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save expense');
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
        <Field label="Date" required error={errors.expense_date}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Category" required error={errors.expense_category_id}>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select…</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount (USD)" required error={errors.amount}>
          <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Vehicle" hint="Optional — leave blank for non-vehicle costs.">
          <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">None</option>
            {activeVehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {[v.year, v.make, v.model].filter(Boolean).join(' ')} {v.license_plate ? `· ${v.license_plate}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Merchant / vendor">
          <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} />
        </Field>
      </div>

      <Field label="Receipt image" hint="Stored as a file only (no OCR). JPG, PNG, or PDF.">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Paperclip className="h-4 w-4" />
            {file ? 'Change file' : 'Choose file'}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {file && <span className="text-sm text-slate-600">{file.name}</span>}
          {!file && receiptPath && (
            <Button type="button" variant="ghost" size="sm" onClick={viewReceipt}>
              View current receipt
            </Button>
          )}
        </div>
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
          Save expense
        </Button>
      </ModalFooter>
    </form>
  );
}
