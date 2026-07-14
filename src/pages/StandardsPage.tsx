import { useState } from 'react';
import { Plus, Trash2, Edit, Wrench, ChevronRight, Layers } from 'lucide-react';
import { useStandards } from '../hooks/useStandards';
import { useMaterials } from '../hooks/useMaterials';
import { Button } from '../components/ui/Button';
import { StandardModal } from '../components/standards/StandardModal';
import type { InstallationStandard } from '../models/types';

export default function StandardsPage() {
    const { standards, loading, addStandard, updateStandard, deleteStandard } = useStandards();
    const { materials } = useMaterials();

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingStandard, setEditingStandard] = useState<InstallationStandard | null>(null);

    if (loading) return (
        <div className="flex justify-center items-center py-20 text-slate-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3"></div>
            Ładowanie standardów...
        </div>
    );

    const getMaterialName = (id: string) => materials.find(m => m.id === id)?.name || id;

    const handleCreate = () => {
        setEditingStandard(null);
        setIsModalOpen(true);
    };

    const handleEdit = (standard: InstallationStandard) => {
        setEditingStandard(standard);
        setIsModalOpen(true);
    };

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Standardy Montażu</h1>
                    <p className="text-slate-500 mt-1">Definiuj domyślne reguły materiałowe dla różnych typów konstrukcji</p>
                </div>
                <Button onClick={handleCreate} size="lg">
                    <Plus className="h-5 w-5 mr-2" /> Nowy Standard
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {standards.map(std => (
                    <div key={std.id} className="relative group bg-white border border-zinc-200/60 rounded-3xl p-8 hover:border-zinc-400 transition-all duration-300 flex flex-col h-full">
                        {std.isDefault && (
                            <div className="absolute -top-3 left-8 bg-zinc-950 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-lg border border-zinc-800">
                                Domyślny
                            </div>
                        )}

                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-zinc-50 border border-zinc-200/50 flex items-center justify-center text-zinc-650">
                                    <Wrench className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-900">{std.name}</h3>
                                    <p className="text-sm text-slate-500 mt-1 line-clamp-1">{std.description || 'Brak opisu'}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleEdit(std)}
                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                    title="Edytuj"
                                >
                                    <Edit className="h-5 w-5" />
                                </button>
                                <button
                                    onClick={() => deleteStandard(std.id)}
                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                    title="Usuń"
                                >
                                    <Trash2 className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-6 flex-1">
                            {/* Application */}
                            <div>
                                <h4 className="flex items-center text-[11px] font-black uppercase text-slate-400 tracking-widest mb-3">
                                    <Layers className="h-3 w-3 mr-2" />
                                    Zastosowanie
                                </h4>
                                <div className="flex flex-wrap gap-1.5">
                                    {std.applicableTypes.map(type => (
                                        <span key={type} className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/50 capitalize">
                                            {type.replace('_', ' ')}
                                        </span>
                                    ))}
                                    {std.applicableTypes.length === 0 && <span className="text-xs text-slate-400">Brak przypisanych typów</span>}
                                </div>
                            </div>

                            {/* Rules Table */}
                            <div className="bg-slate-50/50 rounded-2xl border border-slate-100 overflow-hidden">
                                <table className="min-w-full text-xs">
                                    <thead className="bg-slate-100/50">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase tracking-tighter w-24">Krawędź</th>
                                            <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase tracking-tighter">Materiał</th>
                                            <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase tracking-tighter">Baza</th>
                                            <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase tracking-tighter">Zużycie</th>
                                            <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase tracking-tighter">Narzut</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {std.rules.map((rule, idx) => (
                                            <tr key={idx} className="hover:bg-white transition-colors">
                                                <td className="px-4 py-3">
                                                    <span className="font-semibold text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-100 capitalize">
                                                        {translateSide(rule.edge)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-slate-600 font-medium">{getMaterialName(rule.materialId)}</td>
                                                <td className="px-4 py-3 text-right text-slate-500 font-medium">
                                                    {rule.basis === 'szt' ? 'Na sztukę' : 'Na metr (mb)'}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className="text-slate-900 font-mono font-bold">{rule.usagePerMeter}</span>
                                                    <span className="text-slate-400 ml-1">
                                                        {rule.basis === 'szt' 
                                                            ? (materials.find(m => m.id === rule.materialId)?.unit || 'szt') 
                                                            : `${materials.find(m => m.id === rule.materialId)?.unit || 'szt'}/m`}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-500 font-mono font-medium">
                                                    {rule.wastePercent !== undefined ? `${rule.wastePercent}%` : 'Domyślny'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                            <button
                                onClick={() => handleEdit(std)}
                                className="group flex items-center text-xs font-bold text-primary hover:text-primary-dark transition-colors"
                            >
                                Zarządzaj regułami <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    </div>
                ))}

                {standards.length === 0 && (
                    <div className="col-span-full py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center text-center">
                        <Wrench className="h-12 w-12 text-slate-300 mb-4" />
                        <h3 className="text-lg font-bold text-slate-900">Brak standardów</h3>
                        <p className="text-slate-500 max-w-xs mt-1">Stwórz swój pierwszy standard montażu, aby przyspieszyć proces ofertowania.</p>
                        <Button onClick={handleCreate} className="mt-6" variant="secondary">
                            <Plus className="h-4 w-4 mr-2" /> Dodaj pierwszy standard
                        </Button>
                    </div>
                )}
            </div>

            <StandardModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={addStandard}
                onUpdate={updateStandard}
                initialData={editingStandard}
            />
        </div>
    );
}

function translateSide(side: string): string {
    switch (side) {
        case 'vertical': return 'Pion';
        case 'top': return 'Góra';
        case 'bottom': return 'Dół';
        case 'perimeter': return 'Obwód';
        default: return side;
    }
}
