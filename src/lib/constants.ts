import type { IrsRateType, UserRole } from '@/types/db';

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  contributor: 'Contributor',
  accountant: 'Accountant',
  auditor: 'Read-Only Auditor',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: 'Full access, including user management and settings.',
  manager: 'Read/write all operational data. No user management or settings.',
  contributor: 'Create records and edit the ones they own.',
  accountant: 'Read all data and run/export financial reports. No operational edits.',
  auditor: 'Read-only access to all records and the audit log.',
};

export const RATE_TYPE_LABELS: Record<IrsRateType, string> = {
  business: 'Business',
  medical: 'Medical',
  charitable: 'Charitable',
  none: 'Not deductible',
};

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  nonprofit_501c3: '501(c)(3) Nonprofit',
  llc: 'LLC',
};

export const DISTANCE_SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  odometer: 'Odometer',
  gps: 'GPS',
};

/** Vehicle-operating expense categories that roll up into "vehicle costs". */
export const VEHICLE_COST_KEYS = ['fuel', 'repairs', 'maintenance', 'parking', 'tolls'];

/** Default look-ahead window (days) for the expirations surface. */
export const EXPIRATION_WINDOW_DAYS = 60;
