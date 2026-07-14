import { useState } from 'react';
import { Search, Plus, Wrench, Download } from 'lucide-react';
import { useRentalRates, type RentalRate } from '../../hooks/useRentalRates';
import { ActionButtons } from '../ui/ActionButtons';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export default function RentalTab() {
    const { rates: rentalRates, deleteRate, addRate, updateRate } = useRentalRates();
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<RentalRate | null>(null);

    const filteredRates = rentalRates.filter(rate =>
        rate.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rate.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const groupByCategory = (items: RentalRate[]) => {
        return items.reduce((acc, item) => {
            if (!acc[item.category]) {
                acc[item.category] = [];
            }
            acc[item.category].push(item);
            return acc;
        }, {} as Record<string, RentalRate[]>);
    };

    const groupedRates = groupByCategory(filteredRates);

    const calculateCategoryStats = (items: RentalRate[]) => {
        const total = items.reduce((sum, item) => sum + item.unitPrice, 0);
        return {
            total,
            average: total / items.length,
            count: items.length
        };
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-3">
                        <Wrench className="h-6 w-6 text-blue-900" />
                        <h2 className="text-xl font-semibold text-blue-900">Koszty wynajmu sprzętu</h2>
                    </div>
                    <div className="flex space-x-4">
                        <Button variant="secondary" onClick={() => { }}>
                            <Download className="h-4 w-4 mr-2" />
                            Eksportuj
                        </Button>
                        <Button onClick={() => { setEditingItem(null); setIsModalOpen(true); }}>
                            <Plus className="h-4 w-4 mr-2" />
                            Dodaj sprzęt
                        </Button>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="Szukaj po nazwie lub kategorii..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                    </div>
                </div>
            </div>

            {Object.entries(groupedRates).map(([category, items]) => {
                const stats = calculateCategoryStats(items);
                return (
                    <div key={category} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                        <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-semibold text-blue-900">{category}</h3>
                                <div className="text-sm text-gray-500 space-x-4 flex">
                                    <span>Liczba: {stats.count}</span>
                                    <span>Śr. cena: {stats.average.toFixed(2)} PLN</span>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Nazwa sprzętu</th>
                                        <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Jednostka</th>
                                        <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Cena (PLN)</th>
                                        <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Min. okres</th>
                                        <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Dostępność</th>
                                        <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase tracking-wider">Akcje</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {items.map((rate) => (
                                        <tr key={rate.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 font-medium text-gray-900">{rate.name}</td>
                                            <td className="px-6 py-4 text-gray-500">{rate.unit}</td>
                                            <td className="px-6 py-4 font-medium text-blue-900">{rate.unitPrice.toFixed(2)}</td>
                                            <td className="px-6 py-4 text-gray-500">{rate.minRentalPeriod}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${rate.availability === 'dostępny'
                                                    ? 'bg-green-100 text-green-800'
                                                    : rate.availability === 'na żądanie'
                                                        ? 'bg-yellow-100 text-yellow-800'
                                                        : 'bg-red-100 text-red-800'
                                                    }`}>
                                                    {rate.availability}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <ActionButtons
                                                    onEdit={() => { setEditingItem(rate); setIsModalOpen(true); }}
                                                    onDelete={() => deleteRate(rate.id)}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}

            {isModalOpen && (
                <RentalModal
                    onClose={() => setIsModalOpen(false)}
                    onSave={(data) => {
                        if (editingItem) {
                            updateRate({ ...editingItem, ...data });
                        } else {
                            addRate(data);
                        }
                        setIsModalOpen(false);
                    }}
                    initialData={editingItem}
                />
            )}
        </div>
    );
}

function RentalModal({ onClose, onSave, initialData }: { onClose: () => void, onSave: (data: any) => void, initialData: RentalRate | null }) {
    const [formData, setFormData] = useState(initialData || {
        name: '',
        unit: 'dzień',
        unitPrice: 0,
        category: 'Sprzęt ciężki',
        minRentalPeriod: '1 dzień',
        availability: 'dostępny'
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
                <h2 className="text-xl font-semibold mb-6">{initialData ? 'Edytuj sprzęt' : 'Dodaj nowy sprzęt'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Nazwa sprzętu"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        required
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Kategoria</label>
                            <select
                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                                value={formData.category}
                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                            >
                                {['Sprzęt ciężki', 'Podnośniki', 'Rusztowania', 'Sprzęt transportowy', 'Narzędzia specjalistyczne'].map(o => (
                                    <option key={o} value={o}>{o}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Dostępność</label>
                            <select
                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                                value={formData.availability}
                                onChange={e => setFormData({ ...formData, availability: e.target.value })}
                            >
                                {['dostępny', 'na żądanie', 'niedostępny'].map(o => (
                                    <option key={o} value={o}>{o}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="Cena (PLN)"
                            type="number"
                            value={formData.unitPrice}
                            onChange={e => setFormData({ ...formData, unitPrice: Number(e.target.value) })}
                            required
                        />
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Jednostka</label>
                            <select
                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                                value={formData.unit}
                                onChange={e => setFormData({ ...formData, unit: e.target.value })}
                            >
                                {['godzina', 'dzień', 'tydzień', 'miesiąc'].map(o => (
                                    <option key={o} value={o}>{o}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Min. okres wynajmu</label>
                        <select
                            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                            value={formData.minRentalPeriod}
                            onChange={e => setFormData({ ...formData, minRentalPeriod: e.target.value })}
                        >
                            {['1 godzina', '1 dzień', '1 tydzień', '1 miesiąc'].map(o => (
                                <option key={o} value={o}>{o}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-end space-x-2 mt-6 pt-4 border-t border-gray-100">
                        <Button type="button" variant="secondary" onClick={onClose}>Anuluj</Button>
                        <Button type="submit">{initialData ? 'Zapisz' : 'Dodaj'}</Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
