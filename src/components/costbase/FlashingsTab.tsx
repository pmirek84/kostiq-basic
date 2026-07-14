import { useState } from 'react';
import { Search, Plus, Scissors, Download } from 'lucide-react';
import { useSheetMetal, type SheetMetalItem } from '../../hooks/useSheetMetal';
import { ActionButtons } from '../ui/ActionButtons';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export default function FlashingsTab() {
    const { items, deleteItem, addItem, updateItem } = useSheetMetal();
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<SheetMetalItem | null>(null);

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.material.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.type.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-3">
                        <Scissors className="h-6 w-6 text-blue-900" />
                        <h2 className="text-xl font-semibold text-blue-900">Obróbki blacharskie</h2>
                    </div>
                    <div className="flex space-x-4">
                        <Button variant="secondary" onClick={() => { }}>
                            <Download className="h-4 w-4 mr-2" />
                            Eksportuj
                        </Button>
                        <Button onClick={() => { setEditingItem(null); setIsModalOpen(true); }}>
                            <Plus className="h-4 w-4 mr-2" />
                            Dodaj obróbkę
                        </Button>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="Szukaj po nazwie, materiale lub typie..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Nazwa</th>
                                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Materiał</th>
                                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Wykończenie</th>
                                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Grubość (mm)</th>
                                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Wymiary (mm)</th>
                                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Cena (PLN)</th>
                                <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Jednostka</th>
                                <th className="px-6 py-3 text-right font-medium text-gray-500 uppercase tracking-wider">Akcje</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredItems.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                                    <td className="px-6 py-4 text-gray-500">{item.material}</td>
                                    <td className="px-6 py-4 text-gray-500">{item.finishing}</td>
                                    <td className="px-6 py-4 text-gray-500">{item.thickness}</td>
                                    <td className="px-6 py-4 text-gray-500">{item.width} x {item.length}</td>
                                    <td className="px-6 py-4 font-medium text-blue-900">{item.unitPrice.toFixed(2)}</td>
                                    <td className="px-6 py-4 text-gray-500">{item.unit}</td>
                                    <td className="px-6 py-4 text-right">
                                        <ActionButtons
                                            onEdit={() => { setEditingItem(item); setIsModalOpen(true); }}
                                            onDelete={() => deleteItem(item.id)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && (
                <FlashingModal
                    onClose={() => setIsModalOpen(false)}
                    onSave={(data) => {
                        if (editingItem) {
                            updateItem(editingItem.id, data);
                        } else {
                            addItem(data);
                        }
                        setIsModalOpen(false);
                    }}
                    initialData={editingItem}
                />
            )}
        </div>
    );
}

function FlashingModal({ onClose, onSave, initialData }: { onClose: () => void, onSave: (data: any) => void, initialData: SheetMetalItem | null }) {
    const [formData, setFormData] = useState(initialData || {
        name: '',
        type: 'Parapet',
        material: 'Stal ocynkowana',
        finishing: 'Lakier PVD',
        thickness: 0.7,
        width: 200,
        length: 1000,
        color: 'RAL 9016',
        unitPrice: 0,
        unit: 'mb',
        category: 'Parapety'
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 animate-in fade-in zoom-in duration-200">
                <h2 className="text-xl font-semibold mb-6">{initialData ? 'Edytuj obróbkę' : 'Dodaj nową obróbkę'}</h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Nazwa"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        required
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
                            <select
                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                                value={formData.type}
                                onChange={e => setFormData({ ...formData, type: e.target.value })}
                            >
                                {['Parapet', 'Listwa', 'Obróbka', 'Profil', 'Kątownik'].map(o => (
                                    <option key={o} value={o}>{o}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Kategoria</label>
                            <select
                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                                value={formData.category}
                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                            >
                                {['Parapety', 'Listwy', 'Obróbki', 'Profile'].map(o => (
                                    <option key={o} value={o}>{o}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Materiał</label>
                            <select
                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                                value={formData.material}
                                onChange={e => setFormData({ ...formData, material: e.target.value })}
                            >
                                {['Stal ocynkowana', 'Aluminium', 'Blacha stalowa', 'Stal nierdzewna'].map(o => (
                                    <option key={o} value={o}>{o}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Wykończenie</label>
                            <select
                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border"
                                value={formData.finishing}
                                onChange={e => setFormData({ ...formData, finishing: e.target.value })}
                            >
                                {['Lakier PVD', 'Lakier proszkowy', 'Surowy'].map(o => (
                                    <option key={o} value={o}>{o}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <Input
                            label="Grubość (mm)"
                            type="number" step="0.1"
                            value={formData.thickness}
                            onChange={e => setFormData({ ...formData, thickness: Number(e.target.value) })}
                            required
                        />
                        <Input
                            label="Szerokość (mm)"
                            type="number"
                            value={formData.width}
                            onChange={e => setFormData({ ...formData, width: Number(e.target.value) })}
                            required
                        />
                        <Input
                            label="Długość (mm)"
                            type="number"
                            value={formData.length}
                            onChange={e => setFormData({ ...formData, length: Number(e.target.value) })}
                            required
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <Input
                            label="Kolor"
                            value={formData.color}
                            onChange={e => setFormData({ ...formData, color: e.target.value })}
                            required
                        />
                        <Input
                            label="Cena jedn. (PLN)"
                            type="number" step="0.01"
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
                                {['mb', 'm²'].map(o => (
                                    <option key={o} value={o}>{o}</option>
                                ))}
                            </select>
                        </div>
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
