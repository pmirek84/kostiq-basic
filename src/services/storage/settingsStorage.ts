import type { CompanySettings } from '../../models/types';
import { getAdapter } from './adapterFactory';

const SETTINGS_ID = 'default';
const settingsRepo = getAdapter<CompanySettings>('settings');

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('kostiq_token');
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export const settingsStorage = {
    async getSettings(): Promise<CompanySettings | undefined> {
        try {
            // Direct fetch — 404 means "no settings yet" (not an error worth toasting)
            const res = await fetch(`${API_BASE}/settings/${SETTINGS_ID}`, {
                headers: getAuthHeaders()
            });
            if (res.status === 404) return undefined; // First run — no settings saved yet
            if (!res.ok) return undefined;            // Other errors: fall back to defaults silently
            return await res.json() as CompanySettings;
        } catch (e) {
            // Network error or parse error — fall back to defaults silently
            console.warn('[settingsStorage] Could not load settings, using defaults:', e);
            return undefined;
        }
    },

    async saveSettings(settings: CompanySettings): Promise<void> {
        // NOTE: Do NOT override updatedAt here — MongoAdapter uses item.updatedAt as
        // the _lastUpdatedAt sentinel for optimistic locking. Setting it to now() would
        // cause a 409 because it wouldn't match what the backend has.
        // The backend PATCH handler stamps updatedAt itself on every successful save.
        const toSave = { ...settings, id: SETTINGS_ID };
        await settingsRepo.save(toSave);
    }
};
