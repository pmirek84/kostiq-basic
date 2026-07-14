import type { IStorageAdapter } from './IStorageAdapter';
import { IndexedDBAdapter } from './IndexedDBAdapter';
import { MongoAdapter } from './MongoAdapter';

// Configuration
// We default to 'mongo' as requested by the user for migration.
// In production, this could be an environment variable.
export const USE_MONGO = true;

export function getAdapter<T extends { id: string }>(storeName: string, mongoEndpoint?: string): IStorageAdapter<T> & { getByIndex?: (index: string, val: any) => Promise<T[]> } {
    if (USE_MONGO) {
        // Map storeName to mongoEndpoint. Usually they are the same (e.g. 'clients' -> 'clients')
        // But for some like 'subcontractor_contracts', we might want consistency. 
        // Our backend uses exact names passed in server.js.
        const endpoint = mongoEndpoint || storeName;
        return new MongoAdapter<T>(endpoint);
    }
    return new IndexedDBAdapter<T>(storeName);
}
