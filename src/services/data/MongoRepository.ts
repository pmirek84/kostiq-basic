import type { TiCoRepository } from './TiCoRepository';
import type { Employee, Subcontractor, TimeEntry, Settlement, Crew, Message, Request } from '../../models/types';

/**
 * MongoRepository (Adapter)
 *
 * Implements TiCoRepository by consuming a REST API backed by MongoDB.
 *
 * FIX: fetchJson() now unwraps paginated envelopes { data, pagination }
 * so all getXxx() methods always return T[] regardless of whether the
 * backend uses pagination (Fix #4) or returns a plain array.
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
     * Core fetch helper.
     * Automatically unwraps paginated envelopes { data: T[], pagination: any }
     * into plain T[] — callers always get an array back for collection endpoints.
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
            throw new Error(`API Error: ${response.status} ${response.statusText} for ${url}`);
        }

        if (response.status === 204) {
            return undefined as unknown as T;
        }

        const json = await response.json();

        // FIX: Unwrap paginated envelope { data: T[], pagination: {...} }
        // Backend (Fix #4) returns this format for large collections.
        // Non-paginated endpoints return plain arrays — leave those untouched.
        if (json && typeof json === 'object' && !Array.isArray(json) && Array.isArray(json.data)) {
            return json.data as unknown as T;
        }

        return json as T;
    }

    // --- Employees ---

    async getEmployees(): Promise<Employee[]> {
        return this.fetchJson<Employee[]>('/employees');
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
        return this.fetchJson<Subcontractor[]>('/subcontractors');
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
        return this.fetchJson<Crew[]>('/crews');
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
        // time-entries is a large paginated collection (Fix #4).
        // fetchJson() will unwrap { data: TimeEntry[], pagination } automatically.
        return this.fetchJson<TimeEntry[]>('/time-entries');
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
        return this.fetchJson<Settlement[]>('/settlements');
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
        return this.fetchJson<Message[]>('/messages');
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
        return this.fetchJson<Request[]>('/requests');
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
