import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Offer } from '../models/types';
import { v4 as uuidv4 } from 'uuid';
import { offerStorage } from '../services/storage/offerStorage';

interface OffersContextType {
    offers: Offer[];
    addOffer: (offerData: Omit<Offer, 'id' | 'createdAt' | 'updatedAt' | 'number'>, idempotencyKey?: string) => Promise<string>;
    updateOffer: (id: string, updates: Partial<Offer>) => Promise<void>;
    deleteOffer: (id: string) => Promise<void>;
    getOffer: (id: string) => Offer | undefined;
    getConstructionsForOffer: (offerId: string) => Promise<any[]>; // Added this
    refreshOffers: () => Promise<void>;
    isLoading: boolean;
}

export const OffersContext = createContext<OffersContextType | undefined>(undefined);

export function OffersProvider({ children }: { children: ReactNode }) {
    const [offers, setOffers] = useState<Offer[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const refreshOffers = async () => {
        setIsLoading(true);
        try {
            const data = await offerStorage.getAllOffers();
            setOffers(data);
        } catch (error) {
            console.error('Failed to load offers:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const init = async () => {
            try {
                await offerStorage.seedTemplates();
            } catch (e) {
                console.error('Seeding failed:', e);
            }
            await refreshOffers();
        };
        init();
    }, []);

    const addOffer = async (offerData: Omit<Offer, 'id' | 'createdAt' | 'updatedAt' | 'number'>, idempotencyKey?: string) => {
        const defaults: Partial<Offer> = {
            recordKind: 'offer',
            status: 'draft',
            materialsCost: 0,
            laborCost: 0,
            totalCost: 0,
            totalNet: 0,
            totalGross: 0,
            vatRate: 23,
            discountType: 'percent',
            discountValue: 0,
            subtotalNet: 0,
            discountAmount: 0,
            vatAmount: 0,
            offerTemplateType: 'detailed',
            scopeOfWork: [],
            notes: [],
            settings: {
                margin: 0,
                discount: 0,
                workTime: { workTime: 0, workerCount: 0, hourlyRate: 0 },
                installationRates: {}
            },
            rentalItems: []
        };

        const result = await offerStorage.createOfferAtomic({
            offer: {
                ...defaults,
                ...offerData
            },
            idempotencyKey: idempotencyKey || (offerData as any)?.idempotencyKey
        });

        await refreshOffers();
        return result.offer.id;
    };

    const updateOffer = async (id: string, updates: Partial<Offer>) => {
        const existing = await offerStorage.getOffer(id);
        if (existing) {
            const updated = {
                ...existing,
                ...updates,
                expectedVersion: existing.editVersion
            };
            await offerStorage.saveOffer(updated);
            await refreshOffers();
        }
    };

    const deleteOffer = async (id: string) => {
        const existing = offers.find(o => o.id === id) || (await offerStorage.getOffer(id));
        await offerStorage.deleteOffer(id, existing?.editVersion !== undefined ? { expectedVersion: existing.editVersion } : undefined);
        await refreshOffers();
    };

    const getOffer = (id: string) => offers.find(offer => offer.id === id);

    const getConstructionsForOffer = async (offerId: string) => {
        return await offerStorage.getConstructionsForOffer(offerId);
    };

    return (
        <OffersContext.Provider value={{
            offers,
            addOffer,
            updateOffer,
            deleteOffer,
            getOffer,
            getConstructionsForOffer,
            refreshOffers,
            isLoading
        }}>
            {children}
        </OffersContext.Provider>
    );
}

export function useOffers() {
    const context = useContext(OffersContext);
    if (context === undefined) {
        throw new Error('useOffers must be used within an OffersProvider');
    }
    return context;
}
