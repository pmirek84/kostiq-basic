import { useState, useMemo } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ActionButtons } from '../ui/ActionButtons';
import { useMaterials } from '../../hooks/useMaterials';
import type { Material, MaterialCategory } from '../../models/types';

export default function MaterialsTab() {
    const { materials, loading, deleteMaterial, addMaterial, updateMaterial } = useMaterials();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<MaterialCategory | 'all'>('all');

    const filteredMaterials = useMemo(() => {
        return materials.filter(m => {
            const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = categoryFilter === 'all' || m.category === categoryFilter;
            return matchesSearch && matchesCategory;
        });
    }, [materials, searchQuery, categoryFilter]);

    const handleEdit = (material: Material) => {
        setEditingMaterial(material);
        setIsModalOpen(true);
    };

    const handleClose = () => {
        setIsModalOpen(false);
        setEditingMaterial(null);
    };

    if (loading) return (
        <div className="flex justify-center items-center py-20 text-slate-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
            Ładowanie materiałów...
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="flex flex-1 gap-2">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Szukaj materiału..."
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <select
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value as any)}
                    >
                        <option value="all">Wszystkie kategorie</option>
                        <option value="elementy_zlacze">Elementy złączne</option>
                        <option value="izolacyjne">Izolacyjne</option>
                        <option value="uszczelniajace">Uszczelniające</option>
                        <option value="dodatkowe">Dodatkowe</option>
                    </select>
                </div>
                <Button onClick={() => setIsModalOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Dodaj Materiał
                </Button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                        <tr>
                            <th className="px-6 py-4 text-left">Nazwa</th>
                            <th className="px-6 py-4 text-left">Kategoria</th>
                            <th className="px-6 py-4 text-left">Jednostka</th>
                            <th className="px-6 py-4 text-right">Narzut %</th>
                            <th className="px-6 py-4 text-right">Cena jedn.</th>
                            <th className="px-6 py-4 text-right pr-6">Akcje</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredMaterials.map((m) => (
                            <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-900">{m.name}</td>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-xs">
                                        {m.category}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-slate-500">{m.unit}</td>
                                <td className="px-6 py-4 text-right font-mono text-slate-500">{m.wastePercent !== undefined ? `${m.wastePercent}%` : '5%'}</td>
                                <td className="px-6 py-4 text-right font-mono text-slate-700">
                                    {m.defaultUnitPrice.toFixed(2)} PLN
                                </td>
                                <td className="px-6 py-4 text-right pr-6">
                                    <ActionButtons
                                        onEdit={() => handleEdit(m)}
                                        onDelete={() => {
                                            if (window.confirm('Czy na pewno chcesz usunąć Ten materiał z katalogu?')) {
                                                deleteMaterial(m.id);
                                            }
                                        }}
                                    />
                                </td>
                            </tr>
                        ))}
                        {filteredMaterials.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                    Nie znaleziono materiałów spełniających kryteria.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <AddMaterialModal
                    onClose={handleClose}
                    onSave={(m) => {
                        if (editingMaterial) {
                            updateMaterial(editingMaterial.id, m);
                        } else {
                            addMaterial(m);
                        }
                        handleClose();
                    }}
                    initialData={editingMaterial}
                />
            )}
        </div>
    );
}

interface ModalProps {
    onClose: () => void;
    onSave: (m: Omit<Material, 'id' | 'createdAt' | 'updatedAt'>) => void;
    initialData?: Material | null;
}

function AddMaterialModal({ onClose, onSave, initialData }: ModalProps) {
    const [formData, setFormData] = useState({
        name: initialData?.name || '',
        category: initialData?.category || 'elementy_zlacze' as MaterialCategory,
        unit: (initialData?.unit || 'szt') as any,
        defaultUnitPrice: initialData?.defaultUnitPrice || 0,
        wastePercent: initialData?.wastePercent !== undefined ? initialData.wastePercent : 5,
        isActive: true
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-100 animate-in zoom-in-95 duration-200">
                <h2 className="text-xl font-bold text-slate-900 mb-6">
                    {initialData ? 'Edytuj Materiał' : 'Nowy Materiał'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Nazwa materiału"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        required
                        placeholder="np. Pianka montażowa"
                    />
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Kategoria</label>
                        <select
                            className="block w-full rounded-xl border-slate-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border transition-all"
                            value={formData.category}
                            onChange={e => setFormData({ ...formData, category: e.target.value as MaterialCategory })}
                        >
                            <option value="elementy_zlacze">Elementy złączne</option>
                            <option value="izolacyjne">Izolacyjne</option>
                            <option value="uszczelniajace">Uszczelniające</option>
                            <option value="dodatkowe">Dodatkowe</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Jednostka</label>
                            <select
                                className="block w-full rounded-xl border-slate-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border transition-all"
                                value={formData.unit}
                                onChange={e => setFormData({ ...formData, unit: e.target.value as any })}
                            >
                                <option value="szt">szt</option>
                                <option value="m">m</option>
                                <option value="m2">m²</option>
                                <option value="l">l</option>
                                <option value="kg">kg</option>
                                <option value="opak">opak</option>
                            </select>
                        </div>
                        <Input
                            label="Cena jednostkowa (PLN)"
                            type="number"
                            step="0.01"
                            value={formData.defaultUnitPrice}
                            onChange={e => setFormData({ ...formData, defaultUnitPrice: Number(e.target.value) })}
                            required
                        />
                    </div>
                    <div>
                        <Input
                            label="Domyślny narzut na odpady (%)"
                            type="number"
                            min="0"
                            max="100"
                            value={formData.wastePercent}
                            onChange={e => setFormData({ ...formData, wastePercent: Number(e.target.value) })}
                            required
                        />
                    </div>
                    <div className="flex justify-end space-x-3 mt-8">
                        <Button type="button" variant="secondary" onClick={onClose} className="px-6">Anuluj</Button>
                        <Button type="submit" className="px-8">{initialData ? 'Zapisz' : 'Dodaj'}</Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
