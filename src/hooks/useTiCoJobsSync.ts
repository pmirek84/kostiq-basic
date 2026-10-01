import { useEffect, useRef } from 'react';
import { useTiCo } from '../context/TiCoContext';
import { useJobs } from '../context/JobsContext';
import { calculateLaborAggregates } from '../services/domain/laborAggregatesService';

export const useTiCoJobsSync = () => {
    const { timeEntries, settlements, employees, loadStatus } = useTiCo();
    const { updateJobsLaborAggregates } = useJobs();

    const timeoutRef = useRef<any>(null);

    useEffect(() => {
        // CRITICAL GUARD: Only calculate and sync aggregates when data loading is completely and successfully finished.
        // Blocks on 'loading' or 'failed' to prevent wiping or corrupting jobs data.
        // Legitimate empty lists (complete + 0 entries) will properly recalculate/zero out costs.
        if (loadStatus !== 'complete') {
            return;
        }

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            const { jobAggregates, stageAggregates } = calculateLaborAggregates(timeEntries, settlements, employees);

            if (import.meta.env?.DEV) {
                console.log('TiCo client diagnostics:', { jobAggregates, stageAggregates });
            }
            updateJobsLaborAggregates(jobAggregates, stageAggregates);
        }, 1000); // Debounce 1s

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [timeEntries, settlements, employees, loadStatus, updateJobsLaborAggregates]);
};
