import type { TimeEntry } from '../../models/types';
import type { TiCoRepository } from '../data/TiCoRepository';
import { v4 as uuidv4 } from 'uuid';

export type BatchOperationResult = {
    succeeded: number;
    failed: number;
    errors: string[];
};

/**
 * Imports time entries. When the repository implements batchImportTimeEntries,
 * it performs bulk upsert via the backend batch-import endpoint, preserving createdAt.
 * Otherwise falls back to sequential upserts.
 * Returns explicit operation counts and errors.
 */
export async function executeImportTimeEntries(
    entries: TimeEntry[],
    existingEntries: TimeEntry[],
    repository: Pick<TiCoRepository, 'createTimeEntry' | 'updateTimeEntry'> & {
        batchImportTimeEntries?: (entries: TimeEntry[]) => Promise<BatchOperationResult>;
    }
): Promise<{ result: BatchOperationResult; savedEntries: TimeEntry[] }> {
    const existingMap = new Map(existingEntries.map(e => [e.id, e]));
    const now = new Date().toISOString();

    const preparedEntries: TimeEntry[] = entries.map(entry => {
        const entryId = entry.id || uuidv4();
        const existing = existingMap.get(entryId);
        return {
            ...entry,
            id: entryId,
            createdAt: (existing && existing.createdAt) || entry.createdAt || now,
            updatedAt: now
        };
    });

    if (typeof repository.batchImportTimeEntries === 'function') {
        try {
            const batchResult = await repository.batchImportTimeEntries(preparedEntries);
            return {
                result: batchResult,
                savedEntries: batchResult.failed === 0 ? preparedEntries : preparedEntries.slice(0, batchResult.succeeded)
            };
        } catch (err: any) {
            console.warn('[executeImportTimeEntries] Batch import failed, falling back to sequential import:', err);
            // Fallback to sequential below
        }
    }

    const savedEntries: TimeEntry[] = [];
    const errors: string[] = [];

    for (const entryToSave of preparedEntries) {
        try {
            const existing = existingMap.get(entryToSave.id);
            let saved: TimeEntry;
            if (existing) {
                saved = await repository.updateTimeEntry(entryToSave.id, entryToSave);
            } else {
                saved = await repository.createTimeEntry(entryToSave);
                existingMap.set(entryToSave.id, saved || entryToSave);
            }
            savedEntries.push(saved || entryToSave);
        } catch (err: any) {
            const msg = err.message || `Błąd importu wpisu ${entryToSave.id || 'bez id'}`;
            console.error('Failed to import time entry', entryToSave, err);
            errors.push(msg);
        }
    }

    return {
        result: {
            succeeded: savedEntries.length,
            failed: errors.length,
            errors
        },
        savedEntries
    };
}

/**
 * Clears time entries by deleting them from the repository.
 * Only successfully deleted entries are identified so caller can safely update UI state.
 */
export async function executeClearTimeEntries(
    entries: TimeEntry[],
    repository: Pick<TiCoRepository, 'deleteTimeEntry'>
): Promise<{ result: BatchOperationResult; deletedIds: Set<string> }> {
    const deletedIds = new Set<string>();
    const errors: string[] = [];

    for (const entry of entries) {
        try {
            await repository.deleteTimeEntry(entry.id);
            deletedIds.add(entry.id);
        } catch (err: any) {
            const msg = err.message || `Błąd usuwania wpisu ${entry.id}`;
            console.error(`Failed to delete time entry ${entry.id}`, err);
            errors.push(msg);
        }
    }

    return {
        result: {
            succeeded: deletedIds.size,
            failed: errors.length,
            errors
        },
        deletedIds
    };
}
