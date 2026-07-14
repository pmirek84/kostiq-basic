import { useState } from 'react';
import { Plus, Truck } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ActionButtons } from '../ui/ActionButtons';
import { useLogisticsRates, type LogisticsRate } from '../../hooks/useLogisticsRates';

export default function LogisticsTab() {
    const { logisticsRates, loading, deleteRate, addRate, updateRate } = useLogisticsRates();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRate, setEditingRate] = useState<LogisticsRate | null>(null);

    const handleEdit = (rate: LogisticsRate) => {
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
            Ładowanie stawek transportu...
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-900">Stawki Transportowe</h3>
                <Button onClick={() => setIsModalOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" /> Dodaj Pojazd
                </Button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                        <tr>
                            <th className="px-6 py-4 text-left">Pojazd / Typ transportu</th>
                            <th className="px-6 py-4 text-right">Stawka za km (netto)</th>
                            <th className="px-6 py-4 text-right pr-6">Akcje</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {logisticsRates.map((r) => (
                            <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center">
                                        <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center mr-3 text-slate-500">
                                            <Truck className="h-4 w-4" />
                                        </div>
                                        <span className="font-medium text-slate-900">{r.vehicleType}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right font-mono text-slate-700">
                                    {r.ratePerKm.toFixed(2)} PLN
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
                <AddLogisticsModal
                    onClose={handleClose}
                    onSave={(r) => {
                        if (editingRate) {
                            updateRate(editingRate.id, r);
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
    onSave: (r: Omit<LogisticsRate, 'id'>) => void;
    initialData?: LogisticsRate | null;
}

function AddLogisticsModal({ onClose, onSave, initialData }: ModalProps) {
    const [formData, setFormData] = useState({
        vehicleType: initialData?.vehicleType || '',
        ratePerKm: initialData?.ratePerKm || 0
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-100 animate-in zoom-in-95 duration-200">
                <h2 className="text-xl font-bold text-slate-900 mb-6">
                    {initialData ? 'Edytuj Pojazd' : 'Nowy Pojazd/Stawka'}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                        label="Typ pojazdu / Opis"
                        value={formData.vehicleType}
                        onChange={e => setFormData({ ...formData, vehicleType: e.target.value })}
                        required
                        placeholder="np. Bus dostawczy (do 3.5t)"
                    />
                    <Input
                        label="Stawka za km (PLN netto)"
                        type="number"
                        step="0.01"
                        value={formData.ratePerKm}
                        onChange={e => setFormData({ ...formData, ratePerKm: Number(e.target.value) })}
                        required
                    />
                    <div className="flex justify-end space-x-3 mt-8">
                        <Button type="button" variant="secondary" onClick={onClose} className="px-6">Anuluj</Button>
                        <Button type="submit" className="px-8">{initialData ? 'Zapisz' : 'Dodaj'}</Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
