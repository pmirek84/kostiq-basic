import { useState } from 'react';
import { Trash2, Package, Plus } from 'lucide-react';
import type { RentalItem } from '../../models/types';
import { useRentalRates } from '../../hooks/useRentalRates';
import { v4 as uuidv4 } from 'uuid';

interface RentalEquipmentSectionProps {
    items: RentalItem[];
    onChange: (items: RentalItem[]) => void;
}

export const RentalEquipmentSection = ({ items, onChange }: RentalEquipmentSectionProps) => {
    const { rates: rentalRates } = useRentalRates();
    const [newItem, setNewItem] = useState<Partial<RentalItem>>({
        name: '',
        unit: 'doba',
        quantity: 1,
        duration: 1,
        unitPrice: 0
    });

    const handleAddItem = () => {
        if (!newItem.name || !newItem.unitPrice) return;

        const quantity = newItem.quantity || 1;
        const duration = newItem.duration || 1;
        const unitPrice = newItem.unitPrice || 0;

        const item: RentalItem = {
            id: uuidv4(),
            name: newItem.name,
            unit: newItem.unit as any,
            quantity,
            duration,
            unitPrice,
            totalPrice: quantity * duration * unitPrice
        };

        onChange([...items, item]);

        // Reset form
        setNewItem({
            name: '',
            unit: 'doba',
            quantity: 1,
            duration: 1,
            unitPrice: 0
        });
    };

    const handleRemoveItem = (id: string) => {
        onChange(items.filter(i => i.id !== id));
    };

    const totalSectionCost = items.reduce((sum, item) => sum + item.totalPrice, 0);

    return (
        <div className="space-y-6">
            {/* Add Item Form */}
            <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                <div className="flex items-center space-x-2 mb-4 text-[#21808D]">
                    <Plus className="h-4 w-4" />
                    <span className="text-xs font-black uppercase tracking-widest px-2">DODAJ SPRZĘT DO LISTY</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-4">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 ml-1">Wybierz sprzęt z bazy</label>
                        <select
                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#21808D] outline-none shadow-sm"
                            value={rentalRates.find(r => r.name === newItem.name)?.name || ""}
                            onChange={(e) => {
                                const match = rentalRates.find(r => r.name === e.target.value);
                                if (match) {
                                    setNewItem({
                                        ...newItem,
                                        name: match.name,
                                        unit: match.unit as any,
                                        unitPrice: match.unitPrice
                                    });
                                }
                            }}
                        >
                            <option value="">Wybierz sprzęt...</option>
                            {rentalRates.map(rate => (
                                <option key={rate.id} value={rate.name}>{rate.name} ({rate.unitPrice} PLN/{rate.unit})</option>
                            ))}
                        </select>
                    </div>

                    <div className="md:col-span-3">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 ml-1">Lub wpisz nazwę własną</label>
                        <input
                            type="text"
                            placeholder="Nazwa sprzętu..."
                            value={newItem.name}
                            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#21808D] outline-none shadow-sm"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 ml-1">Jednostka</label>
                        <select
                            value={newItem.unit}
                            onChange={(e) => setNewItem({ ...newItem, unit: e.target.value as any })}
                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:ring-2 focus:ring-[#21808D] outline-none shadow-sm"
                        >
                            <option value="doba">Doba</option>
                            <option value="godz">Godzina</option>
                            <option value="ryczałt">Ryczałt</option>
                        </select>
                    </div>

                    <div className="md:col-span-1">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 ml-1">Ilość</label>
                        <input
                            type="number"
                            min="1"
                            value={newItem.quantity}
                            onChange={(e) => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) || 1 })}
                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-[#21808D] outline-none shadow-sm text-center"
                        />
                    </div>

                    <div className="md:col-span-1">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1.5 ml-1">Czas</label>
                        <input
                            type="number"
                            min="1"
                            value={newItem.duration}
                            onChange={(e) => setNewItem({ ...newItem, duration: parseFloat(e.target.value) || 1 })}
                            className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-[#21808D] outline-none shadow-sm text-center"
                        />
                    </div>

                    <div className="md:col-span-1">
                        <button
                            onClick={handleAddItem}
                            disabled={!newItem.name || !newItem.unitPrice}
                            className="w-full aspect-square md:aspect-auto bg-[#21808D] text-white py-2.5 rounded-xl font-bold flex items-center justify-center hover:bg-[#1a6671] transition-all disabled:opacity-50 shadow-lg shadow-[#21808D]/20 active:scale-95"
                        >
                            <Plus className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-[#21808D]/5 border border-[#21808D]/10 p-3 rounded-xl flex items-center justify-between">
                        <span className="text-[10px] font-bold text-[#21808D] uppercase tracking-widest pl-2">Stawka jednostkowa [PLN]</span>
                        <input
                            type="number"
                            step="0.01"
                            value={newItem.unitPrice}
                            onChange={(e) => setNewItem({ ...newItem, unitPrice: parseFloat(e.target.value) || 0 })}
                            className="w-32 bg-white border-2 border-[#21808D]/20 rounded-lg px-3 py-1 text-sm font-black text-[#21808D] focus:ring-2 focus:ring-[#21808D] outline-none text-right"
                        />
                    </div>
                </div>
            </div>

            {/* Items List */}
            {items.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100 text-left">
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Nazwa sprzętu</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Specyfikacja</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Koszt jednostkowy</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">WARTOŚĆ NETTO</th>
                                <th className="px-6 py-4 w-16"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {items.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-bold text-gray-900">{item.name}</div>
                                        <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">{item.unit !== 'ryczałt' ? 'Wynajem terminowy' : 'Koszt stały'}</div>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="inline-flex items-center bg-gray-100 rounded-full px-3 py-1 text-xs font-bold text-gray-600 border border-gray-200">
                                            {item.quantity} {item.unit} {item.duration > 1 && `x ${item.duration} dni`}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm font-medium text-gray-500">
                                        {item.unitPrice.toFixed(2)} PLN / {item.unit}
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm font-black text-[#21808D]">
                                        {item.totalPrice.toFixed(2)} PLN
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => handleRemoveItem(item.id)}
                                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-[#21808D]/5">
                                <td colSpan={3} className="px-6 py-4 text-sm font-black text-gray-600 text-right uppercase tracking-[0.2em] pt-6">
                                    Łączny koszt wynajmu:
                                </td>
                                <td className="px-6 py-6 text-right text-2xl font-black text-[#21808D]">
                                    {totalSectionCost.toFixed(2)} <span className="text-sm ml-1 font-bold">PLN</span>
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            ) : (
                <div className="h-32 flex flex-col items-center justify-center bg-gray-50/30 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400">
                    <Package className="h-8 w-8 mb-2 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest">Brak pozycji na liście wynajmu</p>
                </div>
            )}
        </div>
    );
};
