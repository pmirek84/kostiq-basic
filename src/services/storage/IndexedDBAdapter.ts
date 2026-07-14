import { getDB } from './db';
import type { IStorageAdapter } from './IStorageAdapter';

/**
 * Generic Adapter implementation for IndexedDB (using 'idb' library).
 * Wraps low-level DB calls into a standard CRUD interface.
 */
export class IndexedDBAdapter<T extends { id: string }> implements IStorageAdapter<T> {
    private storeName: string;

    constructor(storeName: string) {
        this.storeName = storeName;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getAll(_params?: Record<string, string>): Promise<T[]> {
        const db = await getDB();
        return await db.getAll(this.storeName as any);
    }

    async getById(id: string): Promise<T | undefined> {
        const db = await getDB();
        return await db.get(this.storeName as any, id);
    }

    async create(item: T): Promise<string> {
        return this.save(item);
    }

    async update(id: string, updates: Partial<T>): Promise<void> {
        const db = await getDB();
        const tx = db.transaction(this.storeName as any, 'readwrite');
        const store = tx.objectStore(this.storeName as any);

        const existing = await store.get(id);
        if (existing) {
            const updated = { ...existing, ...updates };
            await store.put(updated);
        }
        await tx.done;
    }

    async save(item: T): Promise<string> {
        const db = await getDB();
        await db.put(this.storeName as any, item);
        return item.id;
    }

    async delete(id: string): Promise<void> {
        const db = await getDB();
        await db.delete(this.storeName as any, id);
    }

    async find(predicate: (item: T) => boolean): Promise<T[]> {
        const all = await this.getAll();
        return all.filter(predicate);
    }

    // Additional helper for indexed queries if needed (leaky abstraction but pragmatic)
    async getByIndex(indexName: string, value: any): Promise<T[]> {
        const db = await getDB();
        return await (db as any).getAllFromIndex(this.storeName, indexName, value);
    }
}
