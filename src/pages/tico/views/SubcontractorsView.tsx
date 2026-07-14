import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTiCo } from '../../../context/TiCoContext';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import type { Subcontractor } from '../../../models/types';

export const SubcontractorsView = () => {
    const { subcontractors, addSubcontractor, updateSubcontractor, getSettlementsByWorker, timeEntries } = useTiCo();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form state
    const [formData, setFormData] = useState<Omit<Subcontractor, 'id'>>({
        type: 'subcontractor',
        name: '',
        specialization: '',
        settlementType: 'ryczałt', // Default
        rate: 0,
        isActive: true,
        currency: 'PLN'
    });

    // Stats for editing
    const editingStats = editingId ? (() => {
        const settlements = getSettlementsByWorker(editingId);
        const settledAmount = settlements.reduce((sum, s) => sum + s.totalAmount, 0);

        // Approved costs in current context
        const approvedEntries = timeEntries.filter(t => t.employeeId === editingId && t.status === 'approved');
        const totalApprovedAmount = approvedEntries.reduce((sum, t) => sum + (t.cost || 0), 0);

        return { settledAmount, totalApprovedAmount, settlementCount: settlements.length };
    })() : null;

    const filteredSubcontractors = subcontractors.filter(sub =>
        sub.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.specialization.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleEdit = (subcontractor: Subcontractor) => {
        setFormData({
            type: 'subcontractor',
            name: subcontractor.name,
            specialization: subcontractor.specialization,
            settlementType: subcontractor.settlementType,
            rate: subcontractor.rate,
            isActive: subcontractor.isActive,
            currency: subcontractor.currency || 'PLN'
        });
        setEditingId(subcontractor.id);
        setIsModalOpen(true);
    };

    const handleAdd = () => {
        setFormData({
            type: 'subcontractor',
            name: '',
            specialization: '',
            settlementType: 'ryczałt',
            rate: 0,
            isActive: true,
            currency: 'PLN'
        });
        setEditingId(null);
        setIsModalOpen(true);
    };

    const handleSubmit = () => {
        if (!formData.name) {
            alert('Nazwa jest wymagana');
            return;
        }

        if (editingId) {
            updateSubcontractor(editingId, formData);
        } else {
            addSubcontractor(formData);
        }
        setIsModalOpen(false);
    };

    const deleteSubcontractor = (id: string, name: string) => {
        if (confirm(`Czy na pewno chcesz usunąć podwykonawcę: ${name}? (Operacja nieodwracalna, deaktywacja instniejących wpisów zalecana)`)) {
            // Soft delete via Update for now
            updateSubcontractor(id, { isActive: false });
        }
    };

    return (
        <div className="space-y-6">
            {/* Header Actions */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Szukaj podwykonawcy..."
                        className="pl-9 pr-3 py-2 border rounded-lg text-sm w-64"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-sm font-medium"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Dodaj podwykonawcę
                </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-3">Nazwa / Firma</th>
                            <th className="px-6 py-3">Specjalizacja</th>
                            <th className="px-6 py-3">Rozliczenie</th>
                            <th className="px-6 py-3">Stawka</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Akcje</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredSubcontractors.map(sub => (
                            <tr key={sub.id} className="hover:bg-gray-50">
                                <td className="px-6 py-3 font-medium text-gray-900">
                                    {sub.name}
                                </td>
                                <td className="px-6 py-3 text-gray-600">{sub.specialization}</td>
                                <td className="px-6 py-3">
                                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs">{sub.settlementType}</span>
                                </td>
                                <td className="px-6 py-3 font-medium text-gray-900">{sub.rate} PLN</td>
                                <td className="px-6 py-3">
                                    <span className={`px-2 py-1 rounded text-xs ${sub.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                        {sub.isActive ? 'Aktywny' : 'Nieaktywny'}
                                    </span>
                                </td>
                                <td className="px-6 py-3 text-right flex justify-end gap-2">
                                    <button
                                        onClick={() => handleEdit(sub)}
                                        className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => deleteSubcontractor(sub.id, sub.name)}
                                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                                        title="Zmień status na nieaktywny"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {filteredSubcontractors.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-500 italic">
                                    Brak podwykonawców.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-xl shadow-xl w-[500px]">
                        <h3 className="text-xl font-bold mb-4">{editingId ? 'Edytuj podwykonawcę' : 'Nowy podwykonawca'}</h3>

                        {editingId && editingStats && (
                            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100 grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-xs text-gray-500">Zatwierdzone Koszty (Total)</div>
                                    <div className="font-bold text-gray-900">{editingStats.totalApprovedAmount.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500">Rozliczono</div>
                                    <div className="font-bold text-green-600">{editingStats.settledAmount.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</div>
                                </div>
                                <div className="text-xs text-blue-600 cursor-pointer hover:underline" onClick={() => navigate(`/tico?tab=payroll&workerId=${editingId}`)}>
                                    Zobacz historię rozliczeń ({editingStats.settlementCount})
                                </div>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-medium text-gray-700 block mb-1">Nazwa / Firma</label>
                                <input
                                    type="text"
                                    className="w-full border rounded-lg p-2 text-sm"
                                    value={formData.name}
                                    placeholder="np. Firma Budowlana XYZ"
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-medium text-gray-700 block mb-1">Specjalizacja</label>
                                <input
                                    type="text"
                                    className="w-full border rounded-lg p-2 text-sm"
                                    value={formData.specialization}
                                    placeholder="np. Hydraulika, Elektryka"
                                    onChange={e => setFormData({ ...formData, specialization: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-gray-700 block mb-1">Typ rozliczenia</label>
                                    <select
                                        className="w-full border rounded-lg p-2 text-sm bg-white"
                                        value={formData.settlementType}
                                        onChange={e => setFormData({ ...formData, settlementType: e.target.value as any })}
                                    >
                                        <option value="ryczałt">Ryczałt</option>
                                        <option value="godzina">Godzinowe</option>
                                        <option value="m2">Za m²</option>
                                        <option value="mb">Za mb</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-700 block mb-1">Stawka</label>
                                    <input
                                        type="number"
                                        className="w-full border rounded-lg p-2 text-sm"
                                        value={formData.rate}
                                        onChange={e => setFormData({ ...formData, rate: Number(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center pt-2">
                                <label className="flex items-center text-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="mr-2"
                                        checked={formData.isActive}
                                        onChange={e => setFormData({ ...formData, isActive: e.target.checked })}
                                    />
                                    Aktywny
                                </label>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded text-sm">Anuluj</button>
                            <button onClick={handleSubmit} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700">Zapisz</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
