import type { Construction, VatRate, DiscountType } from '../models/types';

export interface OfferCostBreakdown {
    material_cost: number;
    assembly_cost: number;
    transport_cost: number;
    equipment_rental_cost: number;
}

export interface OfferSummary {
    costBreakdown: OfferCostBreakdown;
    subtotalNet: number;
    discountAmount: number;
    totalNet: number;
    vatAmount: number;
    totalGross: number;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

export function calculateOfferSummary(
    constructions: Construction[],
    vatRate: VatRate,
    discountType: DiscountType,
    discountValue: number,
    transportCostNet: number = 0,
    equipmentRentalCostNet: number = 0,
    margin: number = 0
): OfferSummary {
    // 1. Material cost — sum of materialCosts.total from all constructions
    const materialCost = round2(
        constructions.reduce((sum, c) => sum + (c.materialCosts?.total || 0), 0)
    );

    // 2. Assembly cost — sum of installationCosts.total from all constructions
    const assemblyCost = round2(
        constructions.reduce((sum, c) => sum + (c.installationCosts?.total || 0), 0)
    );

    // 3. Transport cost — provided externally (from TransportSettings)
    const transportCost = round2(transportCostNet);

    // 4. Equipment rental cost — provided externally (from RentalEquipmentSection)
    const equipmentRentalCost = round2(equipmentRentalCostNet);

    const costBreakdown: OfferCostBreakdown = {
        material_cost: materialCost,
        assembly_cost: assemblyCost,
        transport_cost: transportCost,
        equipment_rental_cost: equipmentRentalCost,
    };

    // 5. Subtotal = sum of 4 buckets
    const costTotal = round2(materialCost + assemblyCost + transportCost + equipmentRentalCost);

    // 6. Apply Margin (markup on costs)
    const marginAmount = round2(costTotal * (margin / 100));
    const subtotalNet = round2(costTotal + marginAmount);

    // 7. Calculate Discount
    let discountAmount = 0;
    if (discountType === 'percent') {
        discountAmount = subtotalNet * (Math.max(0, discountValue) / 100);
    } else if (discountType === 'amount') {
        discountAmount = Math.min(Math.max(0, discountValue), subtotalNet);
    }
    discountAmount = round2(discountAmount);

    // 8. Net Total
    const totalNet = round2(Math.max(0, subtotalNet - discountAmount));

    // 9. VAT
    const vatAmount = round2(totalNet * (vatRate / 100));

    // 10. Gross
    const totalGross = round2(totalNet + vatAmount);

    return {
        costBreakdown,
        subtotalNet,
        discountAmount,
        totalNet,
        vatAmount,
        totalGross,
    };
}
