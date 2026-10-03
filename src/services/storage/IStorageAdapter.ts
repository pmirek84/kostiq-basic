
/**
 * Generic Interface for Persistence Operations (CRUD).
 * This allows swapping the underlying storage mechanism (IndexedDB, REST API, Firebase) 
 * without changing the business logic services.
 */
export interface IStorageAdapter<T> {
    getAll(params?: Record<string, string>): Promise<T[]>;
    getById(id: string): Promise<T | undefined>;
    create(item: T): Promise<string>; // Returns ID
    update(id: string, item: Partial<T>): Promise<void>;
    save(item: T): Promise<string>; // UPSERT (Create or Update)
    delete(id: string, options?: { expectedVersion?: number }): Promise<void>;

    // Optional: Filter support
    find(predicate: (item: T) => boolean): Promise<T[]>;

    // Index support (Adapter implementations should handle mapping)
    getByIndex(indexName: string, value: any): Promise<T[]>;
}
