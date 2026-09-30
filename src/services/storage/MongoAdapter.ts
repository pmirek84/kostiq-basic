import { toast } from 'sonner';
import type { IStorageAdapter } from './IStorageAdapter';

const INDEX_MAPPING: Record<string, string> = {
    'by-client': 'clientId',
    'by-status': 'status',
    'by-offer': 'offerId',
    'by-job': 'jobId',
    'by-stage': 'stageId',
    'by-name': 'name',
    'by-category': 'category',
    'by-worker': 'workerId',
    'by-contract': 'contractId'
};

export class MongoAdapter<T extends { id: string }> implements IStorageAdapter<T> {
    private baseUrl: string;
    private endpoint: string;

    constructor(endpoint: string, baseUrl: string = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api') {
        this.baseUrl = baseUrl;
        this.endpoint = endpoint;
    }

    private get url() {
        return `${this.baseUrl}/${this.endpoint}`;
    }

    private getAuthHeaders(): Record<string, string> {
        const token = localStorage.getItem('kostiq_token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    private async fetchJson<U>(url: string, options?: RequestInit): Promise<U> {
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders(),
                    ...options?.headers
                }
            });
            if (!response.ok) {
                // Determine error message
                let errorMsg = `API Error: ${response.status} ${response.statusText}`;
                try {
                    const error = await response.json();
                    errorMsg = error.error || error.message || errorMsg;
                } catch (e) { /* fallback to status text */ }

                // 404 — expected (record not found), callers handle gracefully — NO TOAST
                // 409 — optimistic locking conflict — distinct actionable toast
                // 5xx — server error — generic toast
                if (response.status === 409) {
                    toast.error(errorMsg || 'Dane zostały zmienione przez innego użytkownika. Odśwież stronę i spróbuj ponownie.', {
                        duration: 8000,
                        description: 'Twoje zmiany nie zostały zapisane. Skopiuj je i odśwież formularz.'
                    });
                } else if (response.status !== 404) {
                    toast.error(errorMsg);
                }
                const err: any = new Error(errorMsg);
                err.status = response.status;
                throw err;
            }
            if (response.status === 204) return undefined as any;
            return response.json();
        } catch (err: any) {
            if (err.message && err.message.includes('Failed to fetch')) {
                toast.error('Błąd połączenia z serwerem. Sprawdź internet lub skontaktuj się z adminem.');
            }
            throw err;
        }
    }

    private async request(url: string, options?: RequestInit): Promise<Response> {
        return fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...this.getAuthHeaders(),
                ...options?.headers
            }
        });
    }

    /**
     * Fetches ALL records across all pages.
     * Prevents the critical >100 records truncation bug.
     */
    async getAll(params?: Record<string, string>): Promise<T[]> {
        return this.getAllPages(500, params);
    }

    /** Fetch a specific page (for large collections like time-entries, jobs, materials) */
    async getPage(page: number, limit = 100, params?: Record<string, string>): Promise<{ data: T[]; pagination: { page: number; limit: number; total: number; totalPages: number; hasMore: boolean } }> {
        const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params }).toString();
        const result = await this.fetchJson<any>(`${this.url}?${qs}`);
        if (Array.isArray(result)) {
            // Unpaginated collection — wrap in standard envelope
            return { data: result, pagination: { page: 1, limit: result.length, total: result.length, totalPages: 1, hasMore: false } };
        }
        return result;
    }

    /** Fetches ALL pages sequentially, de-duplicating records by ID. */
    async getAllPages(limit = 500, params?: Record<string, string>): Promise<T[]> {
        const first = await this.getPage(1, limit, params);
        if (!first.pagination || !first.pagination.hasMore) return first.data || [];
        
        const allData: T[] = [...(first.data || [])];
        const seenIds = new Set<string>(allData.map(item => item.id).filter(Boolean));

        for (let p = 2; p <= first.pagination.totalPages; p++) {
            const page = await this.getPage(p, limit, params);
            if (page && page.data && page.data.length > 0) {
                for (const item of page.data) {
                    if (item && item.id) {
                        if (!seenIds.has(item.id)) {
                            seenIds.add(item.id);
                            allData.push(item);
                        }
                    } else if (item) {
                        allData.push(item);
                    }
                }
            }
        }
        return allData;
    }

    async getById(id: string): Promise<T | undefined> {
        try {
            return await this.fetchJson<T>(`${this.url}/${id}`);
        } catch (e: any) {
            // ONLY 404 indicates standard "record does not exist"
            if (e?.status === 404 || (e?.message && e.message.includes('404'))) {
                return undefined;
            }
            // Network failures or 5xx server errors must NOT be swallowed as undefined!
            console.error(`[MongoAdapter] getById(${id}) failure:`, e);
            throw e;
        }
    }

    async create(item: T): Promise<string> {
        const res = await this.fetchJson<T>(this.url, {
            method: 'POST',
            body: JSON.stringify(item)
        });
        return res.id;
    }

    async update(id: string, item: Partial<T>): Promise<void> {
        await this.fetchJson(`${this.url}/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(item)
        });
    }

    async save(item: T): Promise<string> {
        // Shield #1: Optimistic Locking — attach current updatedAt as sentinel so server can detect conflicts
        const itemWithSentinel = {
            ...item,
            ...(((item as any).updatedAt) ? { _lastUpdatedAt: (item as any).updatedAt } : {})
        };

        const res = await this.request(`${this.url}/${item.id}`, {
            method: 'PATCH',
            body: JSON.stringify(itemWithSentinel)
        });

        if (res.ok) {
            return item.id;
        }

        if (res.status === 404) {
            return this.create(item);
        }

        // Shield #1: Propagate 409 Conflict — fetchJson will handle toast, just re-throw
        if (res.status === 409) {
            let errorMsg = 'Dane zostały zmienione przez innego użytkownika.';
            try {
                const error = await res.json();
                errorMsg = error.error || errorMsg;
            } catch (e) { /* noop */ }
            toast.error(errorMsg, {
                duration: 8000,
                description: 'Twoje zmiany nie zostały zapisane. Skopiuj je i odśwież formularz.'
            });
            throw new Error(errorMsg);
        }

        throw new Error(`Failed to save item: ${res.status} ${res.statusText}`);
    }

    async delete(id: string): Promise<void> {
        await this.fetchJson(`${this.url}/${id}`, {
            method: 'DELETE'
        });
    }

    async find(predicate: (item: T) => boolean): Promise<T[]> {
        const all = await this.getAll();
        return all.filter(predicate);
    }

    async getByIndex(indexName: string, value: any): Promise<T[]> {
        const field = INDEX_MAPPING[indexName] || indexName;
        return this.getAllPages(500, { [field]: String(value) });
    }
}
