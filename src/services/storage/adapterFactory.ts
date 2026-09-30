import type { IStorageAdapter } from './IStorageAdapter';
import { MongoAdapter } from './MongoAdapter';

// Configuration: MongoDB is the sole active source of truth.
export const USE_MONGO = true;

export function getAdapter<T extends { id: string }>(storeName: string, mongoEndpoint?: string): IStorageAdapter<T> & { getByIndex?: (index: string, val: any) => Promise<T[]> } {
    const endpoint = mongoEndpoint || storeName;
    return new MongoAdapter<T>(endpoint);
}
