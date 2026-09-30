import { describe, it, expect } from 'vitest';
import { applyLaborAggregatesToJobs, calculateLaborAggregates } from '../../services/domain/laborAggregatesService';
import type { Job, TimeEntry, Settlement, Employee } from '../../models/types';

describe('Production laborAggregatesService - Zeroing on Deletion & Accurate Aggregation', () => {
    it('applyLaborAggregatesToJobs resets actualLaborHours, costs and stages to 0 when entries are deleted', () => {
        const mockJob = {
            id: 'job-1',
            jobCode: 'J-001',
            clientId: 'c1',
            clientName: 'Klient 1',
            name: 'Montaż stolarki',
            status: 'in_progress',
            location: 'Warszawa',
            createdAt: '2026-09-01',
            updatedAt: '2026-09-01',
            actualLaborHours: 35,
            actualLaborCost: 1575,
            settledLaborCost: 1200,
            stages: [
                {
                    id: 'stage-1',
                    jobId: 'job-1',
                    name: 'Etap 1',
                    type: 'podstawowy',
                    status: 'w_toku',
                    plannedRevenueNet: 5000,
                    actualLaborHours: 35,
                    actualLaborCost: 1575,
                    billingType: 'hourly'
                }
            ]
        } as unknown as Job;

        // When all time entries are deleted, calculateLaborAggregates returns empty maps
        const emptyJobAggregates = new Map();
        const emptyStageAggregates = new Map();

        const { updatedJobs, changedJobs } = applyLaborAggregatesToJobs(
            [mockJob],
            emptyJobAggregates,
            emptyStageAggregates
        );

        expect(changedJobs).toHaveLength(1);
        expect(updatedJobs[0].actualLaborHours).toBe(0);
        expect(updatedJobs[0].actualLaborCost).toBe(0);
        expect(updatedJobs[0].settledLaborCost).toBe(0);
        expect(updatedJobs[0].stages![0].actualLaborHours).toBe(0);
        expect(updatedJobs[0].stages![0].actualLaborCost).toBe(0);
    });

    it('calculateLaborAggregates accurately calculates labor and settled costs from approved time entries and contracts', () => {
        const employees = [
            { id: 'emp-1', type: 'employee', firstName: 'Jan', lastName: 'Kowalski', role: 'foreman', isActive: true, hourlyRate: 50 }
        ] as unknown as Employee[];

        const timeEntries = [
            {
                id: 'te-1',
                employeeId: 'emp-1',
                jobId: 'job-1',
                jobCode: 'J-001',
                jobName: 'Montaż stolarki',
                stageId: 'stage-1',
                stageName: 'Etap 1',
                date: '2026-09-20',
                hours: 8,
                status: 'approved',
                billingType: 'hourly',
                settlementId: 'settle-1',
                cost: 400,
                createdAt: '2026-09-20',
                updatedAt: '2026-09-20'
            }
        ] as unknown as TimeEntry[];

        const settlements = [
            {
                id: 'settle-1',
                workerId: 'emp-1',
                workerType: 'employee',
                type: 'hourly',
                status: 'closed', // closed => settled
                totalAmount: 400,
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30'
            }
        ] as unknown as Settlement[];

        const { jobAggregates, stageAggregates } = calculateLaborAggregates(timeEntries, settlements, employees);

        const job1Agg = jobAggregates.get('job-1');
        expect(job1Agg).toBeDefined();
        expect(job1Agg?.hours).toBe(8);
        expect(job1Agg?.cost).toBe(400);
        expect(job1Agg?.settledCost).toBe(400);

        const stage1Agg = stageAggregates.get('stage-1');
        expect(stage1Agg).toBeDefined();
        expect(stage1Agg?.hours).toBe(8);
        expect(stage1Agg?.cost).toBe(400);
    });
});
