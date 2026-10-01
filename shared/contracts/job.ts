import schema from './job.schema.json';
export * from './job.generated';

import type {
  JobStatus,
  JobStageStatus,
  JobStageType,
  JobBillingType,
  JobRiskFlag,
  JobPriority
} from './job.generated';

export const JOB_SCHEMA = schema;

export const JOB_STATUSES: readonly JobStatus[] = Object.freeze([
  'draft',
  'planned',
  'in_progress',
  'paused',
  'done',
  'cancelled'
]);

export const JOB_STAGE_STATUSES: readonly JobStageStatus[] = Object.freeze([
  'planowany',
  'w_toku',
  'zakończony',
  'anulowany'
]);

export const JOB_STAGE_TYPES: readonly JobStageType[] = Object.freeze([
  'podstawowy',
  'dodatkowy'
]);

export const JOB_BILLING_TYPES: readonly JobBillingType[] = Object.freeze([
  'hourly',
  'fixed',
  'm2',
  'mb'
]);

export const JOB_RISK_FLAGS: readonly JobRiskFlag[] = Object.freeze([
  'none',
  'delay',
  'overbudget',
  'scope_change'
]);

export const JOB_PRIORITIES: readonly JobPriority[] = Object.freeze([
  'low',
  'normal',
  'high'
]);
