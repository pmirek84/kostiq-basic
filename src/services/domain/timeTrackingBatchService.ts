import type { TimeEntry } from '../../models/types';
import type { TiCoRepository } from '../data/TiCoRepository';
import { v4 as uuidv4 } from 'uuid';

export type BatchOperationResult = {
    succeeded: number;
    failed: number;
    succeededIds?: string[];
    failedIds?: string[];
    errors: string[];
};

/**
 * Imports time entries. When the repository implements batchImportTimeEntries,
 * it performs bulk upsert via the backend batch-import endpoint, preserving createdAt.
 * If partial success occurs, it saves exactly the records confirmed by succeededIds.
 * Does NOT run sequential retries on ambiguous network/server errors.
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
            const succeededSet = new Set(batchResult.succeededIds || []);
            
            // Accurately map only the saved entries confirmed by the database
            const savedEntries = (batchResult.succeededIds && batchResult.succeededIds.length > 0)
                ? preparedEntries.filter(e => succeededSet.has(e.id))
                : (batchResult.failed === 0 ? preparedEntries : []);

            return {
                result: batchResult,
                savedEntries
            };
        } catch (err: any) {
            // Only fall back to sequential if the batch endpoint is explicitly not supported (HTTP 404)
            if (err?.status === 404 || (err?.message && err.message.includes('404'))) {
                console.warn('[executeImportTimeEntries] Batch endpoint not supported (404), falling back to sequential import');
            } else {
                // Ambiguous network/server error: do NOT attempt duplicate sequential writes!
                console.error('[executeImportTimeEntries] Batch import network/server error:', err);
                return {
                    result: {
                        succeeded: 0,
                        failed: preparedEntries.length,
                        succeededIds: [],
                        failedIds: preparedEntries.map(e => e.id),
                        errors: [err.message || 'Błąd sieciowy podczas importu wsadowego']
                    },
                    savedEntries: []
                };
            }
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
            succeededIds: savedEntries.map(e => e.id),
            failedIds: [],
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
