import type { IStorageAdapter } from './IStorageAdapter';

export class LocalStorageAdapter<T extends { id: string }> implements IStorageAdapter<T> {
    private key: string;

    constructor(key: string) {
        this.key = key;
    }

    private getItems(): T[] {
        const json = localStorage.getItem(this.key);
        if (!json) return [];
        try {
            return JSON.parse(json);
        } catch {
            return [];
        }
    }

    private saveItems(items: T[]): void {
        localStorage.setItem(this.key, JSON.stringify(items));
    }

    async getAll(): Promise<T[]> {
        return this.getItems();
    }

    async getById(id: string): Promise<T | undefined> {
        return this.getItems().find(i => i.id === id);
    }

    async getByIndex(indexName: string, value: string): Promise<T[]> {
        // Simple scan for LocalStorageAdapter since we don't strictly enforce indexes here
        // We assume indexName is a property key of T
        return this.getItems().filter((item: any) => {
            // Special handling for commonly used indexes if needed
            if (indexName === 'by-offer') return item.offerId === value;
            if (indexName === 'by-job') return item.jobId === value;

            // Generic fallback
            return item[indexName] === value;
        });
    }

    async create(item: T): Promise<string> {
        return this.save(item);
    }

    async update(id: string, updates: Partial<T>): Promise<void> {
        const items = this.getItems();
        const index = items.findIndex(i => i.id === id);
        if (index !== -1) {
            items[index] = { ...items[index], ...updates };
            this.saveItems(items);
        }
    }

    async save(item: T): Promise<string> {
        const items = this.getItems();
        const index = items.findIndex(i => i.id === item.id);
        if (index !== -1) {
            items[index] = item;
        } else {
            items.push(item);
        }
        this.saveItems(items);
        return item.id;
    }

    async delete(id: string): Promise<void> {
        const items = this.getItems();
        const filtered = items.filter(i => i.id !== id);
        this.saveItems(filtered);
    }

    async find(predicate: (item: T) => boolean): Promise<T[]> {
        return this.getItems().filter(predicate);
    }
}
