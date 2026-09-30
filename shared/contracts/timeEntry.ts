import schema from './timeEntry.schema.json';

export const TIME_ENTRY_SCHEMA = schema;

export const TIME_ENTRY_STATUSES = (schema.definitions.TimeEntryStatus.enum as unknown) as readonly [
  'draft',
  'pending',
  'submitted',
  'approved',
  'rejected',
  'foreman_approved',
  'foreman_rejected',
  'admin_approved',
  'admin_rejected'
];

export type TimeEntryStatus = (typeof TIME_ENTRY_STATUSES)[number];

export const WORKER_ALLOWED_TIME_ENTRY_STATUSES = (schema.definitions.WorkerAllowedStatus.enum as unknown) as readonly [
  'draft',
  'pending',
  'submitted'
];

export type WorkerAllowedTimeEntryStatus = (typeof WORKER_ALLOWED_TIME_ENTRY_STATUSES)[number];

export const FOREMAN_ALLOWED_TIME_ENTRY_STATUSES = (schema.definitions.ForemanAllowedStatus.enum as unknown) as readonly [
  'draft',
  'pending',
  'submitted',
  'foreman_approved',
  'foreman_rejected'
];

export type ForemanAllowedTimeEntryStatus = (typeof FOREMAN_ALLOWED_TIME_ENTRY_STATUSES)[number];

export const BILLING_TYPES = (schema.definitions.BillingType.enum as unknown) as readonly [
  'hourly',
  'fixed',
  'm2',
  'mb'
];

export type BillingType = (typeof BILLING_TYPES)[number];

export const TIME_ENTRY_TYPES = (schema.definitions.TimeEntryType.enum as unknown) as readonly [
  'drive',
  'work',
  'other',
  'employee',
  'subcontractor'
];

export type TimeEntryType = (typeof TIME_ENTRY_TYPES)[number];

export interface TimeEntryContract {
  id: string;
  employeeId: string;
  employeeName?: string;
  jobId: string;
  jobCode: string;
  jobName: string;
  stageId: string;
  stageName: string;
  date: string;
  hours: number;
  billingType: BillingType;
  hourlyRate?: number;
  cost: number;
  description?: string;
  status: TimeEntryStatus;
  crewId?: string | null;
  foremanId?: string | null;
  foremanApprovedAt?: string | null;
  adminId?: string | null;
  adminApprovedAt?: string | null;
  settlementId?: string | null;
  type?: TimeEntryType;
  workType?: string;
  quantity?: number;
  rate?: number;
  approved?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TimeEntryPostPayload {
  id?: string;
  employeeId?: string;
  employee_id?: string;
  jobId?: string;
  project_id?: string;
  jobCode?: string;
  jobName?: string;
  stageId?: string;
  stageName?: string;
  date?: string;
  hours?: number;
  billingType?: BillingType;
  hourlyRate?: number;
  cost?: number;
  description?: string;
  status?: TimeEntryStatus;
  crewId?: string | null;
  foremanId?: string | null;
  foremanApprovedAt?: string | null;
  adminId?: string | null;
  adminApprovedAt?: string | null;
  settlementId?: string | null;
  type?: TimeEntryType;
  workType?: string;
  quantity?: number;
  rate?: number;
}

export interface TimeEntryPatchPayload extends Partial<TimeEntryPostPayload> {
  _lastUpdatedAt?: string;
}

export interface TimeEntryBatchImportPayload {
  entries: TimeEntryPostPayload[];
}

export interface TimeEntryBatchImportResult {
  status: 'success' | 'partial_success' | 'error';
  succeeded: number;
  upserted?: number;
  modified?: number;
  matched?: number;
  failed: number;
  succeededIds: string[];
  failedIds: string[];
  errors: string[];
}
