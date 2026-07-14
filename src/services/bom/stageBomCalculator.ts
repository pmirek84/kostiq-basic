import { getAdapter } from '../storage/adapterFactory';
import { jobStageItemStorage } from '../storage/jobStageItemStorage';
import type {
    JobStageItem,
    Construction,
    InstallationStandard,
    Material,
    MaterialDemand,
    StageMaterialDemand,
    ConstructionMaterialUsage
} from '../../models/types';

export const stageBomCalculator = {

    async calculateForStage(items: JobStageItem[]): Promise<StageMaterialDemand> {
        if (!items || items.length === 0) {
            return {
                stageId: '',
                items: [],
                totalCost: 0,
                createdAt: new Date().toISOString()
            };
        }

        const stageId = items[0].stageId;
        const demandsMap = new Map<string, MaterialDemand>();

        // 1. Load context data (Standards, Materials, Offer Constructions)
        // Optimization: In real app, we might want to cache these or load bulk
        const standardsRepo = getAdapter<InstallationStandard>('standards');
        const materialsRepo = getAdapter<Material>('materials');

        const standards = await standardsRepo.getAll();
        const defaultStandard = standards.find(s => s.isDefault);
        const materials = await materialsRepo.getAll();
        const materialsMap = new Map(materials.map(m => [m.id, m]));

        // 2. Process each JobStageItem
        for (const item of items) {
            const construction = await this.getConstruction(item);
            if (!construction) continue;

            // Determine applicable rules
            // Priority: Construction-specific override -> Default Standard -> None
            let breakdown: ConstructionMaterialUsage[] = [];

            if (construction.materialBreakdown && Array.isArray(construction.materialBreakdown) && construction.materialBreakdown.length > 0) {
                // Use manual/frozen breakdown from offer if exists
                breakdown = construction.materialBreakdown;
            } else {
                // Calculate dynamic from standard
                // Finding best matching standard
                // For now, simple logic: use default if applies
                const standard = defaultStandard; // Simplify selection for now
                if (standard) {
                    breakdown = this.applyStandard(construction, standard, materialsMap);
                } else {
                    console.warn(`[stageBomCalculator] No installation standard found for construction: ${construction.name} (${construction.id}). BOM will be empty for this item.`);
                }
            }

            // Aggregate demands
            // Scale by quantity in stage
            const qtyInStage = item.quantityInStage || 0;

            for (const usage of breakdown) {
                const totalItemQty = usage.quantity * qtyInStage;

                // Determine waste percent: prioritize rule-level override, then material-level setting, fallback to 5%
                const material = materialsMap.get(usage.materialId);
                const waste = (usage as any).wastePercent !== undefined 
                    ? (usage as any).wastePercent 
                    : (material?.wastePercent !== undefined ? material.wastePercent : 5);

                const unitPrice = usage.unitPrice || material?.defaultUnitPrice || 0;

                if (demandsMap.has(usage.materialId)) {
                    const existing = demandsMap.get(usage.materialId)!;
                    existing.quantity += totalItemQty;
                    existing.totalQuantity += totalItemQty * (1 + waste / 100);
                    existing.totalCost += totalItemQty * (1 + waste / 100) * unitPrice;
                    existing.sourceBreakdown.push({
                        constructionId: item.constructionId,
                        constructionName: item.constructionName,
                        baseQuantity: totalItemQty,
                        ruleId: usage.ruleId
                    });
                } else {
                    demandsMap.set(usage.materialId, {
                        materialId: usage.materialId,
                        materialName: usage.materialName || material?.name || 'Unknown Material',
                        unit: usage.unit,
                        quantity: totalItemQty,
                        wastePercent: waste,
                        totalQuantity: totalItemQty * (1 + waste / 100),
                        unitPrice: unitPrice,
                        totalCost: totalItemQty * (1 + waste / 100) * unitPrice,
                        sourceBreakdown: [{
                            constructionId: item.constructionId,
                            constructionName: item.constructionName,
                            baseQuantity: totalItemQty,
                            ruleId: usage.ruleId
                        }]
                    });
                }
            }
        }

        // Round results to 2 decimal places to prevent float precision issues (e.g. 160.125)
        const demandItems = Array.from(demandsMap.values()).map(item => {
            const quantity = Math.round(item.quantity * 100) / 100;
            const totalQuantity = Math.round(item.totalQuantity * 100) / 100;
            const totalCost = Math.round(item.totalCost * 100) / 100;
            return {
                ...item,
                quantity,
                totalQuantity,
                totalCost
            };
        });
        const totalCost = Math.round(demandItems.reduce((acc, d) => acc + d.totalCost, 0) * 100) / 100;

        return {
            stageId,
            items: demandItems,
            totalCost,
            createdAt: new Date().toISOString()
        };
    },

    async calculateForJob(jobId: string): Promise<StageMaterialDemand> {
        // Use the same storage as JobStageDetail/JobsContext for consistency
        const jobItems = await jobStageItemStorage.getByJob(jobId);

        if (jobItems.length === 0) {
            return {
                stageId: 'JOB_AGGREGATE',
                items: [],
                totalCost: 0,
                createdAt: new Date().toISOString()
            };
        }

        const rawResult = await this.calculateForStage(jobItems);

        return {
            ...rawResult,
            stageId: jobId
        };
    },


    async getConstruction(item: JobStageItem): Promise<Construction | undefined> {
        const constructionRepo = getAdapter<Construction>('constructions');
        return constructionRepo.getById(item.constructionId);
    },

    applyStandard(c: Construction, s: InstallationStandard, matMap: Map<string, Material>): ConstructionMaterialUsage[] {
        const usage: ConstructionMaterialUsage[] = [];

        // Perimeter calculation
        const qty = c.quantity || 1;
        const width = c.width || 0;
        const height = c.height || 0;

        // Ensure we don't divide by zero if quantity is weird, though 1 is safe default
        const perimeterM = (c.totalPerimeter || ((width + height) * 2 / 1000 * qty)) / qty; // per unit perimeter

        for (const rule of s.rules) {
            const mat = matMap.get(rule.materialId);
            if (!mat) continue;

            // Determine calculation basis: 'mb' (per meter of edge) vs 'szt' (per piece of construction)
            const basis = rule.basis || 'mb';
            let qtyPerUnit = 0;
            if (basis === 'szt') {
                qtyPerUnit = rule.usagePerMeter; // direct per construction piece
            } else {
                qtyPerUnit = rule.usagePerMeter * perimeterM; // scaled by unit perimeter
            }

            usage.push({
                materialId: rule.materialId,
                materialName: mat.name,
                category: mat.category,
                unit: rule.usageUnit || mat.unit,
                quantity: qtyPerUnit,
                unitPrice: mat.defaultUnitPrice,
                totalCost: qtyPerUnit * mat.defaultUnitPrice, // raw cost
                source: 'standard_montazu',
                ruleId: rule.id,
                basis,
                wastePercent: rule.wastePercent !== undefined ? rule.wastePercent : mat.wastePercent
            } as any);
        }

        return usage;
    }
};
