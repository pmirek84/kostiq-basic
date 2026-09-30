import type { TiCoRepository } from './TiCoRepository';
import type { Employee, Subcontractor, TimeEntry, Settlement, Crew, Message, Request } from '../../models/types';

/**
 * MongoRepository (Adapter)
 *
 * Implements TiCoRepository by consuming a REST API backed by MongoDB.
 * Ensures full pagination traversal for collections without silent 100-record truncation.
 */
export class MongoRepository implements TiCoRepository {
    private baseUrl: string;

    constructor(baseUrl: string = import.meta.env.VITE_API_URL || 'http://localhost:3000/api') {
        this.baseUrl = baseUrl;
    }

    private getAuthHeaders(): Record<string, string> {
        const token = localStorage.getItem('kostiq_token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    }

    /**
     * Core fetch helper for single entity endpoints (POST, PATCH, DELETE, GET by id).
     */
    private async fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...this.getAuthHeaders(),
                ...options?.headers,
            },
        });

        if (!response.ok) {
            const err: any = new Error(`API Error: ${response.status} ${response.statusText} for ${url}`);
            err.status = response.status;
            throw err;
        }

        if (response.status === 204) {
            return undefined as unknown as T;
        }

        const json = await response.json();

        // If returned as paginated envelope, unwrap data
        if (json && typeof json === 'object' && !Array.isArray(json) && Array.isArray(json.data)) {
            return json.data as unknown as T;
        }

        return json as T;
    }

    /**
     * Traverses all pages sequentially, ensuring no record truncation and preventing duplicates.
     */
    private async fetchCollectionAllPages<T extends { id?: string }>(endpoint: string, params?: Record<string, string>): Promise<T[]> {
        const limit = 500;
        let page = 1;
        const allItems: T[] = [];
        const seenIds = new Set<string>();
        let hasMore = true;

        while (hasMore) {
            const qs = new URLSearchParams({ page: String(page), limit: String(limit), ...params }).toString();
            const sep = endpoint.includes('?') ? '&' : '?';
            const url = `${this.baseUrl}${endpoint}${sep}${qs}`;

            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...this.getAuthHeaders(),
                },
            });

            if (!response.ok) {
                const err: any = new Error(`API Error: ${response.status} ${response.statusText} for ${url}`);
                err.status = response.status;
                throw err;
            }

            if (response.status === 204) {
                return allItems;
            }

            const json = await response.json();
            if (Array.isArray(json)) {
                // Non-paginated collection
                return json;
            }

            if (json && Array.isArray(json.data)) {
                for (const item of json.data) {
                    if (item && item.id) {
                        if (!seenIds.has(item.id)) {
                            seenIds.add(item.id);
                            allItems.push(item);
                        }
                    } else if (item) {
                        allItems.push(item);
                    }
                }

                if (json.pagination && json.pagination.hasMore && page < json.pagination.totalPages) {
                    page++;
                } else {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        }

        return allItems;
    }

    // --- Employees ---

    async getEmployees(): Promise<Employee[]> {
        return this.fetchCollectionAllPages<Employee>('/employees');
    }

    async createEmployee(employee: Employee): Promise<Employee> {
        return this.fetchJson<Employee>('/employees', {
            method: 'POST',
            body: JSON.stringify(employee),
        });
    }

    async updateEmployee(id: string, updates: Partial<Employee>): Promise<Employee> {
        return this.fetchJson<Employee>(`/employees/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }

    async deleteEmployee(id: string): Promise<void> {
        await this.fetchJson<void>(`/employees/${id}`, {
            method: 'DELETE',
        });
    }

    // --- Subcontractors ---

    async getSubcontractors(): Promise<Subcontractor[]> {
        return this.fetchCollectionAllPages<Subcontractor>('/subcontractors');
    }

    async createSubcontractor(subcontractor: Subcontractor): Promise<Subcontractor> {
        return this.fetchJson<Subcontractor>('/subcontractors', {
            method: 'POST',
            body: JSON.stringify(subcontractor),
        });
    }

    async updateSubcontractor(id: string, updates: Partial<Subcontractor>): Promise<Subcontractor> {
        return this.fetchJson<Subcontractor>(`/subcontractors/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }

    async deleteSubcontractor(id: string): Promise<void> {
        await this.fetchJson<void>(`/subcontractors/${id}`, {
            method: 'DELETE',
        });
    }

    // --- Crews ---

    async getCrews(): Promise<Crew[]> {
        return this.fetchCollectionAllPages<Crew>('/crews');
    }

    async createCrew(crew: Crew): Promise<Crew> {
        return this.fetchJson<Crew>('/crews', {
            method: 'POST',
            body: JSON.stringify(crew),
        });
    }

    async updateCrew(id: string, updates: Partial<Crew>): Promise<Crew> {
        return this.fetchJson<Crew>(`/crews/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }

    // --- TimeEntries ---

    async getTimeEntries(): Promise<TimeEntry[]> {
        return this.fetchCollectionAllPages<TimeEntry>('/time-entries');
    }

    async createTimeEntry(entry: TimeEntry): Promise<TimeEntry> {
        return this.fetchJson<TimeEntry>('/time-entries', {
            method: 'POST',
            body: JSON.stringify(entry),
        });
    }

    async updateTimeEntry(id: string, updates: Partial<TimeEntry>): Promise<TimeEntry> {
        return this.fetchJson<TimeEntry>(`/time-entries/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }

    async deleteTimeEntry(id: string): Promise<void> {
        await this.fetchJson<void>(`/time-entries/${id}`, {
            method: 'DELETE',
        });
    }

    async batchUpdateTimeEntries(ids: string[], updates: Partial<TimeEntry>): Promise<void> {
        await this.fetchJson<void>('/time-entries/batch-update', {
            method: 'POST',
            body: JSON.stringify({ ids, updates }),
        });
    }

    // --- Settlements ---

    async getSettlements(): Promise<Settlement[]> {
        return this.fetchCollectionAllPages<Settlement>('/settlements');
    }

    async createSettlement(settlement: Settlement): Promise<Settlement> {
        return this.fetchJson<Settlement>('/settlements', {
            method: 'POST',
            body: JSON.stringify(settlement),
        });
    }

    async updateSettlement(id: string, updates: Partial<Settlement>): Promise<Settlement> {
        return this.fetchJson<Settlement>(`/settlements/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }

    // --- Messages ---

    async getMessages(): Promise<Message[]> {
        return this.fetchCollectionAllPages<Message>('/messages');
    }

    async createMessage(message: Message): Promise<Message> {
        return this.fetchJson<Message>('/messages', {
            method: 'POST',
            body: JSON.stringify(message),
        });
    }

    async updateMessage(id: string, updates: Partial<Message>): Promise<Message> {
        return this.fetchJson<Message>(`/messages/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }

    // --- Requests ---

    async getRequests(): Promise<Request[]> {
        return this.fetchCollectionAllPages<Request>('/requests');
    }

    async createRequest(request: Request): Promise<Request> {
        return this.fetchJson<Request>('/requests', {
            method: 'POST',
            body: JSON.stringify(request),
        });
    }

    async updateRequest(id: string, updates: Partial<Request>): Promise<Request> {
        return this.fetchJson<Request>(`/requests/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
    }
}
