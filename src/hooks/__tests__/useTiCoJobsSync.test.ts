import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTiCoJobsSync } from '../useTiCoJobsSync';
import { useTiCo } from '../../context/TiCoContext';
import { useJobs } from '../../context/JobsContext';

vi.mock('../../context/TiCoContext');
vi.mock('../../context/JobsContext');

describe('useTiCoJobsSync - Production Hook Guard Tests', () => {
    const mockUpdateJobsLaborAggregates = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        (useJobs as any).mockReturnValue({
            updateJobsLaborAggregates: mockUpdateJobsLaborAggregates
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('blocks synchronization when loadStatus is loading', () => {
        (useTiCo as any).mockReturnValue({
            timeEntries: [],
            settlements: [],
            employees: [],
            loadStatus: 'loading'
        });

        renderHook(() => useTiCoJobsSync());

        act(() => {
            vi.advanceTimersByTime(2000);
        });

        expect(mockUpdateJobsLaborAggregates).not.toHaveBeenCalled();
    });

    it('blocks synchronization when loadStatus is failed', () => {
        (useTiCo as any).mockReturnValue({
            timeEntries: [],
            settlements: [],
            employees: [],
            loadStatus: 'failed'
        });

        renderHook(() => useTiCoJobsSync());

        act(() => {
            vi.advanceTimersByTime(2000);
        });

        expect(mockUpdateJobsLaborAggregates).not.toHaveBeenCalled();
    });

    it('executes synchronization when loadStatus is complete, passing empty maps if timeEntries is empty', () => {
        (useTiCo as any).mockReturnValue({
            timeEntries: [],
            settlements: [],
            employees: [],
            loadStatus: 'complete'
        });

        renderHook(() => useTiCoJobsSync());

        act(() => {
            vi.advanceTimersByTime(1500); // Exceed 1s debounce
        });

        expect(mockUpdateJobsLaborAggregates).toHaveBeenCalledTimes(1);
        const [jobAggs, stageAggs] = mockUpdateJobsLaborAggregates.mock.calls[0];
        expect(jobAggs.size).toBe(0);
        expect(stageAggs.size).toBe(0);
    });
});
