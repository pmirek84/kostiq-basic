// Shared API helper for catalog hooks
const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('kostiq_token');
    return token
        ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' };
}

export async function catalogFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: { ...getAuthHeaders(), ...options?.headers }
    });
    if (!res.ok) {
        if (res.status === 204) return undefined as any;
        throw new Error(`API ${res.status}: ${res.statusText}`);
    }
    if (res.status === 204) return undefined as any;
    return res.json();
}

// Defensive wrapper: if backend returns { data: [...], pagination: {...} } instead of plain array,
// extract the array. Prevents "X.filter is not a function" crashes.
export async function catalogGetAll<T>(collection: string): Promise<T[]> {
    const result = await catalogFetch<T[] | { data: T[] }>(`/${collection}`);
    if (Array.isArray(result)) return result;
    if (result && Array.isArray((result as any).data)) return (result as any).data;
    console.warn(`[catalogGetAll] Unexpected response shape for "${collection}":`, result);
    return [];
}

export async function catalogCreate<T>(collection: string, data: any): Promise<T> {
    return catalogFetch<T>(`/${collection}`, {
        method: 'POST',
        body: JSON.stringify(data)
    });
}

export async function catalogUpdate<T>(collection: string, id: string, data: any): Promise<T> {
    return catalogFetch<T>(`/${collection}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
    });
}

export async function catalogDelete(collection: string, id: string): Promise<void> {
    return catalogFetch(`/${collection}/${id}`, { method: 'DELETE' });
}
