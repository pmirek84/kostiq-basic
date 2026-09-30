import { describe, it, expect } from 'vitest';
import {
    TIME_ENTRY_STATUSES as MODEL_STATUSES,
    WORKER_ALLOWED_TIME_ENTRY_STATUSES as MODEL_WORKER_STATUSES,
    FOREMAN_ALLOWED_TIME_ENTRY_STATUSES as MODEL_FOREMAN_STATUSES,
    BILLING_TYPES as MODEL_BILLING_TYPES,
    TIME_ENTRY_TYPES as MODEL_TIME_ENTRY_TYPES,
    type TimeEntry,
    type TimeEntryStatus
} from '../../../models/types';

import {
    type CanonicalTimeEntryPostPayload,
    type TimeEntryPostPayload,
    TIME_ENTRY_STATUSES as CONTRACT_STATUSES,
    WORKER_ALLOWED_TIME_ENTRY_STATUSES as CONTRACT_WORKER_STATUSES,
    FOREMAN_ALLOWED_TIME_ENTRY_STATUSES as CONTRACT_FOREMAN_STATUSES,
    BILLING_TYPES as CONTRACT_BILLING_TYPES,
    TIME_ENTRY_TYPES as CONTRACT_TIME_ENTRY_TYPES,
    TIME_ENTRY_SCHEMA
} from '../../../../shared/contracts';

describe('Shared Contracts: TimeEntry Frontend Type and Status Conformity', () => {
    it('re-exports identical single-source-of-truth status arrays from shared/contracts in types.ts', () => {
        expect(MODEL_STATUSES).toEqual(CONTRACT_STATUSES);
        expect(MODEL_STATUSES).toHaveLength(9);
        expect(MODEL_STATUSES).toEqual([
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

        expect(MODEL_WORKER_STATUSES).toEqual(CONTRACT_WORKER_STATUSES);
        expect(MODEL_WORKER_STATUSES).toEqual(['draft', 'pending', 'submitted']);

        expect(MODEL_FOREMAN_STATUSES).toEqual(CONTRACT_FOREMAN_STATUSES);
        expect(MODEL_FOREMAN_STATUSES).toEqual(['draft', 'pending', 'submitted', 'foreman_approved', 'foreman_rejected']);

        expect(MODEL_BILLING_TYPES).toEqual(CONTRACT_BILLING_TYPES);
        expect(MODEL_BILLING_TYPES).toEqual(['hourly', 'daily', 'project', 'fixed', 'm2', 'mb']);

        expect(MODEL_TIME_ENTRY_TYPES).toEqual(CONTRACT_TIME_ENTRY_TYPES);
        expect(MODEL_TIME_ENTRY_TYPES).toEqual(['drive', 'work', 'other', 'employee', 'subcontractor']);
    });

    it('validates schema definition integrity directly from timeEntry.schema.json without drift', () => {
        // Assert runtime schema matches exported contract arrays directly
        expect(TIME_ENTRY_SCHEMA.definitions.TimeEntryStatus.enum).toEqual([...MODEL_STATUSES]);
        expect(TIME_ENTRY_SCHEMA.definitions.BillingType.enum).toEqual([...MODEL_BILLING_TYPES]);
        expect(TIME_ENTRY_SCHEMA.definitions.TimeEntryType.enum).toEqual([...MODEL_TIME_ENTRY_TYPES]);

        // Batch import schema requires items array
        expect(TIME_ENTRY_SCHEMA.definitions.TimeEntryBatchImportPayload.required).toContain('items');
        expect(TIME_ENTRY_SCHEMA.definitions.TimeEntryBatchImportPayload.properties).toHaveProperty('items');
    });

    it('typechecks a compliant TimeEntry object with valid domain status and billingType (including daily and project)', () => {
        const hourlyEntry: TimeEntry = {
            id: 'test-te-1',
            employeeId: 'emp-1',
            employeeName: 'Jan Kowalski',
            jobId: 'job-1',
            jobCode: 'JOB-2026-01',
            jobName: 'Montaż Witryn',
            stageId: 'stage-1',
            stageName: 'Montaż',
            date: '2026-09-30T10:00:00Z',
            hours: 8,
            billingType: 'hourly',
            hourlyRate: 60,
            cost: 480,
            description: 'Montaż stolarki',
            status: 'submitted',
            createdAt: '2026-09-30T10:00:00Z',
            updatedAt: '2026-09-30T10:00:00Z'
        };

        expect(hourlyEntry.status).toBe('submitted');
        expect(MODEL_STATUSES.includes(hourlyEntry.status)).toBe(true);

        const dailyEntry: TimeEntry = {
            ...hourlyEntry,
            id: 'test-te-daily',
            billingType: 'daily',
            hours: 1, // 1 day
            cost: 450
        };
        expect(dailyEntry.billingType).toBe('daily');

        const projectEntry: TimeEntry = {
            ...hourlyEntry,
            id: 'test-te-project',
            billingType: 'project',
            hours: 0,
            cost: 2500
        };
        expect(projectEntry.billingType).toBe('project');

        const allNineStatuses: TimeEntryStatus[] = [
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

        allNineStatuses.forEach(s => {
            expect(MODEL_STATUSES.includes(s)).toBe(true);
        });
    });
    it('verifies CanonicalTimeEntryPostPayload and TimeEntryPostPayload contract requirement', () => {
        // Canonical payload requires employeeId and jobId
        const canonical: CanonicalTimeEntryPostPayload = {
            employeeId: 'emp-101',
            jobId: 'job-202',
            hours: 8,
            billingType: 'hourly'
        };
        expect(canonical.employeeId).toBe('emp-101');
        expect(canonical.jobId).toBe('job-202');

        // TimeEntryPostPayload accepts canonical as well as legacy alias variants
        const payloadAlias: TimeEntryPostPayload = {
            employee_id: 'emp-101',
            jobId: 'job-202',
            hours: 4
        };
        expect((payloadAlias as any).employee_id).toBe('emp-101');

        // Verify that schema definition requires both identifiers
        const canonicalDef = (TIME_ENTRY_SCHEMA.definitions as any).CanonicalTimeEntryPostPayload;
        expect(canonicalDef.required).toContain('employeeId');
        expect(canonicalDef.required).toContain('jobId');

        const postDef = (TIME_ENTRY_SCHEMA.definitions as any).TimeEntryPostPayload;
        expect(postDef.anyOf).toHaveLength(4);
        postDef.anyOf.forEach((variant: any) => {
            expect(variant.required.length).toBe(2);
        });
    });
});
