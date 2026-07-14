import { useState, useEffect, useCallback } from 'react';
import { catalogGetAll, catalogCreate, catalogUpdate, catalogDelete } from './catalogApi';

export interface RentalRate {
    id: string;
    name: string;
    unit: string;
    unitPrice: number;
    category: string;
    minRentalPeriod: string;
    availability: string;
}

const COLLECTION = 'rental-rates';

export function useRentalRates() {
    const [rates, setRates] = useState<RentalRate[]>([]);
    const [loading, setLoading] = useState(true);

    const loadRates = useCallback(async () => {
        try {
            setLoading(true);
            const data = await catalogGetAll<RentalRate>(COLLECTION);
            setRates(data);
        } catch (e) {
            console.error('Failed to load rental rates from API', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadRates();
    }, [loadRates]);

    const addRate = async (rate: Omit<RentalRate, 'id'>) => {
        const newRate = { ...rate, id: crypto.randomUUID() };
        await catalogCreate(COLLECTION, newRate);
        await loadRates();
    };

    const updateRate = async (updatedRate: RentalRate) => {
        await catalogUpdate(COLLECTION, updatedRate.id, updatedRate);
        await loadRates();
    };

    const deleteRate = async (id: string) => {
        await catalogDelete(COLLECTION, id);
        await loadRates();
    };

    return {
        rates,
        loading,
        addRate,
        updateRate,
        deleteRate
    };
}
