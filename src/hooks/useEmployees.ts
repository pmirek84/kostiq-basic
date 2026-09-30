import { useJobs } from '../context/JobsContext';
import { useTiCo } from '../context/TiCoContext';
import { useMemo } from 'react';

export function useEmployees() {
    const { jobs } = useJobs();
    const { employees: contextEmployees } = useTiCo();

    const employees = useMemo(() => {
        const set = new Set<string>();
        // Add from official employee list
        contextEmployees.forEach(e => {
            const fullName = `${e.firstName || ''} ${e.lastName || ''}`.trim() || (e as any).name;
            if (fullName) set.add(fullName);
        });
        // Add from jobs planned team (if they are names)
        jobs.forEach(j => j.plannedTeam?.forEach(m => set.add(m)));
        return Array.from(set).sort();
    }, [jobs, contextEmployees]);

    return { employees };
}
