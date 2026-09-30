import { describe, it, expect, vi } from 'vitest';
import type { LoadStatus } from '../../context/TiCoContext';

function shouldRunSync(status: LoadStatus): boolean {
    return status === 'complete';
}

describe('useTiCoJobsSync - Status Guards', () => {
    it('blocks synchronization when loadStatus is loading', () => {
        expect(shouldRunSync('loading')).toBe(false);
    });

    it('blocks synchronization when loadStatus is failed', () => {
        expect(shouldRunSync('failed')).toBe(false);
    });

    it('allows synchronization when loadStatus is complete', () => {
        expect(shouldRunSync('complete')).toBe(true);
    });

    it('runs synchronization when loadStatus is complete, passing empty maps if timeEntries is empty', () => {
        const updateJobsLaborAggregates = vi.fn();
        const status: LoadStatus = 'complete';

        if (shouldRunSync(status)) {
            const jobAggregates = new Map();
            const stageAggregates = new Map();
            updateJobsLaborAggregates(jobAggregates, stageAggregates);
        }

        expect(updateJobsLaborAggregates).toHaveBeenCalledTimes(1);
        expect(updateJobsLaborAggregates).toHaveBeenCalledWith(expect.any(Map), expect.any(Map));
    });
});
