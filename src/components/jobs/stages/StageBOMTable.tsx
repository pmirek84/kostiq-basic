import { useState } from 'react';
import type { StageMaterialDemand } from '../../../models/types';
import { ChevronDown, ChevronRight, AlertCircle, TrendingUp } from 'lucide-react';

interface StageBOMTableProps {
    data: StageMaterialDemand | null;
    isLoading: boolean;
    onRecalculate: () => void;
}

export const StageBOMTable = ({ data, isLoading, onRecalculate }: StageBOMTableProps) => {
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

    const toggleExpand = (materialId: string) => {
        const next = new Set(expandedItems);
        if (next.has(materialId)) {
            next.delete(materialId);
        } else {
            next.add(materialId);
        }
        setExpandedItems(next);
    };

    if (isLoading) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/4 mx-auto mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto"></div>
            </div>
        );
    }

    if (!data || data.items.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                <div className="flex justify-center mb-4">
                    <div className="p-3 bg-gray-100 rounded-full">
                        <TrendingUp className="w-6 h-6 text-gray-400" />
                    </div>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Brak materiałów</h3>
                <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                    Dodaj konstrukcje do etapu i kliknij "Przelicz", aby zobaczyć zestawienie materiałowe.
                </p>
                <button
                    onClick={onRecalculate}
                    className="btn btn-primary"
                >
                    Przelicz materiały
                </button>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Header Summary */}
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h3 className="font-bold text-gray-900">Zestawienie materiałowe (BOM)</h3>
                    <p className="text-sm text-gray-500">
                        {data.items.length} pozycji • Zaktualizowano: {new Date(data.createdAt).toLocaleTimeString()}
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <span className="text-xs text-gray-500 uppercase font-semibold">Koszt całkowity</span>
                        <div className="text-xl font-bold text-blue-600">
                            {data.totalCost.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}
                        </div>
                    </div>
                    <button
                        onClick={onRecalculate}
                        className="btn btn-secondary text-sm"
                    >
                        Odśwież
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-white text-gray-500 border-b border-gray-200">
                        <tr>
                            <th className="w-8 px-4 py-3"></th>
                            <th className="px-4 py-3 font-medium">Materiał</th>
                            <th className="px-4 py-3 font-medium text-right">Ilość netto</th>
                            <th className="px-4 py-3 font-medium text-right">Narzut</th>
                            <th className="px-4 py-3 font-medium text-right">Ilość brutto</th>
                            <th className="px-4 py-3 font-medium text-right">Cena jedn.</th>
                            <th className="px-4 py-3 font-medium text-right">Wartość</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {data.items.map((item) => (
                            <>
                                <tr
                                    key={item.materialId}
                                    className="hover:bg-gray-50 transition-colors cursor-pointer group"
                                    onClick={() => toggleExpand(item.materialId)}
                                >
                                    <td className="px-4 py-3 text-gray-400">
                                        {expandedItems.has(item.materialId) ? (
                                            <ChevronDown className="w-4 h-4" />
                                        ) : (
                                            <ChevronRight className="w-4 h-4" />
                                        )}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                                        {item.materialName}
                                        {item.sourceBreakdown.length === 0 && (
                                            <span className="ml-2 inline-flex items-center text-xs text-amber-500" title="Brak powiązania ze źródłem">
                                                <AlertCircle className="w-3 h-3" />
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-gray-600">
                                        {item.quantity.toFixed(2)} {item.unit}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-500 text-xs">
                                        {item.wastePercent}%
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold font-mono text-gray-900">
                                        {item.totalQuantity.toFixed(2)} {item.unit}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-500">
                                        {item.unitPrice.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                                        {item.totalCost.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł
                                    </td>
                                </tr>
                                {/* Expanded Details */}
                                {expandedItems.has(item.materialId) && (
                                    <tr className="bg-gray-50">
                                        <td colSpan={7} className="px-4 py-3 pl-12">
                                            <div className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wider">
                                                Źródła zapotrzebowania:
                                            </div>
                                            <div className="space-y-1">
                                                {item.sourceBreakdown.map((source, idx) => (
                                                    <div key={idx} className="flex justify-between items-center text-sm border-b border-gray-200 last:border-0 pb-1 last:pb-0">
                                                        <span className="text-gray-700">{source.constructionName}</span>
                                                        <span className="font-mono text-gray-600">
                                                            {source.baseQuantity.toFixed(2)} {item.unit}
                                                            <span className="text-gray-400 mx-1">•</span>
                                                            {(source.baseQuantity * item.unitPrice).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
