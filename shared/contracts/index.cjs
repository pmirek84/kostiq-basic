const timeEntrySchema = require('./timeEntry.schema.json');

const TIME_ENTRY_STATUSES = Object.freeze([...timeEntrySchema.definitions.TimeEntryStatus.enum]);
const WORKER_ALLOWED_TIME_ENTRY_STATUSES = Object.freeze([...timeEntrySchema.definitions.WorkerAllowedStatus.enum]);
const FOREMAN_ALLOWED_TIME_ENTRY_STATUSES = Object.freeze([...timeEntrySchema.definitions.ForemanAllowedStatus.enum]);
const BILLING_TYPES = Object.freeze([...timeEntrySchema.definitions.BillingType.enum]);
const TIME_ENTRY_TYPES = Object.freeze([...timeEntrySchema.definitions.TimeEntryType.enum]);
const ACTIVITY_TYPES = Object.freeze([...timeEntrySchema.definitions.ActivityType.enum]);
const WORKER_TYPES = Object.freeze([...timeEntrySchema.definitions.WorkerType.enum]);

module.exports = {
  timeEntrySchema,
  TIME_ENTRY_STATUSES,
  WORKER_ALLOWED_TIME_ENTRY_STATUSES,
  FOREMAN_ALLOWED_TIME_ENTRY_STATUSES,
  BILLING_TYPES,
  TIME_ENTRY_TYPES,
  ACTIVITY_TYPES,
  WORKER_TYPES
};