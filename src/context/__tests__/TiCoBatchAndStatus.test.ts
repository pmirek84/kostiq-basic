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

    it('executeImportTimeEntries updates existing records on re-import, preserving original createdAt', async () => {
        const mockRepo = {
            createTimeEntry: vi.fn(),
            updateTimeEntry: vi.fn().mockImplementation(async (id, data) => ({ ...data, id }))
        };

        const originalCreatedAt = '2026-08-15T10:00:00.000Z';
        const existingEntries = [
            { id: 't1', hours: 4, date: '2026-09-01', createdAt: originalCreatedAt }
        ] as TimeEntry[];

        // Re-imported entry without createdAt or with new date
        const reimportedEntries = [
            { id: 't1', hours: 8, date: '2026-09-01' } // same ID, updated hours, no createdAt in file
        ] as TimeEntry[];

        const { result, savedEntries } = await executeImportTimeEntries(reimportedEntries, existingEntries, mockRepo as any);

        expect(result.succeeded).toBe(1);
        expect(result.failed).toBe(0);
        // Verified: updateTimeEntry was called instead of createTimeEntry
        expect(mockRepo.updateTimeEntry).toHaveBeenCalledWith('t1', expect.objectContaining({
            id: 't1',
            hours: 8,
            createdAt: originalCreatedAt
        }));
        expect(mockRepo.createTimeEntry).not.toHaveBeenCalled();
        expect(savedEntries[0].hours).toBe(8);
        expect(savedEntries[0].createdAt).toBe(originalCreatedAt);
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
    it('executeImportTimeEntries uses repository.batchImportTimeEntries when available, preserving createdAt and returning results', async () => {
        const mockRepo = {
            createTimeEntry: vi.fn(),
            updateTimeEntry: vi.fn(),
            batchImportTimeEntries: vi.fn().mockResolvedValue({
                succeeded: 2,
                failed: 0,
                errors: []
            })
        };

        const existingEntries = [
            { id: 't1', createdAt: '2026-05-01T12:00:00.000Z' }
        ] as TimeEntry[];

        const entriesToImport = [
            { id: 't1', hours: 6, date: '2026-09-01' },
            { id: 't2', hours: 8, date: '2026-09-02' }
        ] as TimeEntry[];

        const { result, savedEntries } = await executeImportTimeEntries(entriesToImport, existingEntries, mockRepo as any);

        expect(mockRepo.batchImportTimeEntries).toHaveBeenCalledTimes(1);
        expect(mockRepo.createTimeEntry).not.toHaveBeenCalled();
        expect(mockRepo.updateTimeEntry).not.toHaveBeenCalled();

        expect(result.succeeded).toBe(2);
        expect(result.failed).toBe(0);
        expect(savedEntries.length).toBe(2);
        expect(savedEntries[0].createdAt).toBe('2026-05-01T12:00:00.000Z');
        expect(savedEntries[1].createdAt).toBeDefined();
    });
});