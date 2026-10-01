import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTiCoJobsSync } from '../useTiCoJobsSync';
import { useTiCo } from '../../context/TiCoContext';
import { useJobs } from '../../context/JobsContext';

vi.mock('../../context/TiCoContext');
vi.mock('../../context/JobsContext');

describe('useTiCoJobsSync - UI Invalidation Guard Tests', () => {
    const mockRefreshJobs = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        (useJobs as any).mockReturnValue({
            refreshJobs: mockRefreshJobs
        });
    });

    it('does not call refreshJobs on initial mount (prevents startup double-fetch)', () => {
        (useTiCo as any).mockReturnValue({
            mutationRevision: 0
        });

        renderHook(() => useTiCoJobsSync());

        expect(mockRefreshJobs).not.toHaveBeenCalled();
    });

    it('triggers exactly one refreshJobs call when mutationRevision increases', () => {
        let currentRevision = 0;
        (useTiCo as any).mockImplementation(() => ({
            mutationRevision: currentRevision
        }));

        const { rerender } = renderHook(() => useTiCoJobsSync());
        expect(mockRefreshJobs).not.toHaveBeenCalled();

        // Simulate TiCo mutation: mutationRevision increments
        currentRevision = 1;
        rerender();

        expect(mockRefreshJobs).toHaveBeenCalledTimes(1);

        // Re-render with unchanged mutationRevision
        rerender();
        expect(mockRefreshJobs).toHaveBeenCalledTimes(1);

        // Next mutation
        currentRevision = 2;
        rerender();
        expect(mockRefreshJobs).toHaveBeenCalledTimes(2);
    });
});
