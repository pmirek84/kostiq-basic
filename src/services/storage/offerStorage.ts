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
        const SEED_KEY = 'costframe_templates_seeded_v2';
        if (localStorage.getItem(SEED_KEY)) return;

        const offers = await this.getAllOffers();
        const templateExists = offers.some(o => o.offerTemplateType === 'detailed' && o.title === 'Oferta montażu konstrukcji aluminiowych');

        if (!templateExists) {
            // Get dynamic company name
            let companyName = 'Twoja Firma';
            try {
                const settings = await settingsStorage.getSettings();
                if (settings && settings.companyName) {
                    companyName = settings.companyName;
                }
            } catch (e) {
                console.warn('Could not load company settings for seeding', e);
            }

            const standardTemplate: Offer = {
                id: uuidv4(),
                number: 'WZÓR-STD-01',
                clientId: '',
                location: 'Koszalin',
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

                offerTemplateType: 'detailed',
                title: 'Oferta montażu konstrukcji aluminiowych',
                scopeOfWork: [
                    'Montaż konstrukcji aluminiowych zgodnie z załącznikiem nr 1',
                    'Usługa odbędzie się na terenie zakładu produkcyjnego klienta Zleceniodawcy pod adresem: Koszalin, ul. Lniana 16',
                    'Dokładny pomiar produkcyjny i przygotowanie konstrukcji do montażu jest po stronie Zleceniodawcy.',
                    'Po stronie Zleceniodawcy jest przygotowanie otworów montażowych w konstrukcjach aluminiowych zgodnie z wymaganiami systemodawcy.',
                    `Zleceniodawca jest zobowiązany do poinformowania na 1 tydzień przed planowanym montażem firmę ${companyName} o możliwości rozpoczęcia montażu w danym terminie.`,
                    'Montaż odbędzie się 1-etapowo i w ciągłości dlatego Zleceniodawca gwarantuje dostawę wszystkich niezbędnych konstrukcji, elementów i materiałów w ustalonym terminie.'
                ],
                customMaterials: {
                    providedByUs: ['śruby do mocowania oraz folia EPDM wraz z klejem'],
                    providedByClient: ['taśma rozprężna 3-warstwowa, dopasowana do profilu i wymiarów otworów']
                },
                notes: [
                    'Oferta nie obejmuje obróbek blacharskich.'
                ],
                settings: {
                    margin: 0,
                    discount: 0,
                    workTime: { workTime: 0, workerCount: 0, hourlyRate: 0 },
                    installationRates: {}
                },
                rentalItems: []
            };

            await this.saveOffer(standardTemplate);

            // Seed Default Construction for this offer
            const constructionId = uuidv4();
            const construction: Construction = {
                id: constructionId,
                offerId: standardTemplate.id,
                number: 1,
                name: 'Witryna W1',
                type: 'witryna',
                width: 1500,
                height: 2200,
                quantity: 5,
                area: 3.3, // 1.5 * 2.2
                perimeter: 7.4, // 2 * (1.5 + 2.2)
                // notes: 'Szyba P4', // Not in type
                installationLocation: 'zew',
                weight: 50,
                totalArea: 3.3 * 5,
                totalPerimeter: 7.4 * 5,
                totalCost: 0,
                materialCosts: { items: [], total: 0 },
                installationCosts: { rate: 0, total: 0 },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await this.saveConstruction(construction);
            console.log('Seeded standard offer template with construction');
        }

        localStorage.setItem(SEED_KEY, 'true');
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
