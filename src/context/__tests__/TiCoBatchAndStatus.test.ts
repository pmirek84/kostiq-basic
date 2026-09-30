import { describe, it, expect, vi } from 'vitest';
import { executeImportTimeEntries, executeClearTimeEntries } from '../../services/domain/timeTrackingBatchService';
import type { TimeEntry } from '../../models/types';

describe('Production timeTrackingBatchService - Partial Failure & Duplicate Prevention', () => {
    it('executeImportTimeEntries handles partial failure accurately and preserves succeeded records', async () => {
        const mockRepo = {
            createTimeEntry: vi.fn()
                .mockResolvedValueOnce({ id: 't1', date: '2026-09-01' })
                .mockRejectedValueOnce(new Error('Validation error on second entry'))
                .mockResolvedValueOnce({ id: 't3', date: '2026-09-03' }),
            updateTimeEntry: vi.fn()
        };

        const entriesToImport = [
            { id: 't1', date: '2026-09-01' },
            { id: 't2', date: '2026-09-02' },
            { id: 't3', date: '2026-09-03' }
        ] as TimeEntry[];

        const { result, savedEntries } = await executeImportTimeEntries(entriesToImport, [], mockRepo as any);

        expect(result.succeeded).toBe(2);
        expect(result.failed).toBe(1);
        expect(result.errors[0]).toContain('Validation error');
        expect(savedEntries.map(s => s.id)).toEqual(['t1', 't3']);
        expect(mockRepo.createTimeEntry).toHaveBeenCalledTimes(3);
    });

    it('executeImportTimeEntries updates existing records on re-import to prevent MongoDB duplicates', async () => {
        const mockRepo = {
            createTimeEntry: vi.fn(),
            updateTimeEntry: vi.fn().mockImplementation(async (id, data) => ({ ...data, id }))
        };

        const existingEntries = [
            { id: 't1', hours: 4, date: '2026-09-01' }
        ] as TimeEntry[];

        const reimportedEntries = [
            { id: 't1', hours: 8, date: '2026-09-01' } // same ID, updated hours
        ] as TimeEntry[];

        const { result, savedEntries } = await executeImportTimeEntries(reimportedEntries, existingEntries, mockRepo as any);

        expect(result.succeeded).toBe(1);
        expect(result.failed).toBe(0);
        // Verified: updateTimeEntry was called instead of createTimeEntry
        expect(mockRepo.updateTimeEntry).toHaveBeenCalledWith('t1', expect.objectContaining({ id: 't1', hours: 8 }));
        expect(mockRepo.createTimeEntry).not.toHaveBeenCalled();
        expect(savedEntries[0].hours).toBe(8);
    });

    it('executeClearTimeEntries removes only successfully deleted entries when some fail', async () => {
        const mockRepo = {
            deleteTimeEntry: vi.fn()
                .mockResolvedValueOnce(undefined) // t1 success
                .mockRejectedValueOnce(new Error('Network drop on t2')) // t2 failed
                .mockResolvedValueOnce(undefined) // t3 success
        };

        const initialEntries: TimeEntry[] = [
            { id: 't1' } as TimeEntry,
            { id: 't2' } as TimeEntry,
            { id: 't3' } as TimeEntry
        ];

        const { result, deletedIds } = await executeClearTimeEntries(initialEntries, mockRepo as any);

        expect(result.succeeded).toBe(2);
        expect(result.failed).toBe(1);
        expect(deletedIds.has('t1')).toBe(true);
        expect(deletedIds.has('t2')).toBe(false);
        expect(deletedIds.has('t3')).toBe(true);
    });
});
