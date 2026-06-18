import type { IrsRateType, UserRole } from '@/types/db';

export const ROLE_LABELS: Record<UserRole, string> = {
  administrator: 'Administrator',
  staff: 'Staff',
  auditor: 'Read-Only Auditor',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  administrator: 'Full access to all records and settings.',
  staff: 'Create records and edit the ones they own.',
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

/** Vehicle-operating expense categories that roll up into "vehicle costs". */
export const VEHICLE_COST_KEYS = ['fuel', 'repairs', 'maintenance', 'parking', 'tolls'];
