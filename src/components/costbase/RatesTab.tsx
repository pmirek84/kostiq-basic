import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ActionButtons } from '../ui/ActionButtons';
import { useInstallationRates, type InstallationRate } from '../../hooks/useInstallationRates';

export default function RatesTab() {
    const { rates, loading, deleteRate, addRate, updateRate } = useInstallationRates();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRate, setEditingRate] = useState<InstallationRate | null>(null);

    const handleEdit = (rate: InstallationRate) => {
        setEditingRate(rate);
        setIsModalOpen(true);
    };

    const handleClose = () => {
        setIsModalOpen(false);
        setEditingRate(null);
    };

    if (loading) return (
        <div className="flex justify-center items-center py-20 text-slate-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
            Ładowanie stawek...
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900">Stawki Montażu</h3>
                <Button onClick={() => setIsModalOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Dodaj Stawkę
                </Button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                        <tr>
                            <th className="px-6 py-4 text-left">Typ konstrukcji / Nazwa</th>
                            <th className="px-6 py-4 text-left">Jednostka</th>
                            <th className="px-6 py-4 text-right">Stawka (netto)</th>
                            <th className="px-6 py-4 text-right pr-6">Akcje</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rates.map((r) => (
                            <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-900">{r.type}</td>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-600 text-xs font-medium border border-blue-100">
                                        {r.unit}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right font-mono text-slate-700">
                                    {r.rate.toFixed(2)} PLN
                                </td>
                                <td className="px-6 py-4 text-right pr-6">
                                    <ActionButtons
                                        onEdit={() => handleEdit(r)}
                                        onDelete={() => deleteRate(r.id)}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <AddRateModal
                    onClose={handleClose}
                    onSave={(r) => {
                        if (editingRate) {
                            updateRate({ ...editingRate, ...r });
                        } else {
                            addRate(r);
                        }
                        handleClose();
                    }}
                    initialData={editingRate}
                />
            )}
        </div>
    );
}

interface ModalProps {
    onClose: () => void;
    onSave: (r: Omit<InstallationRate, 'id'>) => void;
    initialData?: InstallationRate | null;
}

function AddRateModal({ onClose, onSave, initialData }: ModalProps) {
    const [formData, setFormData] = useState({
        type: initialData?.type || '',
        unit: initialData?.unit || 'm²',
        rate: initialData?.rate || 0
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-100 animate-in zoom-in-95 duration-200">
                <h2 className="text-xl font-bold text-slate-900 mb-6">
                    {initialData ? 'Edytuj Stawkę' : 'Nowa Stawka montażu'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Typ / Nazwa (np. Okno PVC, Witryna)"
                        value={formData.type}
                        onChange={e => setFormData({ ...formData, type: e.target.value })}
                        required
                        placeholder="Wpisz typ konstrukcji"
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Jednostka</label>
                            <select
                                className="block w-full rounded-xl border-slate-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border transition-all"
                                value={formData.unit}
                                onChange={e => setFormData({ ...formData, unit: e.target.value })}
                            >
                                <option value="m²">m²</option>
                                <option value="mb">mb</option>
                                <option value="szt.">szt.</option>
                                <option value="ryczałt">ryczałt</option>
                            </select>
                        </div>
                        <Input
                            label="Stawka (PLN)"
                            type="number"
                            step="1"
                            value={formData.rate}
                            onChange={e => setFormData({ ...formData, rate: Number(e.target.value) })}
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
