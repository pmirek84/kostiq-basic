import { useState, useCallback } from 'react';
import type { Construction } from '../models/types';
import { getAdapter } from '../services/storage/adapterFactory';

const constructionRepo = getAdapter<Construction>('constructions');

export function useConstructionStorage() {
    const [constructions, setConstructions] = useState<Construction[]>([]);
    const [loading, setLoading] = useState(false);

    const loadConstructions = useCallback(async () => {
        try {
            setLoading(true);
            const loadedConstructions = await constructionRepo.getAll();
            setConstructions(loadedConstructions);
            return loadedConstructions;
        } catch (error) {
            console.error('Błąd podczas ładowania konstrukcji:', error);
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    const saveConstruction = useCallback(async (constructionData: Partial<Construction>): Promise<Construction> => {
        try {
            setLoading(true);
            const id = constructionData.id || crypto.randomUUID();
            const timestamp = new Date().toISOString();

            // Format data for saving
            const toSave = {
                ...constructionData,
                id,
                createdAt: constructionData.createdAt || timestamp,
                updatedAt: timestamp
            } as Construction;

            await constructionRepo.save(toSave);

            // Refresh local state
            await loadConstructions();

            return toSave;
        } catch (error) {
            console.error('Błąd podczas zapisywania konstrukcji:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [loadConstructions]);

    const deleteConstruction = useCallback(async (id: string) => {
        try {
            setLoading(true);
            await constructionRepo.delete(id);
            await loadConstructions();
            return true;
        } catch (error) {
            console.error('Błąd podczas usuwania konstrukcji:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [loadConstructions]);

    const clearConstructions = useCallback(async () => {
        // Caution: This is rarely used and might be dangerous on shared DB
        // For now, we just log it or implement if really needed.
        console.warn('clearConstructions called on Mongo storage - not fully implemented for safety');
    }, []);

    const initializeConstructions = useCallback(async (initialConstructions: Construction[]) => {
        try {
            setLoading(true);
            for (const c of initialConstructions) {
                await constructionRepo.save(c);
            }
            await loadConstructions();
            return initialConstructions;
        } catch (error) {
            console.error('Błąd podczas inicjalizacji konstrukcji:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [loadConstructions]);

    const getConstructionsByOffer = useCallback(async (offerId: string): Promise<Construction[]> => {
        try {
            if (constructionRepo.getByIndex) {
                return await constructionRepo.getByIndex('by-offer', offerId);
            }
            const all = await constructionRepo.getAll();
            return all.filter(c => c.offerId === offerId);
        } catch (error) {
            console.error('Błąd podczas pobierania konstrukcji dla oferty:', error);
            return [];
        }
    }, []);

    return {
        constructions,
        loading,
        saveConstruction,
        deleteConstruction,
        clearConstructions,
        loadConstructions,
        initializeConstructions,
        getConstructionsByOffer
    };
}
