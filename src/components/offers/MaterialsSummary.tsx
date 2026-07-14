import { Package } from 'lucide-react';
import type { Construction } from '../../models/types';

interface MaterialsSummaryProps {
    constructions: Construction[];
}

interface MaterialSummary {
    name: string;
    totalQuantity: number;
    unit: string;
    unitPrice: number;
    totalCost: number;
}

export default function MaterialsSummary({ constructions }: MaterialsSummaryProps) {
    // Aggregate materials from all constructions
    const materialsSummary = constructions.reduce<Record<string, MaterialSummary>>((acc, construction) => {
        construction.materialCosts.items.forEach(item => {
            if (!acc[item.name]) {
                acc[item.name] = {
                    name: item.name,
                    totalQuantity: 0,
                    unit: 'szt.',
                    unitPrice: item.unitPrice,
                    totalCost: 0
                };
            }
            acc[item.name].totalQuantity += item.quantity;
            acc[item.name].totalCost += item.total;
        });
        return acc;
    }, {});

    const sortedMaterials = Object.values(materialsSummary).sort((a, b) => b.totalCost - a.totalCost);
    const totalCost = sortedMaterials.reduce((sum, material) => sum + material.totalCost, 0);

    return (
        <div className="space-y-4">
            <div className="flex items-center space-x-2 text-gray-400">
                <Package className="h-5 w-5" />
                <h4 className="font-medium text-gray-900">Zestawienie materiałów montażowych</h4>
            </div>

            <div className="bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Materiał
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Ilość
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Cena jedn.
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Wartość
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {sortedMaterials.map((material) => (
                                <tr key={material.name} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {material.name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                                        {material.totalQuantity.toFixed(0)} {material.unit}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">
                                        {material.unitPrice.toFixed(2)} PLN
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600 text-right">
                                        {material.totalCost.toFixed(2)} PLN
                                    </td>
                                </tr>
                            ))}
                            <tr className="bg-gray-50 font-medium">
                                <td colSpan={3} className="px-6 py-4 text-sm text-gray-900">
                                    Suma materiałów
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 text-right">
                                    {totalCost.toFixed(2)} PLN
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
