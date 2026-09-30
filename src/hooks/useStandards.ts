import { useState, useEffect, useCallback } from 'react';
import type { InstallationStandard } from '../models/types';
import { standardsStorage } from '../services/storage/standardsStorage';



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
        loadStandards();
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
