import { useState, useEffect, useCallback } from 'react';
import { catalogGetAll, catalogCreate, catalogUpdate, catalogDelete } from './catalogApi';

export interface InstallationRate {
    id: string;
    type: string;
    rate: number;
    unit: string;
}

const COLLECTION = 'installation-rates';

export function useInstallationRates() {
    const [rates, setRates] = useState<InstallationRate[]>([]);
    const [loading, setLoading] = useState(true);

    const loadRates = useCallback(async () => {
        try {
            setLoading(true);
            const data = await catalogGetAll<InstallationRate>(COLLECTION);
            setRates(data);
        } catch (e) {
            console.error('Failed to load installation rates from API', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadRates();
    }, [loadRates]);

    const addRate = async (rate: Omit<InstallationRate, 'id'>) => {
        const newRate = { ...rate, id: crypto.randomUUID() };
        await catalogCreate(COLLECTION, newRate);
        await loadRates();
    };

    const updateRate = async (updatedRate: InstallationRate) => {
        await catalogUpdate(COLLECTION, updatedRate.id, updatedRate);
        await loadRates();
    };

    const deleteRate = async (id: string) => {
        await catalogDelete(COLLECTION, id);
        await loadRates();
    };

    const getRateForType = (type: string): InstallationRate | undefined => {
        return rates.find(rate => rate.type === type);
    };

    return {
        rates,
        loading,
        addRate,
        updateRate,
        deleteRate,
        getRateForType
    };
}
