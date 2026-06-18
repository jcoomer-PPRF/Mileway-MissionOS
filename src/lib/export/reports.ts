import { ENTITY_TYPE_LABELS, RATE_TYPE_LABELS } from '@/lib/constants';
import { formatDate } from '@/lib/utils';
import type { ColumnSpec } from './csv';
import type { Entity, ExpenseDetail, TripDetail, Vehicle } from '@/types/db';

export interface ReportTable {
  columns: ColumnSpec[];
  rows: Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// IRS-format mileage log
// ---------------------------------------------------------------------------
const IRS_LOG_COLUMNS: ColumnSpec[] = [
  { key: 'date', label: 'Date' },
  { key: 'entity', label: 'Entity' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'plate', label: 'Plate' },
  { key: 'purpose', label: 'Purpose / Category' },
  { key: 'destination', label: 'Destination' },
  { key: 'odo_start', label: 'Odometer Start' },
  { key: 'odo_end', label: 'Odometer End' },
  { key: 'miles', label: 'Miles' },
  { key: 'rate_type', label: 'IRS Rate Type' },
  { key: 'rate', label: 'Rate ($/mi)' },
  { key: 'deduction', label: 'Est. Deduction ($)' },
  { key: 'notes', label: 'Notes' },
];

export function buildMileageLog(trips: TripDetail[]): ReportTable {
  const rows = trips.map((t) => ({
    date: formatDate(t.trip_date),
    entity: t.entity_name,
    vehicle: t.vehicle_label,
    plate: t.license_plate ?? '',
    purpose: t.category_name,
    destination: t.destination ?? '',
    odo_start: t.odometer_start ?? '',
    odo_end: t.odometer_end ?? '',
    miles: Number(t.distance_miles),
    rate_type: RATE_TYPE_LABELS[t.irs_rate_type],
    rate: t.applied_rate ?? '',
    deduction: Number(t.deduction_amount),
    notes: t.notes ?? '',
  }));
  return { columns: IRS_LOG_COLUMNS, rows };
}

// ---------------------------------------------------------------------------
// Expense report
// ---------------------------------------------------------------------------
const EXPENSE_COLUMNS: ColumnSpec[] = [
  { key: 'date', label: 'Date' },
  { key: 'entity', label: 'Entity' },
  { key: 'category', label: 'Category' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'merchant', label: 'Merchant' },
  { key: 'amount', label: 'Amount ($)' },
  { key: 'receipt', label: 'Receipt' },
  { key: 'notes', label: 'Notes' },
];

export function buildExpenseReport(expenses: ExpenseDetail[]): ReportTable {
  const rows = expenses.map((x) => ({
    date: formatDate(x.expense_date),
    entity: x.entity_name,
    category: x.category_name,
    vehicle: x.vehicle_label ?? '',
    merchant: x.merchant ?? '',
    amount: Number(x.amount),
    receipt: x.receipt_path ? 'Yes' : 'No',
    notes: x.notes ?? '',
  }));
  return { columns: EXPENSE_COLUMNS, rows };
}

// ---------------------------------------------------------------------------
// Vehicle sheet (for the Excel workbook)
// ---------------------------------------------------------------------------
const VEHICLE_COLUMNS: ColumnSpec[] = [
  { key: 'entity', label: 'Entity' },
  { key: 'year', label: 'Year' },
  { key: 'make', label: 'Make' },
  { key: 'model', label: 'Model' },
  { key: 'vin', label: 'VIN' },
  { key: 'plate', label: 'Plate' },
  { key: 'odometer', label: 'Odometer' },
  { key: 'insurance_provider', label: 'Insurance Provider' },
  { key: 'insurance_policy', label: 'Insurance Policy #' },
  { key: 'insurance_exp', label: 'Insurance Expires' },
  { key: 'registration', label: 'Registration #' },
  { key: 'registration_exp', label: 'Registration Expires' },
  { key: 'status', label: 'Status' },
];

export function buildVehicleSheet(vehicles: Vehicle[], entityName: (id: string) => string): ReportTable {
  const rows = vehicles.map((v) => ({
    entity: entityName(v.entity_id),
    year: v.year ?? '',
    make: v.make ?? '',
    model: v.model ?? '',
    vin: v.vin ?? '',
    plate: v.license_plate ?? '',
    odometer: v.current_odometer ?? '',
    insurance_provider: v.insurance_provider ?? '',
    insurance_policy: v.insurance_policy_number ?? '',
    insurance_exp: formatDate(v.insurance_expiration),
    registration: v.registration_number ?? '',
    registration_exp: formatDate(v.registration_expiration),
    status: v.is_active ? 'Active' : 'Retired',
  }));
  return { columns: VEHICLE_COLUMNS, rows };
}

// ---------------------------------------------------------------------------
// Per-entity mileage summary
// ---------------------------------------------------------------------------
const ENTITY_SUMMARY_COLUMNS: ColumnSpec[] = [
  { key: 'entity', label: 'Entity' },
  { key: 'type', label: 'Type' },
  { key: 'trips', label: 'Trips' },
  { key: 'business_miles', label: 'Business Miles' },
  { key: 'total_miles', label: 'Total Miles' },
  { key: 'deduction', label: 'Est. Deduction ($)' },
];

export function buildEntityMileageSummary(trips: TripDetail[], entities: Entity[]): ReportTable {
  const rows = entities.map((ent) => {
    const t = trips.filter((x) => x.entity_id === ent.id);
    return {
      entity: ent.name,
      type: ENTITY_TYPE_LABELS[ent.entity_type] ?? ent.entity_type,
      trips: t.length,
      business_miles: t.filter((x) => x.irs_rate_type === 'business').reduce((s, x) => s + Number(x.distance_miles), 0),
      total_miles: t.reduce((s, x) => s + Number(x.distance_miles), 0),
      deduction: t.reduce((s, x) => s + Number(x.deduction_amount), 0),
    };
  });
  return { columns: ENTITY_SUMMARY_COLUMNS, rows };
}
