import { FileText, Box, PenTool as Tool } from 'lucide-react';
import type { Construction } from '../../models/types';

interface OfferSummaryProps {
    constructions: Construction[];
    transportCosts: {
        constructionTransport: number;
        workerTransport: number;
    };
    workTimeCost: number;
    equipmentRentalCost?: number;
    margin: number;
    discount: number;
    onSettingsChange: (settings: { margin: number; discount: number }) => void;
}

export function OfferSummary({
    constructions,
    transportCosts,
    workTimeCost,
    equipmentRentalCost = 0,
    margin,
    discount,
    onSettingsChange
}: OfferSummaryProps) {
    const totalMaterialsCost = constructions.reduce((sum, c) => sum + c.materialCosts.total, 0);
    const totalInstallationCost = constructions.reduce((sum, c) => sum + c.installationCosts.total, 0);
    const totalTransportCost = transportCosts.constructionTransport + transportCosts.workerTransport + workTimeCost;
    const subtotal = totalMaterialsCost + totalInstallationCost + totalTransportCost + equipmentRentalCost;

    const marginAmount = (subtotal * margin) / 100;
    const discountAmount = ((subtotal + marginAmount) * discount) / 100;
    const grandTotal = subtotal + marginAmount - discountAmount;

    const totalWeight = constructions.reduce((sum, c) => sum + (c.weight * c.quantity), 0);
    const totalQuantity = constructions.reduce((sum, c) => sum + c.quantity, 0);

    // 4-section KOSTIQ cost breakdown
    const costSections = [
        {
            label: '1. Materiały',
            amount: totalMaterialsCost,
            color: 'text-blue-600',
            bg: 'bg-blue-50'
        },
        {
            label: '2. Montaż (robocizna)',
            amount: totalInstallationCost,
            color: 'text-green-600',
            bg: 'bg-green-50'
        },
        {
            label: '3. Transport',
            amount: totalTransportCost,
            details: [
                { label: 'Transport konstrukcji', amount: transportCosts.constructionTransport },
                { label: 'Transport pracowników', amount: transportCosts.workerTransport },
                { label: 'Koszt pracy', amount: workTimeCost }
            ],
            color: 'text-orange-600',
            bg: 'bg-orange-50'
        },
        {
            label: '4. Wynajem sprzętu',
            amount: equipmentRentalCost,
            color: 'text-purple-600',
            bg: 'bg-purple-50'
        }
    ];

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Szczegółowe podsumowanie oferty
                </h3>

                {/* Zestawienie konstrukcji */}
                <div className="mb-8">
                    <div className="flex items-center space-x-2 mb-4">
                        <Box className="h-5 w-5 text-gray-400" />
                        <h4 className="font-medium text-gray-400">
                            Konstrukcje (łącznie: {totalQuantity} szt., {totalWeight.toFixed(2)} kg)
                        </h4>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <table className="min-w-full">
                            <thead>
                                <tr>
                                    <th className="text-left text-sm font-medium text-gray-500">Typ</th>
                                    <th className="text-left text-sm font-medium text-gray-500">Ilość</th>
                                    <th className="text-left text-sm font-medium text-gray-500">Powierzchnia</th>
                                    <th className="text-left text-sm font-medium text-gray-500">Obwód</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {constructions.map((construction) => (
                                    <tr key={construction.id}>
                                        <td className="py-2 text-sm text-gray-400">{construction.type}</td>
                                        <td className="py-2 text-sm text-gray-400">{construction.quantity} szt.</td>
                                        <td className="py-2 text-sm text-gray-400">{construction.totalArea.toFixed(2)} m²</td>
                                        <td className="py-2 text-sm text-gray-400">{construction.totalPerimeter.toFixed(2)} m</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 4-sekcyjny podział kosztów KOSTIQ */}
                <div className="mb-8">
                    <div className="flex items-center space-x-2 mb-4">
                        <Tool className="h-5 w-5 text-gray-400" />
                        <h4 className="font-medium text-gray-400">Podział kosztów (4 sekcje KOSTIQ)</h4>
                    </div>
                    <div className="space-y-3">
                        {costSections.map((section) => (
                            <div key={section.label} className={`${section.bg} p-4 rounded-lg border border-gray-200`}>
                                <div className="flex justify-between items-center">
                                    <span className={`text-sm font-semibold ${section.color}`}>{section.label}</span>
                                    <span className={`text-lg font-bold ${section.color}`}>{section.amount.toFixed(2)} PLN</span>
                                </div>
                                {section.details && section.amount > 0 && (
                                    <div className="mt-2 pl-4 space-y-1">
                                        {section.details.map((detail) => (
                                            <div key={detail.label} className="flex justify-between text-xs text-gray-500">
                                                <span>{detail.label}:</span>
                                                <span>{detail.amount.toFixed(2)} PLN</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 p-4 bg-gray-100 rounded-lg border border-gray-300">
                        <div className="flex justify-between text-sm font-semibold text-gray-900">
                            <span>Suma częściowa (netto):</span>
                            <span>{subtotal.toFixed(2)} PLN</span>
                        </div>
                    </div>
                </div>
                {/* Marża i Rabat */}
                <div className="mb-8 bg-gray-50 p-4 rounded-lg space-y-4 border border-gray-200">
                    {/* Marża */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Marża (%)
                        </label>
                        <div className="flex items-center space-x-2">
                            <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={margin}
                                onChange={(e) => onSettingsChange({
                                    margin: parseFloat(e.target.value) || 0,
                                    discount
                                })}
                                className="block w-32 rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            />
                            <span className="text-sm text-gray-500">
                                ({marginAmount.toFixed(2)} PLN)
                            </span>
                        </div>
                    </div>

                    {/* Rabat */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Rabat (%)
                        </label>
                        <div className="flex items-center space-x-2">
                            <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={discount}
                                onChange={(e) => onSettingsChange({
                                    margin,
                                    discount: parseFloat(e.target.value) || 0
                                })}
                                className="block w-32 rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            />
                            <span className="text-sm text-gray-500">
                                ({discountAmount.toFixed(2)} PLN)
                            </span>
                        </div>
                    </div>
                </div>

                {/* Podsumowanie końcowe */}
                <div className="bg-blue-900 text-white p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                        <div>
                            <FileText className="h-6 w-6 mb-2" />
                            <h4 className="font-medium">Wartość całkowita</h4>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-bold">{grandTotal.toFixed(2)} PLN</div>
                            <div className="text-sm opacity-75">netto</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

