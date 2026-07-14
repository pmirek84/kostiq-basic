import { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Plus, Trash2, Settings } from 'lucide-react';
import type { Construction, ConstructionType, InstallationLocation, InstallationStandard, Material, ConstructionMaterialUsage, SideType } from '../../models/types';
import { standardsStorage } from '../../services/storage/standardsStorage';
import { materialsStorage } from '../../services/storage/materialsStorage';
import { sheetMetalStorage } from '../../services/storage/sheetMetalStorage';
import { applyInstallationStandardToConstruction } from '../../utils/installationStandardCalculator';
import { v4 as uuidv4 } from 'uuid';
import type { SheetMetalItem } from '../../hooks/useSheetMetal';

interface ConstructionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (construction: Construction) => Promise<void>;
    offerId: string;

    initialData?: Construction | null;
    nextNumber: number;
}

const CONSTRUCTION_TYPES: { label: string; value: ConstructionType }[] = [
    { label: 'Okno PVC', value: 'okno_pvc' },
    { label: 'Okno Alu', value: 'okno_alu' },
    { label: 'Okno Drewno', value: 'okno_drewno' },
    { label: 'Drzwi PVC', value: 'drzwi_pvc' },
    { label: 'Drzwi Alu', value: 'drzwi_alu' },
    { label: 'Drzwi Drewno', value: 'drzwi_drewno' },
    { label: 'HS PVC', value: 'hs_pvc' },
    { label: 'HS Alu', value: 'hs_alu' },
    { label: 'HS Drewno', value: 'hs_drewno' },
    { label: 'Fasada', value: 'fasada' },
    { label: 'Witryna', value: 'witryna' },
    { label: 'Fix', value: 'fix' },
    { label: 'Pergola', value: 'pergola' },
    { label: 'Roleta Zew.', value: 'roleta_zew' },
    { label: 'Żaluzja Fasad.', value: 'zaluzja_fasadowa' },
    { label: 'Zip Screen', value: 'zip_screen' },
    { label: 'Inny (Własny)', value: 'custom' } // Added custom option
];

