import { useState, useEffect } from 'react';
import type { CompanySettings } from '../models/types';
import { settingsStorage } from '../services/storage/settingsStorage';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('kostiq_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

// Default Fallback
const defaultSettings: CompanySettings = {
    id: 'default',
    companyName: 'Moja Firma Okienna',
    address: 'ul. Przykładowa 123, 00-001 Warszawa',
    taxId: '123-456-78-90',
    defaultVatRate: 23,
    defaultHourlyRate: 50,
    defaultMarginPercent: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
};

export function useCompanySettings() {
    const [settings, setSettings] = useState<CompanySettings | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const stored = await settingsStorage.getSettings();
            const base = stored || defaultSettings;

            // Also fetch logoUrl from /api/company-settings (separate endpoint used by LogoSection in SettingsPage)
            try {
                const res = await fetch(`${API_BASE}/company-settings`, { headers: getAuthHeaders() });
                if (res.ok) {
                    const cs = await res.json();
                    // company-settings may be an array or a single object
                    const logoUrl = Array.isArray(cs) ? cs[0]?.logoUrl : cs?.logoUrl;
                    setSettings({ ...base, ...(logoUrl ? { logoUrl } : {}) });
                } else {
                    setSettings(base);
                }
            } catch {
                setSettings(base);
            }
            setLoading(false);
        };
        load();
    }, []);

    const saveSettings = async (newSettings: CompanySettings) => {
        // NOTE: Do NOT set updatedAt here — MongoAdapter uses item.updatedAt as
        // _lastUpdatedAt sentinel for optimistic locking. Setting it to now() causes 409.
        setSettings(newSettings); // Optimistic update
        await settingsStorage.saveSettings(newSettings);
    };

    const updateSettings = async (updates: Partial<CompanySettings>) => {
        if (!settings) return;
        saveSettings({ ...settings, ...updates });
    };

    return {
        settings: settings || defaultSettings,
        loading,
        saveSettings,
        updateSettings
    };
}
