import type { Job, TimeEntry, Settlement, Employee } from '../../models/types';

export interface JobLaborAggregates {
    hours: number;
    cost: number;
    settledCost: number;
}

export interface StageLaborAggregates {
    hours: number;
    cost: number;
}

/**
 * Calculates labor aggregates per job and per stage from time entries and settlements.
 */
export function calculateLaborAggregates(
    timeEntries: TimeEntry[],
    settlements: Settlement[],
    employees: Employee[]
): {
    jobAggregates: Map<string, JobLaborAggregates>;
    stageAggregates: Map<string, StageLaborAggregates>;
} {
    const jobAggregates = new Map<string, JobLaborAggregates>();
    const stageAggregates = new Map<string, StageLaborAggregates>();

    const settlementStatusMap = new Map<string, string>();
    settlements.forEach(s => settlementStatusMap.set(s.id, s.status));

    const getEntryCost = (entry: any) => {
        if (entry.cost !== undefined && entry.cost !== null) return entry.cost;
        const empId = entry.employeeId || entry.employee_id;
        if (empId) {
            const emp = employees.find(e => e.id === empId);
            if (emp) {
                const bType = entry.billingType || 'hourly';
                if (bType === 'hourly') return (entry.hours || 0) * (emp.hourlyRate || 0);
                if (bType === 'daily') return (entry.hours || 0) * (emp.dailyRate || 0);
                if (bType === 'project') return emp.projectRate || 0;
            }
        }
        return 0;
    };

    timeEntries.forEach(entry => {
        if (entry.status === 'approved' || entry.status === 'admin_approved') {
            const entryCost = getEntryCost(entry);
            let isSettled = false;
            if (entry.settlementId) {
                const status = settlementStatusMap.get(entry.settlementId);
                if (status === 'closed' || status === 'exported') {
                    isSettled = true;
                }
            }

            const currentJob = jobAggregates.get(entry.jobId) || { hours: 0, cost: 0, settledCost: 0 };
            jobAggregates.set(entry.jobId, {
                hours: currentJob.hours + (entry.hours || 0),
                cost: currentJob.cost + entryCost,
                settledCost: currentJob.settledCost + (isSettled ? entryCost : 0)
            });

            if (entry.stageId) {
                const currentStage = stageAggregates.get(entry.stageId) || { hours: 0, cost: 0 };
                stageAggregates.set(entry.stageId, {
                    hours: currentStage.hours + (entry.hours || 0),
                    cost: currentStage.cost + entryCost
                });
            }
        }
    });

    settlements.forEach(settlement => {
        if (settlement.type === 'contract' && settlement.jobId) {
            const isSettled = settlement.status === 'closed' || settlement.status === 'exported';
            const amount = settlement.totalAmount || 0;

            const currentJob = jobAggregates.get(settlement.jobId) || { hours: 0, cost: 0, settledCost: 0 };
            jobAggregates.set(settlement.jobId, {
                hours: currentJob.hours,
                cost: currentJob.cost + amount,
                settledCost: currentJob.settledCost + (isSettled ? amount : 0)
            });

            if (settlement.stageId) {
                const currentStage = stageAggregates.get(settlement.stageId) || { hours: 0, cost: 0 };
                stageAggregates.set(settlement.stageId, {
                    hours: currentStage.hours,
                    cost: currentStage.cost + amount
                });
            }
        }
    });

    return { jobAggregates, stageAggregates };
}

/**
 * Applies labor aggregates to a list of jobs, properly zeroing out values
 * when time entries/settlements are deleted or absent.
 */
export function applyLaborAggregatesToJobs(
    jobs: Job[],
    jobAggregates: Map<string, JobLaborAggregates>,
    stageAggregates: Map<string, StageLaborAggregates>
): { updatedJobs: Job[]; changedJobs: Job[] } {
    const updatedJobs: Job[] = [];
    const changedJobs: Job[] = [];

    for (const job of jobs) {
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

        updatedJobs.push(updatedJob);
        if (hasChanges) {
            changedJobs.push(updatedJob);
        }
    }

    return { updatedJobs, changedJobs };
}
