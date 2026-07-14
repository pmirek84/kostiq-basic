import { useState, useEffect, useCallback } from 'react';
import type { InstallationStandard } from '../models/types';
import { standardsStorage } from '../services/storage/standardsStorage';

const STORAGE_KEY = 'costframe_standards';

export function useStandards() {
    const [standards, setStandards] = useState<InstallationStandard[]>([]);
    const [loading, setLoading] = useState(true);

    const loadStandards = useCallback(async () => {
        try {
            const data = await standardsStorage.getAllStandards();
            setStandards(data);
        } catch (error) {
            console.error('Failed to load standards:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const init = async () => {
            // Migration: Check LocalStorage
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        console.log('Migrating standards from LocalStorage to IndexedDB...', parsed);

                        // We must ensure we don't end up with mixed state.
                        // Ideally we wipe DB if we trust LS more (user just edited in LS world).
                        // But verifying if DB has data:

                        // If DB has "default" junk and LS has real data, likely we want LS.
                        // Simple merge strategy: Save all LS items to DB (upsert).
                        for (const std of parsed) {
                            await standardsStorage.saveStandard(std);
                        }
                    }
                    localStorage.removeItem(STORAGE_KEY); // Clear LS after migration
                } catch (e) {
                    console.error('Migration failed', e);
                }
            }

            await loadStandards();
        };
        init();
    }, [loadStandards]);

    const addStandard = async (standard: Omit<InstallationStandard, 'id' | 'createdAt' | 'updatedAt'>) => {
        const newStandard: InstallationStandard = {
            ...standard,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await standardsStorage.saveStandard(newStandard);
        await loadStandards();
    };

    const updateStandard = async (id: string, updates: Partial<InstallationStandard>) => {
        const current = standards.find(s => s.id === id);
        if (!current) return;

        const updated: InstallationStandard = {
            ...current,
            ...updates,
            updatedAt: new Date().toISOString()
        };
        await standardsStorage.saveStandard(updated);
        await loadStandards();
    };

    const deleteStandard = async (id: string) => {
        await standardsStorage.deleteStandard(id);
        await loadStandards();
    };

    return {
        standards,
        loading,
        addStandard,
        updateStandard,
        deleteStandard
    };
}
