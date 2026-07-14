import { useState } from 'react';
import { Edit2, Save, X, Plus, Trash2, Tag, Calendar, Truck } from 'lucide-react';
import type { RentalRate } from '../../hooks/useRentalRates';
import { Button } from '../ui/Button';

interface RentalRatesEditorProps {
    rates: RentalRate[];
    onAdd: (rate: Omit<RentalRate, 'id'>) => void;
    onUpdate: (rate: RentalRate) => void;
    onDelete: (id: string) => void;
}

export default function RentalRatesEditor({ rates, onAdd, onUpdate, onDelete }: RentalRatesEditorProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<RentalRate | null>(null);

    const [newItem, setNewItem] = useState<Omit<RentalRate, 'id'>>({
        name: '',
        unit: 'doba',
        unitPrice: 0,
        category: 'Sprzęt ciężki',
        minRentalPeriod: '1 dzień',
        availability: 'dostępny'
    });

    const handleStartEdit = (rate: RentalRate) => {
        setEditingId(rate.id);
        setEditForm({ ...rate });
    };

    const handleSaveEdit = () => {
        if (editForm) {
            onUpdate(editForm);
            setEditingId(null);
            setEditForm(null);
        }
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditForm(null);
    };

    const handleAddItem = () => {
        if (!newItem.name) return;
        onAdd(newItem);
        setNewItem({ name: '', unit: 'doba', unitPrice: 0, category: 'Sprzęt ciężki', minRentalPeriod: '1 dzień', availability: 'dostępny' });
    };

    return (
        <div className="space-y-6">
            {/* Rates Table-like List */}
            <div className="space-y-3">
                {rates.map((rate) => (
                    <div
                        key={rate.id}
                        className={`group relative flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 ${editingId === rate.id
                            ? 'bg-white border-primary shadow-lg ring-4 ring-primary/5 z-10'
                            : 'bg-slate-50/50 border-slate-100 hover:bg-white hover:border-slate-200 hover:shadow-md'
                            }`}
                    >
                        {editingId === rate.id && editForm ? (
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_120px_100px] gap-4">
                                <input
                                    type="text"
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary text-sm font-bold"
                                />
                                <select
                                    value={editForm.unit}
                                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary text-sm"
                                >
                                    <option value="doba">Cena za dobę</option>
                                    <option value="godz">Cena za godz.</option>
                                    <option value="ryczałt">Ryczałt</option>
                                </select>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={editForm.unitPrice}
                                        onChange={(e) => setEditForm({ ...editForm, unitPrice: parseFloat(e.target.value) || 0 })}
                                        className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary text-sm font-mono text-right"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">PLN</span>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="h-10 w-10 flex-shrink-0 flex items-center justify-center bg-white rounded-xl border border-slate-100 shadow-sm transition-transform group-hover:scale-110">
                                    <Tag className="h-5 w-5 text-slate-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-slate-900 group-hover:text-primary transition-colors truncate">{rate.name}</h4>
                                    <div className="flex items-center gap-4 mt-1">
                                        <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5 capitalize">
                                            <Calendar className="h-3 w-3" /> Jednostka: {rate.unit}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right px-4">
                                    <p className="text-lg font-black text-slate-900 tracking-tighter">
                                        {rate.unitPrice.toFixed(2)}
                                        <span className="text-[10px] font-bold text-slate-400 ml-1">PLN</span>
                                    </p>
                                </div>
                            </>
                        )}

                        <div className="flex items-center gap-2 pl-4 border-l border-slate-100">
                            {editingId === rate.id ? (
                                <>
                                    <button
                                        onClick={handleSaveEdit}
                                        className="h-9 w-9 flex items-center justify-center bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-xl transition-all"
                                    >
                                        <Save className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={handleCancelEdit}
                                        className="h-9 w-9 flex items-center justify-center bg-slate-50 text-slate-500 hover:bg-slate-200 rounded-xl transition-all"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => handleStartEdit(rate)}
                                        className="h-9 w-9 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                    >
                                        <Edit2 className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => onDelete(rate.id)}
                                        className="h-9 w-9 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ))}

                {rates.length === 0 && (
                    <div className="py-12 flex flex-col items-center justify-center text-center opacity-40">
                        <Truck className="h-10 w-10 mb-3" />
                        <p className="text-sm font-bold">Brak zdefiniowanych stawek wynajmu</p>
                    </div>
                )}
            </div>

            {/* Inline Add New Form */}
            <div className="bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200 p-6 flex flex-col md:flex-row items-center gap-4">
                <input
                    type="text"
                    placeholder="Wpisz nazwę sprzętu..."
                    className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-primary text-sm"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                />
                <select
                    className="w-full md:w-32 px-4 py-2.5 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-primary text-sm"
                    value={newItem.unit}
                    onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                >
                    <option value="doba">doba</option>
                    <option value="godz">godz</option>
                    <option value="ryczałt">rycz.</option>
                </select>
                <div className="relative w-full md:w-32">
                    <input
                        type="number"
                        placeholder="Cena"
                        className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-primary text-sm font-mono text-right"
                        value={newItem.unitPrice || ''}
                        onChange={(e) => setNewItem({ ...newItem, unitPrice: parseFloat(e.target.value) || 0 })}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">PLN</span>
                </div>
                <Button
                    onClick={handleAddItem}
                    disabled={!newItem.name}
                    className="w-full md:w-auto px-6 py-2.5 shadow-lg shadow-primary/10"
                    size="sm"
                >
                    <Plus className="h-4 w-4 mr-2" /> Dodaj
                </Button>
            </div>
        </div>
    );
}
