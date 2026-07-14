import { v4 as uuidv4 } from 'uuid';
import type { Job, Offer, Construction } from '../../models/types';

/**
 * Adapter implementing the creation of an Offer Snapshot from a Job.
 * This ensures strict data mapping and separation of concerns.
 */
export class JobToOfferAdapter {
    static prepareSnapshot(job: Job): { offer: Offer; constructions: Construction[] } {
        const date = new Date();
        const newOfferId = uuidv4();

        // Generate a new number - simple logic, can be replaced by a NumberGenerator strategy later
        const offerNumber = `OFERTA-Z-ZLECENIA/${job.jobCode}/${date.getTime().toString().slice(-4)}`;

        // 1. Map Job -> Offer (Header)
        const offer: Offer = {
            id: newOfferId,
            number: offerNumber,
            clientId: job.clientId,
            location: job.location || '',
            status: 'draft',
            createdAt: date.toISOString(),
            updatedAt: date.toISOString(),

            // Financials - Snapshot from Job Planning
            // Note: Job tracks NET revenue. Offer needs full calc.
            // We assume Job Plan was Net.
            materialsCost: 0, // Recalculated from items
            laborCost: 0,     // Recalculated from items
            totalCost: 0,     // Recalculated from items
            totalNet: job.totalPlannedRevenueNet || 0, // Initial guess, normally sum of items

            // VAT Defaults (Standard 23%)
            vatRate: 23,
            discountType: 'percent',
            discountValue: 0,

            subtotalNet: job.totalPlannedRevenueNet || 0,
            discountAmount: 0,
            vatAmount: (job.totalPlannedRevenueNet || 0) * 0.23,
            totalGross: (job.totalPlannedRevenueNet || 0) * 1.23,

            title: `Oferta na podstawie zlecenia ${job.jobCode}`,
            notes: [`Wygenerowano automatycznie na podstawie zlecenia ${job.jobCode}`],

            // Initialize Settings
            settings: {
                margin: job.marginPlannedPercent || 0, // Preserve margin if known
                discount: 0,
                workTime: {
                    workTime: job.plannedLaborHours || 0,
                    workerCount: 1,
                    hourlyRate: 0
                },
                installationRates: {}
            },

            // Link back to source Job for traceability
            // jobId: job.id // If we had this field
            rentalItems: []
        };

        // 2. Map Job Stages -> Constructions
        // We treat each Stage as a "Construction" (Line Item Group) to preserve structure
        const constructions: Construction[] = [];

        if (job.stages && job.stages.length > 0) {
            job.stages.forEach((stage, index) => {
                const constructionId = uuidv4();
                const isExtra = stage.type === 'dodatkowy';

                // Map Stage Financials to Construction Costs
                // If the stage has specific items (JobStageItems), we should use them (Sprint 2 features)
                // For now, we crudely map the stage totals.

                const construction: Construction = {
                    id: constructionId,
                    offerId: newOfferId,
                    number: index + 1,
                    name: stage.name || `Etap ${index + 1}`,
                    type: isExtra ? 'Prace Dodatkowa' : 'Etap', // Fallback type

                    // Dimensions - not applicable for Stage-based snapshot, default to 0/1
                    width: 0,
                    height: 0,
                    quantity: 1,
                    area: 0,
                    totalArea: 0,
                    perimeter: 0,
                    totalPerimeter: 0,
                    weight: 0,
                    installationLocation: 'wew',

                    // Costs Snapshot
                    materialCosts: {
                        items: [], // We don't have detailed material list in JobStage yet
                        total: 0   // stage.plannedMaterialCost? Not currently on JobStage
                    },
                    installationCosts: {
                        rate: 0,
                        total: stage.plannedRevenueNet || 0 // Map Revenue to "Installation Total" as a lump sum price
                    },

                    totalCost: stage.plannedRevenueNet || 0, // This is Price for the client

                    // We might store internal cost in a different field if Offer supported it, 
                    // but Offer uses detailed breakdown. 
                    // For now, we set totalCost (Price) equal to the Stage Revenue.

                    createdAt: date.toISOString(),
                    updatedAt: date.toISOString()
                };

                constructions.push(construction);
            });
        } else {
            // Fallback if no stages: Create one generic item for the whole job
            const constructionId = uuidv4();
            const construction: Construction = {
                id: constructionId,
                offerId: newOfferId,
                number: 1,
                name: job.name,
                type: 'Zlecenie',
                width: 0,
                height: 0,
                quantity: 1,
                area: 0,
                totalArea: 0,
                perimeter: 0,
                totalPerimeter: 0,
                weight: 0,
                installationLocation: 'wew',
                materialCosts: { items: [], total: 0 },
                installationCosts: { rate: 0, total: job.totalPlannedRevenueNet || 0 },
                totalCost: job.totalPlannedRevenueNet || 0,
                createdAt: date.toISOString(),
                updatedAt: date.toISOString()
            };
            constructions.push(construction);
        }

        // 3. Recalculate Offer Totals based on Constructions (Source of Truth)
        const totalNet = constructions.reduce((sum, c) => sum + c.totalCost, 0);

        offer.subtotalNet = totalNet;
        offer.totalNet = totalNet;
        offer.vatAmount = totalNet * (offer.vatRate / 100);
        offer.totalGross = totalNet + offer.vatAmount;

        return { offer, constructions };
    }
}
