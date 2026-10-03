import { describe, it, expect } from 'vitest';
import {
    JOB_STATUSES as MODEL_JOB_STATUSES,
    JOB_STAGE_STATUSES as MODEL_STAGE_STATUSES,
    JOB_STAGE_TYPES as MODEL_STAGE_TYPES,
    JOB_BILLING_TYPES as MODEL_BILLING_TYPES,
    JOB_RISK_FLAGS as MODEL_RISK_FLAGS,
    JOB_PRIORITIES as MODEL_PRIORITIES,
    type Job,
    type JobStage,
    type JobStatus,
    type JobStageStatus
} from '../../../models/types';

import {
    JOB_SCHEMA,
    JOB_STATUSES as CONTRACT_JOB_STATUSES,
    JOB_STAGE_STATUSES as CONTRACT_STAGE_STATUSES,
    JOB_STAGE_TYPES as CONTRACT_STAGE_TYPES,
    JOB_BILLING_TYPES as CONTRACT_BILLING_TYPES,
    JOB_RISK_FLAGS as CONTRACT_RISK_FLAGS,
    JOB_PRIORITIES as CONTRACT_PRIORITIES,
    type JobPostPayload,
    type JobPatchPayload,
    type JobPaginatedResponse
} from '../../../../shared/contracts';

