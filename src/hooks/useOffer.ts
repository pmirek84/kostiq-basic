import { useState, useEffect, useCallback } from 'react';
import type { Offer, Construction } from '../models/types';
import { offerStorage } from '../services/storage/offerStorage';

export const useOffer = (offerId?: string) => {
    const [offer, setOffer] = useState<Offer | null>(null);
    const [constructions, setConstructions] = useState<Construction[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadOfferData = useCallback(async (id: string) => {
        setLoading(true);
        try {
            const fetchedOffer = await offerStorage.getOffer(id);
            if (fetchedOffer) {
                setOffer(fetchedOffer);
                const fetchedConstructions = await offerStorage.getConstructionsForOffer(id);

                // SORT constructions by number or creation time relative to UX needs
                // assuming 'number' field is used for ordering
                fetchedConstructions.sort((a, b) => a.number - b.number);

                setConstructions(fetchedConstructions);
            } else {
                setError('Offer not found');
            }
        } catch (err) {
            console.error(err);
            setError('Failed to load offer');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (offerId) {
            loadOfferData(offerId);
        }
    }, [offerId, loadOfferData]);

    const updateOffer = async (updatedFields: Partial<Offer>) => {
        if (!offer) return;
        const newOffer = { ...offer, ...updatedFields, updatedAt: new Date().toISOString() };
        setOffer(newOffer);
        await offerStorage.saveOffer(newOffer);
    };

    const addConstruction = async (construction: Construction) => {
        // Optimistic update
        setConstructions(prev => [...prev, construction]);

        // Save to DB
        await offerStorage.saveConstruction(construction);

        // Also update offer totals if needed (can be separate logic)
        // For now just ensuring construction persistence is robust
    };

    const updateConstruction = async (construction: Construction) => {
        setConstructions(prev => prev.map(c => c.id === construction.id ? construction : c));
        await offerStorage.saveConstruction(construction);
    };

    const removeConstruction = async (constructionId: string) => {
        setConstructions(prev => prev.filter(c => c.id !== constructionId));
        await offerStorage.deleteConstruction(constructionId);
    };

    // Recalculate totals helper
    const recalculateTotals = async () => {
        if (!offer) return;

        // Simple sum logic - extend based on full requirements
        // Simple sum logic - extend based on full requirements
        const materialsCost = constructions.reduce((sum, c) => sum + (c.materialCosts?.total || 0), 0);
        const laborCost = constructions.reduce((sum, c) => sum + (c.installationCosts?.total || 0), 0);

        const totalCost = materialsCost + laborCost +
            (offer.constructionTransportCost || 0) +
            (offer.workerTransportCost || 0) +
            (offer.workTimeCost || 0);

        const updatedOffer = {
            ...offer,
            materialsCost,
            laborCost, // Combined labor
            totalCost,
            updatedAt: new Date().toISOString()
        };

        setOffer(updatedOffer);
        await offerStorage.saveOffer(updatedOffer);
    };

    return {
        offer,
        constructions,
        loading,
        error,
        updateOffer,
        addConstruction,
        updateConstruction,
        removeConstruction,
        recalculateTotals,
        refresh: () => offerId && loadOfferData(offerId)
    };
};
