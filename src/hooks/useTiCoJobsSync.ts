import { useEffect, useRef } from 'react';
import { useTiCo } from '../context/TiCoContext';
import { useJobs } from '../context/JobsContext';

export const useTiCoJobsSync = () => {
    const { timeEntries, settlements, employees } = useTiCo();
    const { updateJobsLaborAggregates } = useJobs();

    // Debounce reference to avoid too frequent updates if timeEntries change rapidly
    const timeoutRef = useRef<any>(null);

    useEffect(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            const jobAggregates = new Map<string, { hours: number; cost: number; settledCost: number }>();
            const stageAggregates = new Map<string, { hours: number; cost: number }>();

            const settlementStatusMap = new Map<string, string>();
            settlements.forEach(s => settlementStatusMap.set(s.id, s.status));

            // Helper to get cost for entry
            const getEntryCost = (entry: any) => {
                if (entry.cost !== undefined && entry.cost !== null) return entry.cost;

                // Fallback: calculate if possible
                if (entry.employeeId || entry.employee_id) {
                    const empId = entry.employeeId || entry.employee_id;
                    const emp = employees.find(e => e.id === empId);
                    if (emp) {
                        const bType = entry.billingType || 'hourly';
                        if (bType === 'hourly') {
                            return (entry.hours || 0) * (emp.hourlyRate || 0);
                        } else if (bType === 'daily') {
                            return (entry.hours || 0) * (emp.dailyRate || 0);
                        } else if (bType === 'project') {
                            return emp.projectRate || 0;
                        }
                    }
                }
                return 0;
            };

            timeEntries.forEach(entry => {
                // TiCoContext ensures status is one of the valid TimeEntryStatus values
                // We only count 'approved' entries for Actuals
                if (entry.status === 'approved' || entry.status === 'admin_approved') {
                    const entryCost = getEntryCost(entry);

                    // Determine if settled
                    let isSettled = false;
                    if (entry.settlementId) {
                        const status = settlementStatusMap.get(entry.settlementId);
                        if (status === 'closed' || status === 'exported') {
                            isSettled = true;
                        }
                    }

                    // Job Aggregation
                    const currentJob = jobAggregates.get(entry.jobId) || { hours: 0, cost: 0, settledCost: 0 };
                    jobAggregates.set(entry.jobId, {
                        hours: currentJob.hours + (entry.hours || 0),
                        cost: currentJob.cost + entryCost,
                        settledCost: currentJob.settledCost + (isSettled ? entryCost : 0)
                    });

                    // Stage Aggregation
                    if (entry.stageId) {
                        const currentStage = stageAggregates.get(entry.stageId) || { hours: 0, cost: 0 };
                        stageAggregates.set(entry.stageId, {
                            hours: currentStage.hours + (entry.hours || 0),
                            cost: currentStage.cost + entryCost
                        });
                    }
                }
            });

            // Contract Settlements Aggregation
            settlements.forEach(settlement => {
                if (settlement.type === 'contract' && settlement.jobId) {
                    const isSettled = settlement.status === 'closed' || settlement.status === 'exported';
                    const amount = settlement.totalAmount || 0;

                    // Job Aggregation
                    const currentJob = jobAggregates.get(settlement.jobId) || { hours: 0, cost: 0, settledCost: 0 };
                    jobAggregates.set(settlement.jobId, {
                        hours: currentJob.hours, // Contracts don't necessarily track hours in the same bucket
                        cost: currentJob.cost + amount,
                        settledCost: currentJob.settledCost + (isSettled ? amount : 0)
                    });

                    // Stage Aggregation
                    if (settlement.stageId) {
                        const currentStage = stageAggregates.get(settlement.stageId) || { hours: 0, cost: 0 };
                        stageAggregates.set(settlement.stageId, {
                            hours: currentStage.hours,
                            cost: currentStage.cost + amount
                        });
                    }
                }
            });

            console.log('Syncing TiCo -> Jobs:', { jobAggregates, stageAggregates });
            updateJobsLaborAggregates(jobAggregates, stageAggregates);

        }, 1000); // Debounce 1s

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [timeEntries, settlements, updateJobsLaborAggregates]);
};