describe('Shared Contracts: Job Frontend Type and Status Conformity', () => {
    it('re-exports identical single-source-of-truth status arrays from shared/contracts in types.ts', () => {
        expect(MODEL_JOB_STATUSES).toEqual(CONTRACT_JOB_STATUSES);
        expect(MODEL_JOB_STATUSES).toEqual(['draft', 'planned', 'in_progress', 'paused', 'done', 'cancelled']);

        expect(MODEL_STAGE_STATUSES).toEqual(CONTRACT_STAGE_STATUSES);
        expect(MODEL_STAGE_STATUSES).toEqual(['planowany', 'w_toku', 'zakończony', 'anulowany']);

        expect(MODEL_STAGE_TYPES).toEqual(CONTRACT_STAGE_TYPES);
        expect(MODEL_STAGE_TYPES).toEqual(['podstawowy', 'dodatkowy']);

        expect(MODEL_BILLING_TYPES).toEqual(CONTRACT_BILLING_TYPES);
        expect(MODEL_BILLING_TYPES).toEqual(['hourly', 'fixed', 'm2', 'mb']);

        expect(MODEL_RISK_FLAGS).toEqual(CONTRACT_RISK_FLAGS);
        expect(MODEL_RISK_FLAGS).toEqual(['none', 'delay', 'overbudget', 'scope_change']);

        expect(MODEL_PRIORITIES).toEqual(CONTRACT_PRIORITIES);
        expect(MODEL_PRIORITIES).toEqual(['low', 'normal', 'high']);
    });

    it('validates schema definition integrity directly from job.schema.json without drift', () => {
        expect(JOB_SCHEMA.definitions.JobStatus.enum).toEqual([...MODEL_JOB_STATUSES]);
        expect(JOB_SCHEMA.definitions.JobStageStatus.enum).toEqual([...MODEL_STAGE_STATUSES]);
        expect(JOB_SCHEMA.definitions.JobStageType.enum).toEqual([...MODEL_STAGE_TYPES]);
        expect(JOB_SCHEMA.definitions.JobBillingType.enum).toEqual([...MODEL_BILLING_TYPES]);
        expect(JOB_SCHEMA.definitions.JobRiskFlag.enum).toEqual([...MODEL_RISK_FLAGS]);
        expect(JOB_SCHEMA.definitions.JobPriority.enum).toEqual([...MODEL_PRIORITIES]);

        // JobPostPayload requires name and clientId
        expect(JOB_SCHEMA.definitions.JobPostPayload.required).toContain('name');
        expect(JOB_SCHEMA.definitions.JobPostPayload.required).toContain('clientId');

        // Batch import requires items
        expect(JOB_SCHEMA.definitions.JobBatchImportPayload.required).toContain('items');

        // Paginated envelope requires data and pagination
        expect(JOB_SCHEMA.definitions.JobPaginatedResponse.required).toContain('data');
        expect(JOB_SCHEMA.definitions.JobPaginatedResponse.required).toContain('pagination');
    });

    it('typechecks compliant Job and JobStage objects with valid statuses and budget fields', () => {
        const stage: JobStage = {
            id: 'stage-1',
            jobId: 'job-1',
            name: 'Etap montażu',
            type: 'podstawowy',
            status: 'planowany',
            plannedRevenueNet: 50000,
            plannedCostNet: 30000,
            billingType: 'hourly',
            plannedLaborHours: 120,
            plannedLaborCost: 7200
        };

        expect(stage.status).toBe('planowany');
        expect(MODEL_STAGE_STATUSES.includes(stage.status)).toBe(true);

        const job: Job = {
            id: 'job-1',
            jobCode: 'JOB-2026-001',
            editVersion: 1,
            name: 'Montaż fasad',
            clientId: 'client-1',
            clientName: 'Inwestor Sp. z o.o.',
            status: 'planned',
            priority: 'high',
            location: 'Kraków',
            riskFlag: 'none',
            revenuePlannedNet: 100000,
            stages: [stage],
            createdAt: '2026-10-01T08:00:00Z',
            updatedAt: '2026-10-01T08:00:00Z'
        };

        expect(job.status).toBe('planned');
        expect(job.editVersion).toBe(1);
        expect(MODEL_JOB_STATUSES.includes(job.status)).toBe(true);
    });

    it('typechecks JobPostPayload and JobPatchPayload contracts', () => {
        const postPayload: JobPostPayload = {
            name: 'Nowe zlecenie produkcyjne',
            clientId: 'client-101',
            priority: 'normal',
            status: 'planned',
            plannedStartDate: '2026-11-01',
            revenuePlannedNet: 200000
        };
        expect(postPayload.name).toBe('Nowe zlecenie produkcyjne');
        expect(postPayload.clientId).toBe('client-101');

        const patchPayload: JobPatchPayload = {
            expectedVersion: 1,
            priority: 'high',
            status: 'in_progress'
        };
        expect(patchPayload.status).toBe('in_progress');
        expect(patchPayload.expectedVersion).toBe(1);
    });

    it('enforces optimistic locking contract: Job requires editVersion, JobPatchPayload requires expectedVersion', () => {
        // 1. Poprawny Job w schemacie zawiera editVersion
        expect(JOB_SCHEMA.definitions.Job.required).toContain('editVersion');
        expect(JOB_SCHEMA.definitions.Job.properties.editVersion.type).toBe('integer');
        expect(JOB_SCHEMA.definitions.Job.properties.editVersion.minimum).toBe(1);

        // 2. PATCH bez expectedVersion jest niezgodny ze schematem
        expect(JOB_SCHEMA.definitions.JobPatchPayload.required).toContain('expectedVersion');
        expect(JOB_SCHEMA.definitions.JobPatchPayload.properties.expectedVersion.type).toBe('integer');
        expect(JOB_SCHEMA.definitions.JobPatchPayload.properties.expectedVersion.minimum).toBe(1);

        // 3. editVersion przesłane w POST/PATCH jako zwykła zmiana jest odrzucane przez schemat
        expect(JOB_SCHEMA.definitions.JobPatchPayload.not).toEqual({
            required: ['editVersion']
        });
        expect(JOB_SCHEMA.definitions.JobPostPayload.not).toEqual({
            anyOf: [
                { required: ['editVersion'] },
                { required: ['expectedVersion'] }
            ]
        });
    });

    it('differentiates editVersion on Job from expectedVersion on JobPatchPayload at generated TypeScript level', () => {
        // 1. Job (models/types.ts) strictly defines editVersion, and strictly lacks expectedVersion
        type JobKeys = keyof Job;
        const jobHasEditVersion: 'editVersion' extends JobKeys ? true : false = true;
        const jobLacksExpectedVersion: 'expectedVersion' extends JobKeys ? false : true = true;
        expect(jobHasEditVersion).toBe(true);
        expect(jobLacksExpectedVersion).toBe(true);

        // 2. JobPatchPayload (shared/contracts/job.generated.ts) explicitly requires expectedVersion: number
        const patchHasExpectedVersion: JobPatchPayload['expectedVersion'] extends number ? true : false = true;
        // editVersion is not a declared member of JobPatchPayload, falling back to index signature 'unknown'
        const patchLacksEditVersion: JobPatchPayload['editVersion'] extends number ? false : true = true;
        expect(patchHasExpectedVersion).toBe(true);
        expect(patchLacksEditVersion).toBe(true);

        // 3. JobPostPayload (shared/contracts/job.generated.ts) has neither editVersion nor expectedVersion
        const postLacksEditVersion: JobPostPayload['editVersion'] extends number ? false : true = true;
        const postLacksExpectedVersion: JobPostPayload['expectedVersion'] extends number ? false : true = true;
        expect(postLacksEditVersion).toBe(true);
        expect(postLacksExpectedVersion).toBe(true);
    });
});
