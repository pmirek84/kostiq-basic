import { useState, useEffect, useCallback } from 'react';
import { catalogGetAll, catalogCreate, catalogUpdate, catalogDelete } from './catalogApi';

export interface LogisticsRate {
    id: string;
    vehicleType: string;
    ratePerKm: number;
    description?: string;
}

const COLLECTION = 'logistics-rates';

export function useLogisticsRates() {
    const [logisticsRates, setLogisticsRates] = useState<LogisticsRate[]>([]);
    const [loading, setLoading] = useState(true);

    const loadRates = useCallback(async () => {
        try {
            setLoading(true);
            const data = await catalogGetAll<LogisticsRate>(COLLECTION);
            setLogisticsRates(data);
        } catch (e) {
            console.error('Failed to load logistics rates from API', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadRates();
    }, [loadRates]);

    const addRate = async (rate: Omit<LogisticsRate, 'id'>) => {
        const newRate = { ...rate, id: crypto.randomUUID() };
        await catalogCreate(COLLECTION, newRate);
        await loadRates();
    };

    const updateRate = async (id: string, updates: Partial<LogisticsRate>) => {
        await catalogUpdate(COLLECTION, id, updates);
        await loadRates();
    };

    const deleteRate = async (id: string) => {
        await catalogDelete(COLLECTION, id);
        await loadRates();
    };

    return {
        logisticsRates,
        loading,
        addRate,
        updateRate,
        deleteRate
    };
}
