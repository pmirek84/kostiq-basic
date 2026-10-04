import { v4 as uuidv4 } from 'uuid';
import type { Offer, Construction, Job } from '../../models/types';
import { JobToOfferAdapter } from '../adapters/JobToOfferAdapter';
import { getAdapter } from './adapterFactory';

// Create generic repositories
const offersRepo = getAdapter<Offer>('offers');
const constructionsRepo = getAdapter<Construction>('constructions');

export const offerStorage = {
    // --- Repository Access ---

    async getAllOffers(): Promise<Offer[]> {
        return offersRepo.getAll();
    },

    async getOffer(id: string): Promise<Offer | undefined> {
        return offersRepo.getById(id);
    },

    async createOffer(offer: Partial<Offer>, idempotencyKey?: string): Promise<string> {
        const result = await this.createOfferAtomic({ offer, idempotencyKey });
        return result.offer.id;
    },

    async createOfferAtomic(data: {
        offer: Partial<Offer>;
        constructions?: Construction[];
        idempotencyKey?: string;
    }): Promise<{ status: string; offer: Offer; constructions: Construction[] }> {
        const idempotencyKey = data.idempotencyKey || (data.offer as any)?.idempotencyKey || uuidv4();
        const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';
        const token = localStorage.getItem('kostiq_token');
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const offerPayload = { ...data.offer };
        if (offerPayload.recordKind === 'offer' || !offerPayload.recordKind) {
            delete offerPayload.number;
        } else if (typeof offerPayload.number === 'string' && offerPayload.number.trim() === '') {
            delete offerPayload.number;
        }

        const res = await fetch(`${baseUrl}/offers/create-atomic`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                ...offerPayload,
                constructions: data.constructions || [],
                idempotencyKey
            })
        });

        if (!res.ok) {
            let errorMsg = `Błąd atomowego tworzenia oferty: ${res.status} ${res.statusText}`;
            try {
                const errJson = await res.json();
                errorMsg = errJson.error || errorMsg;
            } catch (_) {}
            const err = new Error(errorMsg);
            (err as any).status = res.status;
            throw err;
        }

        return res.json();
    },

    async saveOffer(offer: Offer): Promise<string> {
        return offersRepo.save(offer);
    },

    async updateOffer(id: string, updates: Partial<Offer> & { expectedVersion?: number }): Promise<void> {
        return offersRepo.update(id, updates);
    },

    async deleteOffer(id: string, options?: { expectedVersion?: number }): Promise<void> {
        return offersRepo.delete(id, options);
    },

    async seedTemplates(): Promise<void> {
        // Backend performs idempotent seeding on MongoDB connection.
        // Client does not use localStorage flags or seed templates client-side.
        return;
    },

    // Constructions
    async getConstructionsForOffer(offerId: string): Promise<Construction[]> {
        return constructionsRepo.getByIndex('by-offer', offerId);
    },

    async saveConstruction(construction: Construction): Promise<string> {
        return constructionsRepo.save(construction);
    },

    async deleteConstruction(id: string): Promise<void> {
        return constructionsRepo.delete(id);
    },

    // Helper to create empty offer
    createEmptyOffer(): Offer {
        return {
            id: uuidv4(),
            number: '',
            recordKind: 'offer',
            clientId: '',
            location: '',
            status: 'draft',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            materialsCost: 0,
            laborCost: 0,
            totalCost: 0,
            totalNet: 0,
            // VAT & Discount defaults
            vatRate: 23,
            discountType: 'percent',
            discountValue: 0,
            subtotalNet: 0,
            discountAmount: 0,
            vatAmount: 0,
            totalGross: 0,
            rentalItems: [],
            isActive: true
        } as Offer;
    },

    // Adapter Pattern: Create Offer Snapshot from Job
    async createOfferFromJob(job: Job): Promise<string> {
        const { offer, constructions } = JobToOfferAdapter.prepareSnapshot(job);
        const result = await this.createOfferAtomic({ offer, constructions });
        return result.offer.id;
    }
};