export const ConstructionModal = ({ isOpen, onClose, onSave, offerId, initialData, nextNumber }: ConstructionModalProps) => {
    const [formData, setFormData] = useState<Partial<Construction>>({
        type: 'okno_pvc',
        quantity: 1,
        installationLocation: 'wew',
        widthMm: 0,
        heightMm: 0,
        weight: 0,
        installationStandardId: '',
        materialBreakdown: []
    });

    // Custom Type State
    const [customTypeName, setCustomTypeName] = useState('');

    const [isSaving, setIsSaving] = useState(false);
    const [standards, setStandards] = useState<InstallationStandard[]>([]);
    const [materialsById, setMaterialsById] = useState<Record<string, Material>>({});
    const [sheetMetalsById, setSheetMetalsById] = useState<Record<string, SheetMetalItem>>({});

    // ... (rest of state)

    // New Flashings Item State
    const [newFlashing, setNewFlashing] = useState<{
        materialId: string;
        name: string;
        unit: string;
        quantity: number;
        unitPrice: number;
        edge: SideType;
        isCustom?: boolean;
    }>({
        materialId: '',
        name: '',
        unit: 'mb',
        quantity: 0,
        unitPrice: 0,
        edge: 'vertical'
    });

    useEffect(() => {
        if (isOpen) {
            const loadData = async () => {
                try {
                    const allStandards = await standardsStorage.getAllStandards();
                    const allMaterialsMap = await materialsStorage.getMaterialMapById();
                    const allSheetMetalsMap = await sheetMetalStorage.getMapById();
                    setStandards(allStandards);
                    setMaterialsById(allMaterialsMap);
                    setSheetMetalsById(allSheetMetalsMap);
                } catch (err) {
                    console.error('[ConstructionModal] Failed to load catalog data:', err);
                    // Try loading sheet metal separately as fallback
                    try {
                        const allSheetMetalsMap = await sheetMetalStorage.getMapById();
                        setSheetMetalsById(allSheetMetalsMap);
                    } catch (e) { /* silently ignore */ }
                }
            };
            loadData();

            if (initialData) {
                // Check if the saved type matches any known internal type (by Label match, since DB stores Labels)
                // e.g. DB has "Okno PVC", matches label "Okno PVC" -> value "okno_pvc"
                let internalType = CONSTRUCTION_TYPES.find(t => t.label === initialData.type)?.value;
                let customName = '';

                if (!internalType) {
                    // If not found, it's a custom type or legacy disconnect.
                    // Assume custom.
                    internalType = 'custom';
                    customName = initialData.type;
                }

                setCustomTypeName(customName);
                setFormData({
                    ...initialData,
                    type: internalType as any
                });
            } else {
                setCustomTypeName('');
                setFormData({
                    type: 'okno_pvc',
                    quantity: 1,
                    installationLocation: 'wew',
                    widthMm: 0,
                    heightMm: 0,
                    name: `Pozycja ${nextNumber}`,
                    number: nextNumber,
                    installationStandardId: '',
                    materialBreakdown: []
                });
            }
        }
    }, [isOpen, initialData, nextNumber]);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        let val: string | number = value;

        if (type === 'number') {
            val = parseFloat(value) || 0;
        }

        setFormData(prev => {
            const newData = { ...prev, [name]: val };

            // Auto calculate area/perimeter
            if (name === 'widthMm' || name === 'heightMm' || name === 'quantity') {
                const width = name === 'widthMm' ? (val as number) : (newData.widthMm || 0);
                const height = name === 'heightMm' ? (val as number) : (newData.heightMm || 0);
                const qty = name === 'quantity' ? (val as number) : (newData.quantity || 1);

                const area = (width * height * qty) / 1000000;
                const perimeter = (2 * (width + height) * qty) / 1000;

                newData.totalArea = parseFloat(area.toFixed(2));
                newData.totalPerimeter = parseFloat(perimeter.toFixed(2));
            }

            return newData;
        });
    };

    const applicableStandards = standards.filter(s =>
        Array.isArray(s.applicableTypes) && s.applicableTypes.includes(formData.type as any)
    );

    const [showAllStandards, setShowAllStandards] = useState(false);
    const availableStandards = showAllStandards ? standards : applicableStandards;

    const handleRecalculateFromStandard = () => {
        if (!formData.installationStandardId) return;
        const standard = standards.find(s => s.id === formData.installationStandardId);
        if (!standard) return;

        const baseConstruction = {
            id: formData.id || 'temp',
            width: (formData.widthMm || 0) / 1000,
            height: (formData.heightMm || 0) / 1000,
            quantity: formData.quantity || 1
        };

        const { lines } = applyInstallationStandardToConstruction(baseConstruction, standard, materialsById);

        // Preserve manual lines (Flashings etc)
        const manualLines = (formData.materialBreakdown || []).filter(l => l.source === 'manual');
        const newBreakdown = [...lines, ...manualLines];

        const newTotal = newBreakdown.reduce((sum, l) => sum + l.totalCost, 0);

        setFormData(prev => ({
            ...prev,
            materialBreakdown: newBreakdown,
            materialCosts: {
                ...prev.materialCosts,
                total: newTotal,
                items: []
            }
        }));
    };

    const handleAddFlashing = () => {
        if ((!newFlashing.name && !newFlashing.materialId)) return;
        if (newFlashing.quantity <= 0) return;

        // Calculate total quantity based on construction count
        const constructionCount = formData.quantity || 1;
        const totalQuantity = newFlashing.quantity * constructionCount;

        const newItem: ConstructionMaterialUsage = {
            id: uuidv4(),
            materialId: newFlashing.materialId || 'manual_flashing',
            materialName: newFlashing.name || 'Materiał',
            unit: newFlashing.unit,
            quantity: parseFloat(totalQuantity.toFixed(2)), // Save total quantity
            unitPrice: newFlashing.unitPrice,
            totalCost: totalQuantity * newFlashing.unitPrice,
            category: 'izolacyjne', // dummy category
            source: 'manual',
            side: newFlashing.edge // Save the selected edge/side
        };

        setFormData(prev => ({
            ...prev,
            materialBreakdown: [...(prev.materialBreakdown || []), newItem]
        }));

        setNewFlashing({
            materialId: '',
            name: '',
            unit: 'mb',
            quantity: 0,
            unitPrice: 0,
            edge: 'vertical',
            isCustom: false
        });
    };

    const handleRemoveMaterial = (index: number) => {
        setFormData(prev => ({
            ...prev,
            materialBreakdown: prev.materialBreakdown?.filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log("Submitting Construction Form", formData);
        setIsSaving(true);
        try {
            // Calculated cost from breakdown takes precedence
            const breakdownTotal = formData.materialBreakdown?.reduce((sum, l) => sum + l.totalCost, 0) || 0;
            const materialsCost = breakdownTotal > 0 ? breakdownTotal : ((formData.totalPerimeter || 0) * 15); // Fallback

            const laborCost = formData.installationCosts?.total || (formData.totalPerimeter || 0) * 25; // Dummy 25 PLN/m

            // Map internal type value to label OR use custom name
            let typeLabel = '';
            if (formData.type === 'custom') {
                typeLabel = customTypeName.trim() || 'Niestandardowy';
            } else {
                typeLabel = CONSTRUCTION_TYPES.find(t => t.value === formData.type)?.label || formData.type || '';
            }
            console.log("Mapped type:", formData.type, "to", typeLabel);

            const construction: Construction = {
                id: initialData?.id || crypto.randomUUID(),
                offerId,
                createdAt: initialData?.createdAt || new Date().toISOString(),
                // NOTE: For existing constructions, keep original updatedAt as sentinel for optimistic locking.
                // Backend stamps it on PATCH. For new constructions, set it explicitly.
                updatedAt: initialData?.updatedAt || new Date().toISOString(),
                materialBreakdown: formData.materialBreakdown || [],
                installationStandardId: formData.installationStandardId,

                // Form fields with fallbacks
                number: formData.number || nextNumber,
                name: formData.name || '',
                type: typeLabel || '', // Save readable label
                widthMm: formData.widthMm || 0,
                heightMm: formData.heightMm || 0,
                width: (formData.widthMm || 0) / 1000,
                height: (formData.heightMm || 0) / 1000,
                quantity: formData.quantity || 1,
                installationLocation: formData.installationLocation as InstallationLocation || 'wew',
                totalArea: formData.totalArea || 0,
                area: (formData.totalArea || 0) / (formData.quantity || 1),
                totalPerimeter: formData.totalPerimeter || 0,
                perimeter: (formData.totalPerimeter || 0) / (formData.quantity || 1),
                weight: 0, // Placeholder

                materialCosts: {
                    total: materialsCost,
                    items: [] // Placeholder
                },
                installationCosts: {
                    total: laborCost,
                    rate: 0 // Placeholder
                },
                totalCost: materialsCost + laborCost
            };

            await onSave(construction);
            onClose();
        } catch (error) {
            console.error("ConstructionModal Submit Error:", error);
            alert('Błąd zapisu pozycji: ' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={initialData ? "Edytuj konstrukcję" : "Dodaj konstrukcję"}>
            <form onSubmit={handleSubmit} className="space-y-6 max-h-[80vh] overflow-y-auto px-1">
                <div className="space-y-4">
                    <Input
                        id="name"
                        name="name"
                        label="Nazwa pozycji"
                        value={formData.name || ''}
                        onChange={handleChange}
                        required
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <Select
                                id="type"
                                name="type"
                                label="Typ konstrukcji"
                                options={CONSTRUCTION_TYPES}
                                value={formData.type}
                                onChange={handleChange}
                            />
                            {formData.type === 'custom' && (
                                <Input
                                    id="customTypeName"
                                    name="customTypeName"
                                    label="Nazwa typu (własna)"
                                    placeholder="np. Brama segmentowa"
                                    value={customTypeName}
                                    onChange={(e) => setCustomTypeName(e.target.value)}
                                    required
                                />
                            )}
                        </div>
                        <Input
                            id="quantity"
                            name="quantity"
                            type="number"
                            label="Ilość [szt]"
                            value={formData.quantity}
                            onChange={handleChange}
                            min="1"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            id="widthMm"
                            name="widthMm"
                            type="number"
                            label="Szerokość [mm]"
                            value={formData.widthMm}
                            onChange={handleChange}
                            required
                        />
                        <Input
                            id="heightMm"
                            name="heightMm"
                            type="number"
                            label="Wysokość [mm]"
                            value={formData.heightMm}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="flex space-x-4 bg-gray-50 p-3 rounded text-sm text-gray-600">
                        <div>Powierzchnia: <strong>{formData.totalArea?.toFixed(2)} m²</strong></div>
                        <div>Obwód: <strong>{formData.totalPerimeter?.toFixed(2)} mb</strong></div>
                    </div>
                </div>

                {/* Standards Selection */}
                <div className="border-t pt-4">
                    <h3 className="text-lg font-medium text-gray-800 mb-3 flex items-center">
                        <Settings className="w-5 h-5 mr-2" />
                        Materiały i Standardy
                    </h3>

                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4">
                        <div className="flex space-x-2">
                            <div className="flex-grow">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-sm font-medium text-gray-700">Wybierz standard montażu</label>
                                    <label className="text-xs text-blue-600 flex items-center cursor-pointer hover:underline">
                                        <input
                                            type="checkbox"
                                            className="mr-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            checked={showAllStandards}
                                            onChange={e => setShowAllStandards(e.target.checked)}
                                        />
                                        Pokaż wszystkie
                                    </label>
                                </div>
                                <select
                                    id="installationStandardId"
                                    name="installationStandardId"
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm h-10 px-3"
                                    value={formData.installationStandardId || ''}
                                    onChange={handleChange}
                                >
                                    <option value="">Brak – ręczne wprowadzanie</option>
                                    {availableStandards.map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.name} {s.isDefault ? '(Domyślny)' : ''}
                                        </option>
                                    ))}
                                </select>
                                {applicableStandards.length === 0 && !showAllStandards && (
                                    <p className="text-xs text-amber-600 mt-1">
                                        Brak dedykowanych standardów dla tego typu. Zaznacz "Pokaż wszystkie" aby wybrać inny.
                                    </p>
                                )}
                            </div>
                            {formData.installationStandardId && (
                                <div className="flex items-end pb-1">
                                    <Button type="button" onClick={handleRecalculateFromStandard} variant="secondary" size="sm">
                                        Przelicz
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Flashings / Manual Items */}
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Dodaj obróbki (Sheet Metal)</h4>
                        <div className="grid grid-cols-6 gap-2 items-end">
                            <div className="col-span-2">
                                <label className="block text-xs text-gray-500 mb-1">Obróbka</label>
                                <select
                                    className="block w-full rounded-md border-gray-300 shadow-sm text-sm p-2 h-[38px]"
                                    value={newFlashing.materialId ? (newFlashing.isCustom ? '' : newFlashing.materialId) : ''}
                                    onChange={e => {
                                        const value = e.target.value;
                                        if (!value) {
                                            setNewFlashing(prev => ({ ...prev, materialId: '', isCustom: true, name: '' }));
                                            return;
                                        }

                                        const id = value.startsWith('S|') ? value.split('|')[1] : value;

                                        const item = sheetMetalsById[id];
                                        if (item) {
                                            const width = (formData.widthMm || 0) / 1000;
                                            const height = (formData.heightMm || 0) / 1000;
                                            let qty = 0;
                                            switch (newFlashing.edge) {
                                                case 'vertical': qty = height * 2; break;
                                                case 'top': qty = width; break;
                                                case 'bottom': qty = width; break;
                                                case 'perimeter': qty = (width + height) * 2; break;
                                            }

                                            setNewFlashing(prev => ({
                                                ...prev,
                                                materialId: value,
                                                name: item.name,
                                                unit: item.unit,
                                                unitPrice: item.unitPrice,
                                                quantity: parseFloat(qty.toFixed(2)),
                                                isCustom: false
                                            }));
                                        }
                                    }}
                                >
                                    <option value="">-- Własny / Ręczny --</option>
                                    <optgroup label="Obróbki (Sheet Metal)">
                                        {Object.values(sheetMetalsById).sort((a, b) => a.name.localeCompare(b.name)).map(m => (
                                            <option key={`S|${m.id}`} value={`S|${m.id}`}>{m.name}</option>
                                        ))}
                                    </optgroup>
                                </select>
                                {(newFlashing.isCustom) && (
                                    <input
                                        className="block w-full rounded-md border-gray-300 shadow-sm text-sm p-2 mt-1"
                                        type="text"
                                        placeholder="Nazwa własna..."
                                        value={newFlashing.name}
                                        onChange={e => setNewFlashing({ ...newFlashing, name: e.target.value })}
                                    />
                                )}
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs text-gray-500 mb-1">Krawędź</label>
                                <select
                                    className="block w-full rounded-md border-gray-300 shadow-sm text-sm p-2 h-[38px]"
                                    value={newFlashing.edge}
                                    onChange={e => {
                                        const newEdge = e.target.value as SideType;

                                        // Auto-recalc quantity when edge changes
                                        const width = (formData.widthMm || 0) / 1000;
                                        const height = (formData.heightMm || 0) / 1000;
                                        let qty = 0;
                                        switch (newEdge) {
                                            case 'vertical': qty = height * 2; break;
                                            case 'top': qty = width; break;
                                            case 'bottom': qty = width; break;
                                            case 'perimeter': qty = (width + height) * 2; break;
                                        }

                                        setNewFlashing(prev => ({
                                            ...prev,
                                            edge: newEdge,
                                            quantity: parseFloat(qty.toFixed(2))
                                        }));
                                    }}
                                >
                                    <option value="vertical">Pion (L/P)</option>
                                    <option value="top">Góra</option>
                                    <option value="bottom">Dół</option>
                                    <option value="perimeter">Obwód</option>
                                </select>
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs text-gray-500 mb-1">
                                    Ilość (1 szt) [{newFlashing.unit}]
                                </label>
                                <input
                                    className="block w-full rounded-md border-gray-300 shadow-sm text-sm p-2"
                                    type="number"
                                    value={newFlashing.quantity}
                                    onChange={e => setNewFlashing({ ...newFlashing, quantity: parseFloat(e.target.value) })}
                                />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-xs text-gray-500 mb-1">Cena jedn.</label>
                                <input
                                    className="block w-full rounded-md border-gray-300 shadow-sm text-sm p-2"
                                    type="number"
                                    value={newFlashing.unitPrice}
                                    onChange={e => setNewFlashing({ ...newFlashing, unitPrice: parseFloat(e.target.value) })}
                                />
                            </div>
                            <div className="col-span-1">
                                <Button type="button" onClick={handleAddFlashing} size="sm" variant="secondary" className="w-full">
                                    <Plus className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Summary Table */}
                    {formData.materialBreakdown && formData.materialBreakdown.length > 0 ? (
                        <div className="border rounded-md overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Materiał</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ilość</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Cena</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Wartość</th>
                                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase"></th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {formData.materialBreakdown.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="px-3 py-2 text-sm text-gray-900">
                                                {item.materialName}
                                                {item.source === 'standard_montazu' && <span className="text-xs text-blue-500 ml-2">(Standard)</span>}
                                            </td>
                                            <td className="px-3 py-2 text-sm text-gray-500 text-right">{item.quantity} {item.unit}</td>
                                            <td className="px-3 py-2 text-sm text-gray-500 text-right">{item.unitPrice?.toFixed(2)}</td>
                                            <td className="px-3 py-2 text-sm text-gray-900 text-right font-medium">{item.totalCost?.toFixed(2)}</td>
                                            <td className="px-3 py-2 text-center">
                                                <button type="button" onClick={() => handleRemoveMaterial(idx)} className="text-red-500 hover:text-red-700">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="bg-gray-50 font-bold">
                                        <td colSpan={3} className="px-3 py-2 text-right text-sm">Suma:</td>
                                        <td className="px-3 py-2 text-right text-sm text-[#21808D]">
                                            {formData.materialBreakdown.reduce((acc, i) => acc + i.totalCost, 0).toFixed(2)} PLN
                                        </td>
                                        <td></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-4 text-gray-500 text-sm border-2 border-dashed rounded-lg bg-gray-50">
                            Brak materiałów. Wybierz standard lub dodaj ręcznie.
                        </div>
                    )}
                </div>

                <div className="flex justify-end space-x-3 pt-6 border-t mt-4">
                    <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>Anuluj</Button>
                    <Button type="submit" isLoading={isSaving}>Zapisz pozycję</Button>
                </div>
            </form>
        </Modal >
    );
};
