import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { X, Plus, Trash2, Save, Info } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { InstallationStandard, InstallationStandardSideRule, ConstructionType, SideType } from '../../models/types';
import { useMaterials } from '../../hooks/useMaterials';

interface StandardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (standard: Omit<InstallationStandard, 'id' | 'createdAt' | 'updatedAt'>) => void;
    onUpdate: (id: string, standard: Partial<InstallationStandard>) => void;
    initialData: InstallationStandard | null;
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
    { label: 'Żaluzja Fas.', value: 'zaluzja_fasadowa' },
    { label: 'ZIP Screen', value: 'zip_screen' },
];

const SIDES: { label: string; value: SideType }[] = [
    { label: 'Pion', value: 'vertical' },
    { label: 'Góra', value: 'top' },
    { label: 'Dół', value: 'bottom' },
    { label: 'Obwód', value: 'perimeter' },
];

export function StandardModal(props: StandardModalProps) {
    if (!props.isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={props.onClose}
            />

            <StandardModalContent
                key={props.initialData?.id || 'new'}
                {...props}
            />
        </div>
    );
}

function StandardModalContent({ onClose, onSave, onUpdate, initialData }: StandardModalProps) {
    const { materials } = useMaterials();

    // Initialize state directly from props - NO useEffect needed for sync!
    const [formData, setFormData] = useState({
        name: initialData?.name || '',
        description: initialData?.description || '',
        isDefault: initialData?.isDefault || false,
        applicableTypes: initialData?.applicableTypes || [] as ConstructionType[],
        rules: (initialData?.rules || []).map(r => {
            const legacy = r as unknown as { side?: SideType };
            return {
                ...r,
                id: r.id || uuidv4(),
                edge: r.edge || legacy.side || 'vertical',
                basis: r.basis || 'mb',
                wastePercent: r.wastePercent !== undefined ? r.wastePercent : undefined
            };
        }) as InstallationStandardSideRule[]
    });

    const [error, setError] = useState<string | null>(null);

    const handleSave = () => {
        if (!formData.name.trim()) {
            setError('Nazwa standardu jest wymagana');
            return;
        }
        if (formData.applicableTypes.length === 0) {
            setError('Wybierz przynajmniej jeden typ konstrukcji');
            return;
        }

        const standardData = {
            name: formData.name,
            description: formData.description,
            isDefault: formData.isDefault,
            applicableTypes: formData.applicableTypes,
            rules: formData.rules.map(r => ({
                ...r,
                id: r.id || uuidv4()
            }))
        };

        if (initialData) {
            onUpdate(initialData.id, standardData);
        } else {
            onSave(standardData);
        }
        onClose();
    };

    const handleAddRule = () => {
        setFormData(prev => ({
            ...prev,
            rules: [...prev.rules, {
                id: uuidv4(),
                edge: 'vertical',
                materialId: materials[0]?.id || '',
                usagePerMeter: 1,
                usageUnit: 'szt/m',
                basis: 'mb'
            }]
        }));
    };

    const handleRemoveRule = (id: string) => {
        setFormData(prev => ({
            ...prev,
            rules: prev.rules.filter(r => r.id !== id)
        }));
    };

    function handleUpdateRule<K extends keyof InstallationStandardSideRule>(id: string, field: K, value: InstallationStandardSideRule[K]) {
        setFormData(prev => ({
            ...prev,
            rules: prev.rules.map(r => r.id === id ? { ...r, [field]: value } : r)
        }));
    }

    const toggleType = (type: ConstructionType) => {
        setFormData(prev => ({
            ...prev,
            applicableTypes: prev.applicableTypes.includes(type)
                ? prev.applicableTypes.filter(t => t !== type)
                : [...prev.applicableTypes, type]
        }));
    };

    return (
        <div className="relative bg-white rounded-[32px] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border border-white/20 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex justify-between items-center p-8 border-b border-slate-100">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                        {initialData ? 'Edytuj Standard' : 'Nowy Standard Montażu'}
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">Skonfiguruj reguły automatycznego dobierania materiałów</p>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                    <X className="h-6 w-6" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                    {/* Basic Info */}
                    <div className="lg:col-span-5 space-y-8">
                        <div className="space-y-6">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                <Info className="h-4 w-4" /> Informacje podstawowe
                            </h3>

                            <Input
                                label="Nazwa standardu"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="np. Ciepły montaż"
                                required
                            />

                            <div className="space-y-1.5">
                                <label className="block text-sm font-semibold text-slate-700">Opis</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Krótki opis standardu..."
                                    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm min-h-[100px] resize-none"
                                />
                            </div>

                            <label className="flex items-center gap-3 p-4 rounded-2xl bg-blue-50/50 border border-blue-100 cursor-pointer group">
                                <div className="relative flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={formData.isDefault}
                                        onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                                        className="peer h-5 w-5 rounded-lg border-2 border-blue-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer"
                                    />
                                </div>
                                <div>
                                    <span className="text-sm font-bold text-blue-900">Ustaw jako domyślny</span>
                                    <p className="text-[11px] text-blue-700/60">Ten standard będzie sugerowany przy nowych ofertach</p>
                                </div>
                            </label>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Zastosowanie</h3>
                            <div className="grid grid-cols-2 gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-200 max-h-[240px] overflow-y-auto custom-scrollbar">
                                {CONSTRUCTION_TYPES.map(type => (
                                    <button
                                        key={type.value}
                                        onClick={() => toggleType(type.value)}
                                        className={`flex items-center gap-2 p-2 rounded-xl text-xs font-semibold transition-all text-left ${formData.applicableTypes.includes(type.value)
                                            ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                                            : 'text-slate-400 hover:text-slate-600'
                                            }`}
                                    >
                                        <div className={`w-2 h-2 rounded-full transition-all ${formData.applicableTypes.includes(type.value) ? 'bg-primary scale-125' : 'bg-slate-300'}`} />
                                        {type.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Rules */}
                    <div className="lg:col-span-7 flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-400">Reguły Materiałowe</h3>
                            <Button onClick={handleAddRule} size="sm" variant="secondary" className="rounded-xl">
                                <Plus className="h-4 w-4 mr-1.5" /> Dodaj regułę
                            </Button>
                        </div>

                        <div className="bg-slate-50 rounded-[24px] border border-slate-200 overflow-hidden flex-1 flex flex-col">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-100/50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-5 py-4 text-left text-[10px] font-black uppercase text-slate-500 tracking-wider">Krawędź</th>
                                        <th className="px-5 py-4 text-left text-[10px] font-black uppercase text-slate-500 tracking-wider">Materiał</th>
                                        <th className="px-5 py-4 text-left text-[10px] font-black uppercase text-slate-500 tracking-wider">Baza</th>
                                        <th className="px-5 py-4 text-right text-[10px] font-black uppercase text-slate-500 tracking-wider">Zużycie</th>
                                        <th className="px-5 py-4 text-right text-[10px] font-black uppercase text-slate-500 tracking-wider">Narzut (opc.)</th>
                                        <th className="px-5 py-4 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200/50 overflow-y-auto">
                                    {formData.rules.map((rule) => (
                                        <tr key={rule.id} className="group hover:bg-white transition-colors">
                                            <td className="px-4 py-3">
                                                <select
                                                    value={rule.edge}
                                                    onChange={(e) => handleUpdateRule(rule.id, 'edge', e.target.value as SideType)}
                                                    className="w-full bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-900 rounded-lg cursor-pointer"
                                                >
                                                    {SIDES.map(side => <option key={side.value} value={side.value} className="bg-white">{side.label}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select
                                                    value={rule.materialId}
                                                    onChange={(e) => handleUpdateRule(rule.id, 'materialId', e.target.value)}
                                                    className="w-full bg-transparent border-none focus:ring-0 text-sm text-slate-600 rounded-lg cursor-pointer truncate max-w-[200px]"
                                                >
                                                    {materials.map(m => <option key={m.id} value={m.id} className="bg-white">{m.name}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <select
                                                    value={rule.basis || 'mb'}
                                                    onChange={(e) => handleUpdateRule(rule.id, 'basis', e.target.value as any)}
                                                    className="bg-transparent border-none focus:ring-0 text-xs font-semibold text-slate-600 rounded-lg cursor-pointer"
                                                >
                                                    <option value="mb" className="bg-white">Na metr (mb)</option>
                                                    <option value="szt" className="bg-white">Na sztukę (szt)</option>
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-2">
                                                    <input
                                                        type="number"
                                                        value={rule.usagePerMeter}
                                                        onChange={(e) => handleUpdateRule(rule.id, 'usagePerMeter', parseFloat(e.target.value))}
                                                        step="0.01"
                                                        min="0"
                                                        className="w-16 bg-white border-none ring-1 ring-slate-100 focus:ring-2 focus:ring-primary rounded-lg px-2 py-1.5 text-right font-mono text-xs font-bold"
                                                    />
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase">{materials.find(m => m.id === rule.materialId)?.unit || '-'}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-1">
                                                    <input
                                                        type="number"
                                                        placeholder="Domyślny"
                                                        value={rule.wastePercent !== undefined ? rule.wastePercent : ''}
                                                        onChange={(e) => {
                                                            const val = e.target.value === '' ? undefined : Number(e.target.value);
                                                            handleUpdateRule(rule.id, 'wastePercent', val);
                                                        }}
                                                        min="0"
                                                        max="100"
                                                        className="w-16 bg-white border-none ring-1 ring-slate-100 focus:ring-2 focus:ring-primary rounded-lg px-2 py-1.5 text-right font-mono text-xs font-bold"
                                                    />
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase">%</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => handleRemoveRule(rule.id)}
                                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {formData.rules.length === 0 && (
                                <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400 bg-white">
                                    <Plus className="h-10 w-10 mb-4 opacity-20" />
                                    <p className="text-sm text-center">Dodaj materiały przypisane do konkretnych krawędzi konstrukcji</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div className="flex items-center gap-2 text-red-500 font-medium text-xs">
                    {error && <><Info className="h-4 w-4" /> {error}</>}
                </div>
                <div className="flex space-x-4">
                    <Button variant="secondary" onClick={onClose} className="px-8 border-none bg-transparent hover:bg-slate-200">
                        Anuluj
                    </Button>
                    <Button onClick={handleSave} size="lg" className="px-10 shadow-xl shadow-primary/20">
                        <Save className="h-5 w-5 mr-2" /> Zapisz standard
                    </Button>
                </div>
            </div>
        </div>
    );
}
