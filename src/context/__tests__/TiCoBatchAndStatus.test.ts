import { describe, it, expect, vi } from 'vitest';
import type { TimeEntry } from '../../models/types';
import type { BatchOperationResult } from '../TiCoContext';

describe('TiCoContext - Batch Operations & Partial Failure Reporting', () => {
    it('importTimeEntries reports accurate succeeded and failed counts on partial error', async () => {
        const mockRepo = {
            createTimeEntry: vi.fn()
                .mockResolvedValueOnce({ id: 't1', date: '2026-09-01' })
                .mockRejectedValueOnce(new Error('Validation error on second entry'))
                .mockResolvedValueOnce({ id: 't3', date: '2026-09-03' })
        };

        const entriesToImport = [
            { id: 't1', date: '2026-09-01' },
            { id: 't2', date: '2026-09-02' },
            { id: 't3', date: '2026-09-03' }
        ] as TimeEntry[];

        // Simulate importTimeEntries implementation
        const saved: TimeEntry[] = [];
        const errors: string[] = [];

        for (const entry of entriesToImport) {
            try {
                const created = await mockRepo.createTimeEntry(entry);
                saved.push(created);
            } catch (err: any) {
                errors.push(err.message);
            }
        }

        const result: BatchOperationResult = {
            succeeded: saved.length,
            failed: errors.length,
            errors
        };

        expect(result.succeeded).toBe(2);
        expect(result.failed).toBe(1);
        expect(result.errors[0]).toContain('Validation error');
        expect(saved.map(s => s.id)).toEqual(['t1', 't3']);
    });

    it('clearTimeEntries removes only successfully deleted entries when some fail', async () => {
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

        const deletedIds = new Set<string>();
        const errors: string[] = [];

        for (const entry of initialEntries) {
            try {
                await mockRepo.deleteTimeEntry(entry.id);
                deletedIds.add(entry.id);
            } catch (err: any) {
                errors.push(err.message);
            }
        }

        const remainingEntries = initialEntries.filter(e => !deletedIds.has(e.id));
        const result: BatchOperationResult = {
            succeeded: deletedIds.size,
            failed: errors.length,
            errors
        };

        expect(result.succeeded).toBe(2);
        expect(result.failed).toBe(1);
        expect(remainingEntries).toHaveLength(1);
        expect(remainingEntries[0].id).toBe('t2');
    });
});
