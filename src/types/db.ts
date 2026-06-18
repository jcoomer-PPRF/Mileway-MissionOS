// Hand-written row types mirroring the Supabase schema (supabase/migrations).
// Run `npm run db:types` against a linked project to regenerate richer types.

export type UserRole = 'administrator' | 'staff' | 'auditor';
export type EntityType = 'nonprofit_501c3' | 'llc';
export type DistanceSource = 'manual' | 'odometer';
export type IrsRateType = 'business' | 'medical' | 'charitable' | 'none';
export type AuditAction = 'insert' | 'update' | 'delete';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  default_entity_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Entity {
  id: string;
  name: string;
  legal_name: string | null;
  entity_type: EntityType;
  is_primary: boolean;
  ein: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  entity_id: string;
  vin: string | null;
  license_plate: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  current_odometer: number | null;
  insurance_provider: string | null;
  insurance_policy_number: string | null;
  insurance_expiration: string | null;
  registration_number: string | null;
  registration_expiration: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface TripCategory {
  id: string;
  name: string;
  irs_rate_type: IrsRateType;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCategory {
  id: string;
  key: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MileageRate {
  id: string;
  rate_type: IrsRateType;
  rate_per_mile: number;
  effective_date: string;
  created_at: string;
  updated_at: string;
}

export interface Trip {
  id: string;
  entity_id: string;
  vehicle_id: string;
  category_id: string;
  trip_date: string;
  odometer_start: number | null;
  odometer_end: number | null;
  distance_miles: number;
  distance_source: DistanceSource;
  destination: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface Expense {
  id: string;
  entity_id: string;
  vehicle_id: string | null;
  expense_category_id: string;
  amount: number;
  expense_date: string;
  merchant: string | null;
  notes: string | null;
  receipt_path: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// ---- View row types (joined, for reporting/dashboard) ----

export interface TripDetail {
  id: string;
  trip_date: string;
  entity_id: string;
  entity_name: string;
  entity_is_primary: boolean;
  vehicle_id: string;
  vehicle_label: string;
  license_plate: string | null;
  category_id: string;
  category_name: string;
  irs_rate_type: IrsRateType;
  odometer_start: number | null;
  odometer_end: number | null;
  distance_miles: number;
  distance_source: DistanceSource;
  destination: string | null;
  notes: string | null;
  applied_rate: number | null;
  deduction_amount: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseDetail {
  id: string;
  expense_date: string;
  entity_id: string;
  entity_name: string;
  entity_is_primary: boolean;
  vehicle_id: string | null;
  vehicle_label: string | null;
  expense_category_id: string;
  category_key: string;
  category_name: string;
  amount: number;
  merchant: string | null;
  notes: string | null;
  receipt_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: number;
  table_name: string;
  record_id: string;
  action: AuditAction;
  changed_by: string | null;
  changed_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
}
