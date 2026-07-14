import type { InstallationStandard, Construction, Material, ConstructionMaterialUsage } from '../models/types';

interface ApplyStandardResult {
    lines: ConstructionMaterialUsage[];
    totalMaterialsCost: number;
}

/**
 * Przelicza materiały montażowe dla danej konstrukcji na podstawie standardu.
 * - width/height w mm
 * - quantity = liczba identycznych konstrukcji
 */
export function applyInstallationStandardToConstruction(
    construction: Pick<Construction, 'id' | 'width' | 'height' | 'quantity'>,
    standard: InstallationStandard,
    materialsById: Record<string, Material>
): ApplyStandardResult {
    const qty = construction.quantity ?? 1;

    // Dimensions in meters
    const heightM = construction.height;
    const widthM = construction.width;

    const verticalLengthM = 2 * heightM * qty;
    const topLengthM = widthM * qty;
    const bottomLengthM = widthM * qty;
    const perimeterM = (2 * heightM + 2 * widthM) * qty;

    const lines: ConstructionMaterialUsage[] = [];

    for (const rule of standard.rules) {
        const material = materialsById[rule.materialId];
        if (!material) {
            console.warn('Missing material for rule', rule);
            continue;
        }

        let edgeLengthM = 0;
        switch (rule.edge) {
            case 'vertical':
                edgeLengthM = verticalLengthM;
                break;
            case 'top':
                edgeLengthM = topLengthM;
                break;
            case 'bottom':
                edgeLengthM = bottomLengthM;
                break;
            case 'perimeter':
            default:
                edgeLengthM = perimeterM;
                break;
        }

        const quantity = rule.usagePerMeter * edgeLengthM;
        const totalCost = quantity * (material.defaultUnitPrice || 0);

        lines.push({
            // id: `${construction.id}_${rule.id}`, // ConstructionMaterialUsage doesn't strictly need ID but usually good
            materialId: material.id,
            materialName: material.name,
            category: material.category,
            side: rule.edge,
            unit: material.unit,
            quantity,
            unitPrice: material.defaultUnitPrice || 0,
            totalCost, // totalCost or cost? Types says 'cost' and 'totalCost'? Types updated to have totalCost.
            source: 'standard_montazu',
            ruleId: rule.id
        });
    }

    const totalMaterialsCost = lines.reduce((sum, l) => sum + l.totalCost, 0);

    return { lines, totalMaterialsCost };
}
