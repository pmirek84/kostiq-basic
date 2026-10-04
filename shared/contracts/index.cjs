const timeEntrySchema = require('./timeEntry.schema.json');
const jobSchema = require('./job.schema.json');
const offerSchema = require('./offer.schema.json');

const TIME_ENTRY_STATUSES = Object.freeze([...timeEntrySchema.definitions.TimeEntryStatus.enum]);
const WORKER_ALLOWED_TIME_ENTRY_STATUSES = Object.freeze([...timeEntrySchema.definitions.WorkerAllowedStatus.enum]);
const FOREMAN_ALLOWED_TIME_ENTRY_STATUSES = Object.freeze([...timeEntrySchema.definitions.ForemanAllowedStatus.enum]);
const BILLING_TYPES = Object.freeze([...timeEntrySchema.definitions.BillingType.enum]);
const TIME_ENTRY_TYPES = Object.freeze([...timeEntrySchema.definitions.TimeEntryType.enum]);
const ACTIVITY_TYPES = Object.freeze([...timeEntrySchema.definitions.ActivityType.enum]);
const WORKER_TYPES = Object.freeze([...timeEntrySchema.definitions.WorkerType.enum]);

const JOB_STATUSES = Object.freeze([...jobSchema.definitions.JobStatus.enum]);
const JOB_STAGE_STATUSES = Object.freeze([...jobSchema.definitions.JobStageStatus.enum]);
const JOB_STAGE_TYPES = Object.freeze([...jobSchema.definitions.JobStageType.enum]);
const JOB_BILLING_TYPES = Object.freeze([...jobSchema.definitions.JobBillingType.enum]);
const JOB_RISK_FLAGS = Object.freeze([...jobSchema.definitions.JobRiskFlag.enum]);
const JOB_PRIORITIES = Object.freeze([...jobSchema.definitions.JobPriority.enum]);

const OFFER_RECORD_KINDS = Object.freeze([...offerSchema.definitions.OfferRecordKind.enum]);
const OFFER_STATUSES = Object.freeze([...offerSchema.definitions.OfferStatus.enum]);
const OFFER_VAT_RATES = Object.freeze([...offerSchema.definitions.OfferVatRate.enum]);
const OFFER_DISCOUNT_TYPES = Object.freeze([...offerSchema.definitions.OfferDiscountType.enum]);

module.exports = {
  timeEntrySchema,
  TIME_ENTRY_STATUSES,
  WORKER_ALLOWED_TIME_ENTRY_STATUSES,
  FOREMAN_ALLOWED_TIME_ENTRY_STATUSES,
  BILLING_TYPES,
  TIME_ENTRY_TYPES,
  ACTIVITY_TYPES,
  WORKER_TYPES,

  jobSchema,
  offerSchema,
  OFFER_RECORD_KINDS,
  OFFER_STATUSES,
  OFFER_VAT_RATES,
  OFFER_DISCOUNT_TYPES,
  JOB_STATUSES,
  JOB_STAGE_STATUSES,
  JOB_STAGE_TYPES,
  JOB_BILLING_TYPES,
  JOB_RISK_FLAGS,
  JOB_PRIORITIES
};
