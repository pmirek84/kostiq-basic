import { useJobs } from '../context/JobsContext';
import { useTimeTracking } from '../context/TimeTrackingContext';
import { useMemo } from 'react';

export function useEmployees() {
    const { jobs } = useJobs();
    const { employees: contextEmployees } = useTimeTracking();

    const employees = useMemo(() => {
        const set = new Set<string>();
        // Add from official employee list
        contextEmployees.forEach(e => set.add(e.name));
        // Add from jobs planned team (if they are names)
        jobs.forEach(j => j.plannedTeam?.forEach(m => set.add(m)));
        return Array.from(set).sort();
    }, [jobs, contextEmployees]);

    return { employees };
}
