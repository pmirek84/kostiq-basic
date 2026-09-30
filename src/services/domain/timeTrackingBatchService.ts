import type { TimeEntry } from '../../models/types';
import type { TiCoRepository } from '../data/TiCoRepository';
import { v4 as uuidv4 } from 'uuid';

export type BatchOperationResult = {
    succeeded: number;
    failed: number;
    errors: string[];
};

/**
 * Imports time entries sequentially, performing upsert by ID to prevent duplicate MongoDB documents.
 * Returns explicit operation counts and errors.
 */
export async function executeImportTimeEntries(
    entries: TimeEntry[],
    existingEntries: TimeEntry[],
    repository: Pick<TiCoRepository, 'createTimeEntry' | 'updateTimeEntry'>
): Promise<{ result: BatchOperationResult; savedEntries: TimeEntry[] }> {
    const savedEntries: TimeEntry[] = [];
    const errors: string[] = [];
    const existingIds = new Set(existingEntries.map(e => e.id));

    for (const entry of entries) {
        try {
            const entryId = entry.id || uuidv4();
            const entryToSave: TimeEntry = {
                ...entry,
                id: entryId,
                createdAt: entry.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            let saved: TimeEntry;
            if (existingIds.has(entryId)) {
                saved = await repository.updateTimeEntry(entryId, entryToSave);
            } else {
                saved = await repository.createTimeEntry(entryToSave);
                existingIds.add(entryId);
            }
            savedEntries.push(saved || entryToSave);
        } catch (err: any) {
            const msg = err.message || `Błąd importu wpisu ${entry.id || 'bez id'}`;
            console.error('Failed to import time entry', entry, err);
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
