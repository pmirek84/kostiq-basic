import { useState } from 'react';
import { Edit2, Save, X } from 'lucide-react';

interface InstallationRate {
    type: string;
    rate: number;
    unit: 'm²' | 'mb' | 'szt.';
}

interface InstallationRatesEditorProps {
    rates: InstallationRate[];
    onRateChange: (type: string, rate: number) => void;
    onUnitChange: (type: string, unit: 'm²' | 'mb' | 'szt.') => void;
}

export default function InstallationRatesEditor({ rates, onRateChange, onUnitChange }: InstallationRatesEditorProps) {
    const [editingType, setEditingType] = useState<string | null>(null);
    const [editedRate, setEditedRate] = useState<number>(0);
    const [editedUnit, setEditedUnit] = useState<'m²' | 'mb' | 'szt.'>('m²');

    // Deduplicate rates by type, keeping only the first occurrence
    const uniqueRates = rates.reduce<InstallationRate[]>((acc, current) => {
        if (!acc.find(rate => rate.type === current.type)) {
            acc.push(current);
        }
        return acc;
    }, []);

    const handleStartEdit = (rate: InstallationRate) => {
        setEditingType(rate.type);
        setEditedRate(rate.rate);
        setEditedUnit(rate.unit);
    };

    const handleSave = () => {
        if (editingType) {
            onRateChange(editingType, editedRate);
            onUnitChange(editingType, editedUnit);
            setEditingType(null);
        }
    };

    const handleCancel = () => {
        setEditingType(null);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {uniqueRates.map((rate) => (
                <div key={rate.type} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="font-medium text-gray-700 mb-2">{rate.type}</div>

                    {editingType === rate.type ? (
                        <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                                <input
                                    type="number"
                                    value={editedRate}
                                    onChange={(e) => setEditedRate(parseFloat(e.target.value) || 0)}
                                    min="0"
                                    step="0.01"
                                    className="w-24 rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-[#21808D] focus:ring-[#21808D] text-sm"
                                />
                                <select
                                    value={editedUnit}
                                    onChange={(e) => setEditedUnit(e.target.value as 'm²' | 'mb' | 'szt.')}
                                    className="rounded-md border-gray-300 bg-white text-gray-900 shadow-sm focus:border-[#21808D] focus:ring-[#21808D] text-sm"
                                >
                                    <option value="m²">m²</option>
                                    <option value="mb">mb</option>
                                    <option value="szt.">szt.</option>
                                </select>
                            </div>
                            <div className="flex justify-end space-x-2">
                                <button
                                    onClick={handleCancel}
                                    className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="p-1 text-green-600 hover:text-green-700 hover:bg-green-100 rounded"
                                >
                                    <Save className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between">
                            <div className="text-lg font-medium text-gray-900">
                                {rate.rate.toFixed(2)} PLN/{rate.unit}
                            </div>
                            <button
                                onClick={() => handleStartEdit(rate)}
                                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded"
                            >
                                <Edit2 className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
