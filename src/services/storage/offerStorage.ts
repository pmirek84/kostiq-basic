import { v4 as uuidv4 } from 'uuid';
import type { Offer, Construction, Job } from '../../models/types';
import { JobToOfferAdapter } from '../adapters/JobToOfferAdapter';
import { getAdapter } from './adapterFactory';
import { settingsStorage } from './settingsStorage';

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

    async saveOffer(offer: Offer): Promise<string> {
        return offersRepo.save(offer);
    },

    async deleteOffer(id: string): Promise<void> {
        return offersRepo.delete(id);
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
            number: 'DRAFT/' + new Date().getTime(),
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
            rentalItems: []
        } as Offer;
    },

    // Adapter Pattern: Create Offer Snapshot from Job
    async createOfferFromJob(job: Job): Promise<string> {
        // Use the Adapter to prepare the snapshot
        const { offer, constructions } = JobToOfferAdapter.prepareSnapshot(job);

        // Save Header
        await this.saveOffer(offer);

        // Save Items (Constructions)
        for (const construction of constructions) {
            await this.saveConstruction(construction);
        }

        return offer.id;
    }
};
