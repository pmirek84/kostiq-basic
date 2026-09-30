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
    TIME_ENTRY_STATUSES as CONTRACT_STATUSES,
    WORKER_ALLOWED_TIME_ENTRY_STATUSES as CONTRACT_WORKER_STATUSES,
    FOREMAN_ALLOWED_TIME_ENTRY_STATUSES as CONTRACT_FOREMAN_STATUSES,
    BILLING_TYPES as CONTRACT_BILLING_TYPES,
    TIME_ENTRY_TYPES as CONTRACT_TIME_ENTRY_TYPES
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
        expect(MODEL_TIME_ENTRY_TYPES).toEqual(CONTRACT_TIME_ENTRY_TYPES);
    });

    it('typechecks a compliant TimeEntry object with valid domain status and billingType', () => {
        const entry: TimeEntry = {
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

        expect(entry.status).toBe('submitted');
        expect(MODEL_STATUSES.includes(entry.status)).toBe(true);

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
});
