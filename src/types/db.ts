// Hand-written row types mirroring the Supabase schema (supabase/migrations).
// Run `npm run db:types` against a linked project to regenerate richer types.

// Phase 2 permission tiers (Phase 1 administrator/staff were renamed to
// owner/contributor in migration 0006).
export type UserRole = 'owner' | 'manager' | 'contributor' | 'accountant' | 'auditor';
export type EntityType = 'nonprofit_501c3' | 'llc';
export type DistanceSource = 'manual' | 'odometer' | 'gps';
export type IrsRateType = 'business' | 'medical' | 'charitable' | 'none';
export type AuditAction = 'insert' | 'update' | 'delete';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  job_title_id: string | null;
  default_entity_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobTitle {
  id: string;
  name: string;
  sort_order: number;
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
  // Phase 2
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  started_at: string | null;
  ended_at: string | null;
  route_polyline: string | null;
  start_location_id: string | null;
  end_location_id: string | null;
  auto_categorized: boolean;
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

// ---- Phase 2: locations ----
export interface LocationType {
  id: string;
  key: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SavedLocation {
  id: string;
  entity_id: string | null;
  name: string;
  location_type_id: string | null;
  latitude: number;
  longitude: number;
  radius_meters: number;
  default_trip_category_id: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

// ---- Phase 2: maintenance ----
export interface MaintenanceType {
  id: string;
  key: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceRecord {
  id: string;
  vehicle_id: string;
  entity_id: string;
  maintenance_type_id: string;
  service_date: string;
  odometer_at_service: number | null;
  cost: number | null;
  vendor: string | null;
  notes: string | null;
  linked_expense_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface MaintenanceSchedule {
  id: string;
  vehicle_id: string;
  maintenance_type_id: string;
  interval_miles: number | null;
  interval_months: number | null;
  last_service_date: string | null;
  last_service_odometer: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface MaintenanceDue {
  id: string;
  vehicle_id: string;
  vehicle_label: string;
  entity_id: string;
  maintenance_type_id: string;
  maintenance_type_name: string;
  interval_miles: number | null;
  interval_months: number | null;
  last_service_date: string | null;
  last_service_odometer: number | null;
  current_odometer: number;
  next_due_odometer: number | null;
  next_due_date: string | null;
  miles_remaining: number | null;
  days_remaining: number | null;
  is_due: boolean;
}

// ---- Phase 2: documents ----
export interface DocumentType {
  id: string;
  key: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentRow {
  id: string;
  entity_id: string;
  vehicle_id: string | null;
  profile_id: string | null;
  document_type_id: string;
  title: string;
  file_path: string | null;
  issued_date: string | null;
  expiration_date: string | null;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface DocumentExpiring {
  id: string;
  entity_id: string;
  entity_name: string;
  document_type_id: string;
  document_type_name: string;
  title: string;
  vehicle_id: string | null;
  vehicle_label: string | null;
  profile_id: string | null;
  profile_name: string | null;
  issued_date: string | null;
  expiration_date: string;
  days_until_expiration: number;
  file_path: string | null;
}

export interface DriverCredential {
  id: string;
  profile_id: string;
  profile_name: string | null;
  profile_email: string;
  document_type_id: string;
  document_type_name: string;
  title: string;
  entity_id: string;
  issued_date: string | null;
  expiration_date: string | null;
  days_until_expiration: number | null;
  file_path: string | null;
  created_at: string;
  updated_at: string;
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
  // Phase 2 additions
  started_at: string | null;
  ended_at: string | null;
  start_location_id: string | null;
  start_location_name: string | null;
  end_location_id: string | null;
  end_location_name: string | null;
  auto_categorized: boolean;
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
