import { useEffect, useRef } from 'react';
import { useTiCo } from '../context/TiCoContext';
import { useJobs } from '../context/JobsContext';

/**
 * Observes TiCoContext mutationRevision and invalidates/refreshes jobs state in UI.
 * Does not calculate or post aggregates from browser.
 * Ensures exactly one fetch per mutation with no re-render loops.
 */
export const useTiCoJobsSync = () => {
    const { mutationRevision } = useTiCo();
    const { refreshJobs } = useJobs();
    const refreshJobsRef = useRef(refreshJobs);
    refreshJobsRef.current = refreshJobs;
    const prevRevisionRef = useRef(mutationRevision);

    useEffect(() => {
        if (mutationRevision > prevRevisionRef.current) {
            prevRevisionRef.current = mutationRevision;
            refreshJobsRef.current();
        }
    }, [mutationRevision]);
};
