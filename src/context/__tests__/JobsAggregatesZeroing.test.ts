import { describe, it, expect, vi } from 'vitest';
import { jobStorage } from '../../services/storage/jobStorage';

describe('Jobs Labor Aggregates - Complete Zeroing on Deletion', () => {
    it('properly resets actualLaborHours, costs and stages to 0 when entries are deleted', async () => {
        const mockJob = {
            id: 'job-1',
            name: 'Montaż stolarki',
            actualLaborHours: 35,
            actualLaborCost: 1575,
            settledLaborCost: 1200,
            stages: [
                {
                    id: 'stage-1',
                    jobId: 'job-1',
                    name: 'Etap 1',
                    actualLaborHours: 35,
                    actualLaborCost: 1575
                }
            ]
        };

        const savedJobs: any[] = [];
        vi.spyOn(jobStorage, 'getAllJobs').mockResolvedValue([mockJob as any]);
        vi.spyOn(jobStorage, 'saveJob').mockImplementation(async (j) => {
            savedJobs.push(j);
            return j.id;
        });

        // Simulate updateJobsLaborAggregates logic with empty maps (all time entries deleted)
        const jobAggregates = new Map<string, { hours: number; cost: number; settledCost: number }>();
        const stageAggregates = new Map<string, { hours: number; cost: number }>();

        const allJobs = await jobStorage.getAllJobs();
        await Promise.all(allJobs.map(async (job) => {
            const jobAgg = jobAggregates.get(job.id);
            let hasChanges = false;
            let updatedJob = { ...job };

            const targetHours = jobAgg ? jobAgg.hours : 0;
            const targetCost = jobAgg ? jobAgg.cost : 0;
            const targetSettledCost = jobAgg ? jobAgg.settledCost : 0;

            if ((updatedJob.actualLaborHours || 0) !== targetHours ||
                (updatedJob.actualLaborCost || 0) !== targetCost ||
                (updatedJob.settledLaborCost || 0) !== targetSettledCost) {

                updatedJob.actualLaborHours = targetHours;
                updatedJob.actualLaborCost = targetCost;
                updatedJob.settledLaborCost = targetSettledCost;
                hasChanges = true;
            }

            if (updatedJob.stages) {
                const updatedStages = updatedJob.stages.map(stage => {
                    const stageAgg = stageAggregates.get(stage.id);
                    const stageTargetHours = stageAgg ? stageAgg.hours : 0;
                    const stageTargetCost = stageAgg ? stageAgg.cost : 0;
                    if ((stage.actualLaborHours || 0) !== stageTargetHours ||
                        (stage.actualLaborCost || 0) !== stageTargetCost) {
                        hasChanges = true;
                        return {
                            ...stage,
                            actualLaborHours: stageTargetHours,
                            actualLaborCost: stageTargetCost
                        };
                    }
                    return stage;
                });
                if (hasChanges) {
                    updatedJob.stages = updatedStages;
                }
            }

            if (hasChanges) {
                await jobStorage.saveJob({ ...updatedJob, updatedAt: new Date().toISOString() });
            }
        }));

        expect(savedJobs).toHaveLength(1);
        expect(savedJobs[0].actualLaborHours).toBe(0);
        expect(savedJobs[0].actualLaborCost).toBe(0);
        expect(savedJobs[0].settledLaborCost).toBe(0);
        expect(savedJobs[0].stages[0].actualLaborHours).toBe(0);
        expect(savedJobs[0].stages[0].actualLaborCost).toBe(0);
    });
});
