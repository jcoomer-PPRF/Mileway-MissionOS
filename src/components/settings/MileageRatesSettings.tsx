import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  useMileageRates,
  useMileageRateMutations,
  type MileageRateInput,
} from '@/hooks/useReference';
import { RATE_TYPE_LABELS } from '@/lib/constants';
import { formatCurrency, formatDate, todayISO } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Modal, ModalFooter } from '@/components/ui/modal';
import { PageLoader, Spinner } from '@/components/ui/spinner';
import type { IrsRateType, MileageRate } from '@/types/db';

const RATE_TYPES: IrsRateType[] = ['business', 'medical', 'charitable'];

export function MileageRatesSettings() {
  const { data: rates, isLoading } = useMileageRates();
  const { create, update, remove } = useMileageRateMutations();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MileageRate | null>(null);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(r: MileageRate) {
    setEditing(r);
    setOpen(true);
  }
  async function save(input: MileageRateInput) {
    if (editing) await update.mutateAsync({ id: editing.id, input });
    else await create.mutateAsync(input);
    setOpen(false);
  }
  async function del(r: MileageRate) {
    if (!window.confirm('Delete this rate?')) return;
    await remove.mutateAsync(r.id);
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>IRS mileage rates</CardTitle>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4" /> Add rate
        </Button>
      </CardHeader>
      {isLoading ? (
        <PageLoader />
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Rate type</th>
              <th className="px-4 py-2">Rate / mile</th>
              <th className="px-4 py-2">Effective date</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {(rates ?? []).map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2 font-medium text-slate-800">{RATE_TYPE_LABELS[r.rate_type]}</td>
                <td className="px-4 py-2 tabular-nums">{formatCurrency(r.rate_per_mile)}</td>
                <td className="px-4 py-2">{formatDate(r.effective_date)}</td>
                <td className="px-4 py-2 text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => del(r)} aria-label="Delete">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="px-4 py-3 text-xs text-slate-400">
        The rate effective on a trip’s date is applied. Charitable is statutory (14¢); confirm business/medical rates
        with current IRS guidance.
      </p>

      {open && <RateModal editing={editing} onClose={() => setOpen(false)} onSave={save} />}
    </Card>
  );
}

function RateModal({
  editing,
  onClose,
  onSave,
}: {
  editing: MileageRate | null;
  onClose: () => void;
  onSave: (input: MileageRateInput) => Promise<void>;
}) {
  const [rateType, setRateType] = useState<IrsRateType>(editing?.rate_type ?? 'business');
  const [rate, setRate] = useState(editing?.rate_per_mile?.toString() ?? '');
  const [date, setDate] = useState(editing?.effective_date ?? todayISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onSave({ rate_type: rateType, rate_per_mile: Number(rate), effective_date: date });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rate');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit rate' : 'Add rate'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Rate type" required>
          <Select value={rateType} onChange={(e) => setRateType(e.target.value as IrsRateType)}>
            {RATE_TYPES.map((r) => (
              <option key={r} value={r}>
                {RATE_TYPE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rate per mile (USD)" required>
          <Input type="number" step="0.001" min="0" value={rate} onChange={(e) => setRate(e.target.value)} required />
        </Field>
        <Field label="Effective date" required hint="Applies to trips on or after this date.">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Spinner className="text-white" />}
            Save
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
