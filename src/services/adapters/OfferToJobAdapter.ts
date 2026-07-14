import { v4 as uuidv4 } from 'uuid';
import type {
    Job,
    JobStage,
    JobStageItem,
    Offer,
    Construction,
    OfferItemAllocation,
    JobLaborBudget
} from '../../models/types';

interface JobCreationContext {
    offer?: Offer;
    constructions: Construction[];
    jobData: Partial<Job>;
    stages: Partial<JobStage>[];
    allocations: OfferItemAllocation[];
    jobCode: string; // Generated outside or passed in
}

interface JobSnapshot {
    job: Job;
    stageItems: JobStageItem[];
}

/**
 * Adapter responsible for converting an Offer (and Wizard data) into a Job Snapshot.
 * This encapsulates all the complex financial logic, margin preservation, and stage distribution.
 */
export class OfferToJobAdapter {

    public static prepareSnapshot(context: JobCreationContext): JobSnapshot {
        const { offer, constructions, jobData, stages, allocations, jobCode } = context;
        const jobId = uuidv4();
        const date = new Date().toISOString();

        // 1. Prepare Base Stages
        // Map wizard stages to internal JobStage objects
        const processedStages = stages.map(stage => ({
            ...stage,
            id: stage.id || uuidv4(),
            jobId: jobId,
            status: 'planowany' as const,
            billingType: 'hourly' as const, // Default, can be overridden
            plannedRevenueNet: Number(stage.plannedRevenueNet) || 0,
            plannedCostNet: Number(stage.plannedCostNet) || 0,
            plannedLaborHours: 0,
            plannedLaborCost: 0
        }));

        // 2. Prepare Allocations
        const processedAllocations = allocations.map(alloc => ({
            ...alloc,
            id: uuidv4(),
            jobId: jobId,
            jobStageId: alloc.jobStageId
        }));

        // 3. Financial Calculations
        // Aggregators
        let jobMaterialsCost = 0;
        let jobLaborCost = 0;
        let jobLaborHours = 0;
        let jobLogisticsCost = 0;

        // Labor Budget Breakdown
        const laborBudget: JobLaborBudget = {
            totalPlannedNet: 0,
            ownPlannedNet: 0,
            subcontractorPlannedNet: 0
        };
        const stageLaborBudgetsMap = new Map<string, any[]>();

        // 3a. Calculate Logistics & Extra Labor from Offer Settings
        let extraLaborCost = 0;
        let extraHours = 0;

        if (offer) {
            const settings = offer.settings as any;

            // Logistics
            const constructionTransport = offer.constructionTransportCost ||
                (settings?.constructionTransport ? (settings.constructionTransport.distance * settings.constructionTransport.ratePerKm * settings.constructionTransport.roundTrips) : 0);

            const workerTransport = offer.workerTransportCost ||
                (settings?.workerTransport ? (settings.workerTransport.distance * settings.workerTransport.ratePerKm * settings.workerTransport.roundTrips) : 0);

            jobLogisticsCost = (offer.logisticsCost || 0) +
                constructionTransport +
                workerTransport +
                (offer.equipmentRentalCost || 0);

            // Extra Work Time (Settings)
            if (settings?.workTime) {
                const { workTime, workerCount, hourlyRate } = settings.workTime;
                extraHours = (workTime || 0) * (workerCount || 0);
                extraLaborCost = (offer.workTimeCost || 0) > 0
                    ? offer.workTimeCost!
                    : extraHours * (hourlyRate || 0);
            }
        }

        // 3b. Distribute Extras to FIRST Stage
        // This ensures the "Hidden" costs/revenues from the Offer (Logistics, WorkTime) are accounted for in the Job.
        if (processedStages.length > 0 && offer) {
            const firstStage = processedStages[0];
            const settings = offer.settings as any;

            // Revenue logic: Price = Cost * MarginMultiplier
            const marginPercent = settings?.margin || 0;
            const marginMultiplier = 1 + (marginPercent / 100);

            const extraLaborPrice = extraLaborCost * marginMultiplier;
            const logisticsPrice = jobLogisticsCost * marginMultiplier;

            // Update First Stage Stats
            firstStage.plannedLaborHours = (firstStage.plannedLaborHours || 0) + extraHours;
            firstStage.plannedLaborCost = (firstStage.plannedLaborCost || 0) + extraLaborCost;

            // Crucial: Add the Revenue for these items to the stage so the Job Total matches the Offer Total
            firstStage.plannedRevenueNet = (firstStage.plannedRevenueNet || 0) + extraLaborPrice + logisticsPrice;

            // Add to global budget
            laborBudget.totalPlannedNet += extraLaborCost;
            laborBudget.ownPlannedNet += extraLaborCost; // Default to own

            jobLaborCost += extraLaborCost;
            jobLaborHours += extraHours;
        }

        // 3c. Calculate Costs from Allocations (Constrations)
        // We iterate stages to aggregate their costs
        const constructionMap = new Map(constructions.map(c => [c.id, c]));

        processedStages.forEach(stage => {
            let stageAllocatedLaborCost = 0;
            let stageAllocatedLaborHours = 0;
            let stageAllocatedMatCost = 0;

            const stageAllocations = processedAllocations.filter(a => a.jobStageId === stage.id);

            stageAllocations.forEach(alloc => {
                const c = constructionMap.get(alloc.offerItemId);
                if (c) {
                    // Determine allocation ratio
                    let ratio = 1;
                    if (alloc.allocatedQuantity !== undefined && c.quantity > 0) {
                        ratio = alloc.allocatedQuantity / c.quantity;
                    } else if (alloc.allocatedValueNet && c.totalCost > 0) {
                        ratio = alloc.allocatedValueNet / c.totalCost;
                    }

                    // Calculate portions
                    const itemLaborHours = (c.plannedLaborHours || 0) * ratio;
                    // Use detailed planned cost if available, else fallback to installation total
                    const itemLaborCost = (c.plannedLaborCostNet || c.installationCosts?.total || 0) * ratio;
                    const itemMaterialCost = (c.materialCosts?.total || 0) * ratio;

                    stageAllocatedLaborHours += itemLaborHours;
                    stageAllocatedLaborCost += itemLaborCost;
                    stageAllocatedMatCost += itemMaterialCost;

                    // Detail Budget
                    if (itemLaborCost > 0) {
                        const existingBudget = stageLaborBudgetsMap.get(stage.id) || [];
                        existingBudget.push({
                            jobStageId: stage.id,
                            plannedNet: itemLaborCost,
                            plannedHours: itemLaborHours,
                            source: 'own'
                        });
                        stageLaborBudgetsMap.set(stage.id, existingBudget);
                    }
                }
            });

            // Update Stage Totals (Add to what might have been added by Extras)
            stage.plannedLaborHours = (stage.plannedLaborHours || 0) + stageAllocatedLaborHours;
            stage.plannedLaborCost = (stage.plannedLaborCost || 0) + stageAllocatedLaborCost;

            // Note: Material cost is usually tracked globally or per stage differently. 
            // In JobsContext it wasn't explicitly stored on Stage, so we track global.
            // But we can update plannedCostNet if we want "Cost Base" for the stage.
            // stage.plannedCostNet is set usually manually or derived. 
            // If we want it to be auto-calculated:
            stage.plannedCostNet = (stage.plannedCostNet || 0) + stageAllocatedLaborCost + stageAllocatedMatCost;

            // Global Sums
            jobMaterialsCost += stageAllocatedMatCost;
            laborBudget.totalPlannedNet += stageAllocatedLaborCost;
            laborBudget.ownPlannedNet += stageAllocatedLaborCost;
            jobLaborCost += stageAllocatedLaborCost;
            jobLaborHours += stageAllocatedLaborHours;
        });

        // 4. Final Totals & Margins
        const finalTotalRevenueNet = processedStages.reduce((acc, s) => acc + (s.plannedRevenueNet || 0), 0);

        // Calculate Revenue Share for each stage
        const finalStages = processedStages.map(s => ({
            ...s,
            revenueSharePercent: finalTotalRevenueNet > 0
                ? (s.plannedRevenueNet / finalTotalRevenueNet) * 100
                : 0
        }));


        // (margin is calculated from frozen values below)        // 5. Construct Job Object
        // If the offer has a costBreakdown (from the 4-basket calculator), use those
        // values as the authoritative planned costs. Otherwise, fall back to calculated values.
        const cb = offer?.costBreakdown;
        // Prioritize: 4-basket breakdown -> Old flat fields -> Dynamic calculation
        const frozenMaterials = cb?.material_cost ?? (offer?.materialsCost || jobMaterialsCost);
        const frozenLabor = cb?.assembly_cost ?? (offer?.laborCost || jobLaborCost);
        const frozenLogistics = cb?.transport_cost ?? (jobLogisticsCost - (offer?.equipmentRentalCost || 0));
        const frozenEquipment = cb?.equipment_rental_cost ?? offer?.equipmentRentalCost ?? 0;
        const frozenOther = offer?.otherCosts ?? 0;
        const frozenRevenue = finalTotalRevenueNet || offer?.totalNet || 0;
        const frozenTotalCost = frozenMaterials + frozenLabor + frozenLogistics + frozenEquipment + frozenOther;

        const frozenMarginPercent = frozenRevenue > 0
            ? ((frozenRevenue - frozenTotalCost) / frozenRevenue) * 100
            : 0;

        const newJob: Job = {
            ...jobData,
            id: jobId,
            jobCode,
            createdAt: date,
            updatedAt: date,
            riskFlag: jobData.riskFlag || 'none',
            status: jobData.status || 'planned',
            clientId: jobData.clientId || '',
            clientName: jobData.clientName || '',
            name: jobData.name || '',
            location: jobData.location || '',

            // === FROZEN FINANCIALS (physically copied from offer) ===
            totalPlannedRevenueNet: frozenRevenue,
            revenuePlannedNet: frozenRevenue,
            materialsPlannedNet: frozenMaterials,
            laborPlannedNet: frozenLabor,
            logisticsPlannedNet: frozenLogistics,
            equipmentPlannedNet: frozenEquipment,
            otherCostsNet: frozenOther,
            plannedTotalCost: frozenTotalCost,
            marginPlannedPercent: parseFloat(frozenMarginPercent.toFixed(2)),

            // Detailed labor data (from construction calculation)
            plannedLaborHours: jobLaborHours,
            plannedLaborCost: jobLaborCost,

            // Children
            stages: finalStages as JobStage[],
            allocations: processedAllocations,
            laborBudget,
            stageLaborBudgets: Array.from(stageLaborBudgetsMap.values()).flat(),

            // Link
            offerId: offer?.id,
            offerNumber: offer?.number,
            sourceOfferId: offer?.id
        };

        // 6. Create JobStageItems (BOM Snapshots)
        // These are critical for tracking exactly what "Window X" means in "Stage Y"
        let jobStageItems: JobStageItem[] = processedAllocations.map(alloc => ({
            id: uuidv4(),
            jobId: jobId,
            stageId: alloc.jobStageId,
            constructionId: alloc.offerItemId,
            constructionName: alloc.offerItemName || 'Konstrukcja',
            offerId: offer?.id || '',
            quantityFromOffer: alloc.originalQuantity || 1,
            quantityInStage: alloc.allocatedQuantity || 1,
            createdAt: date,
            updatedAt: date
        }));

        // Fallback: if no allocations, assign all constructions to the first stage
        if (jobStageItems.length === 0 && constructions.length > 0 && processedStages.length > 0) {
            const firstStageId = processedStages[0].id;
            jobStageItems = constructions.map(c => ({
                id: uuidv4(),
                jobId: jobId,
                stageId: firstStageId,
                constructionId: c.id,
                constructionName: c.name,
                offerId: offer?.id || '',
                quantityFromOffer: c.quantity,
                quantityInStage: c.quantity,
                createdAt: date,
                updatedAt: date
            }));
        }

        return { job: newJob, stageItems: jobStageItems };
    }
}
