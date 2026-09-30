import schema from './timeEntry.schema.json';
export * from './timeEntry.generated';

import type {
  TimeEntryStatus,
  WorkerAllowedStatus,
  ForemanAllowedStatus,
  BillingType,
  TimeEntryType
} from './timeEntry.generated';

export const TIME_ENTRY_SCHEMA = schema;

export const TIME_ENTRY_STATUSES: readonly TimeEntryStatus[] = Object.freeze([
  'draft',
  'pending',
  'submitted',
  'approved',
  'rejected',
  'foreman_approved',
  'foreman_rejected',
  'admin_approved',
  'admin_rejected'
]);

export const WORKER_ALLOWED_TIME_ENTRY_STATUSES: readonly WorkerAllowedStatus[] = Object.freeze([
  'draft',
  'pending',
  'submitted'
]);

export const FOREMAN_ALLOWED_TIME_ENTRY_STATUSES: readonly ForemanAllowedStatus[] = Object.freeze([
  'draft',
  'pending',
  'submitted',
  'foreman_approved',
  'foreman_rejected'
]);

export const BILLING_TYPES: readonly BillingType[] = Object.freeze([
  'hourly',
  'daily',
  'project',
  'fixed',
  'm2',
  'mb'
]);

export const TIME_ENTRY_TYPES: readonly TimeEntryType[] = Object.freeze([
  'drive',
  'work',
  'other',
  'employee',
  'subcontractor'
]);
