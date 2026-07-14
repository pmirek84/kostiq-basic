import { useState } from 'react';
import { useTiCo } from '../../../context/TiCoContext';
import { Plus, Trash2, Edit2, Search, AlertCircle } from 'lucide-react';
import type { Crew } from '../../../models/types';

export const CrewsView = () => {
    const { crews, createCrew, updateCrew, deactivateCrew, employees, subcontractors } = useTiCo();
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form state
    const [formData, setFormData] = useState<{
        name: string;
        foremanId: string;
        memberIds: string[];
    }>({
        name: '',
        foremanId: '',
        memberIds: []
    });

    const filteredCrews = crews.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const activeForemen = employees.filter(e => e.isActive && (e.role === 'foreman' || e.role === 'Brygadzista')); // Accept explicit role or string
    const allWorkers = [...employees.filter(e => e.isActive), ...subcontractors.filter(s => s.isActive)];

    // Helper: Check if worker is in another active crew (excluding current if editing)
    const getWorkerCrewWarning = (workerId: string) => {
        const otherCrew = crews.find(c =>
            c.active &&
            c.id !== editingId &&
            (c.foremanId === workerId || c.memberIds.includes(workerId))
        );
        return otherCrew ? `Już w brygadzie: ${otherCrew.name}` : null;
    };

    const handleEdit = (crew: Crew) => {
        setFormData({
            name: crew.name,
            foremanId: crew.foremanId,
            memberIds: crew.memberIds
        });
        setEditingId(crew.id);
        setIsModalOpen(true);
    };

    const handleAdd = () => {
        setFormData({
            name: '',
            foremanId: '',
            memberIds: []
        });
        setEditingId(null);
        setIsModalOpen(true);
    };

    const handleSubmit = () => {
        if (!formData.name) return alert('Nazwa wymagana');
        if (!formData.foremanId) return alert('Brygadzista wymagany');

        if (editingId) {
            updateCrew(editingId, formData);
        } else {
            createCrew(formData);
        }
        setIsModalOpen(false);
    };

    const toggleMember = (id: string) => {
        const newMembers = formData.memberIds.includes(id)
            ? formData.memberIds.filter(m => m !== id)
            : [...formData.memberIds, id];
        setFormData({ ...formData, memberIds: newMembers });
    };
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-black/10">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                        type="text"
                        placeholder="Szukaj brygady..."
                        className="pl-9 pr-3 py-2 bg-zinc-50 border border-black/10 rounded-xl text-sm w-64 focus:ring-2 focus:ring-[#21808D] outline-none transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center px-4 py-2 bg-black hover:bg-zinc-800 text-white rounded-xl text-sm font-semibold transition-all"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Dodaj brygadę
                </button>
            </div>

            <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50/50 text-zinc-500 font-semibold border-b border-black/10">
                        <tr>
                            <th className="px-6 py-3">Nazwa Brygady</th>
                            <th className="px-6 py-3">Brygadzista</th>
                            <th className="px-6 py-3">Liczba członków</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Akcje</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                        {filteredCrews.map(crew => {
                            const foreman = employees.find(e => e.id === crew.foremanId);
                            const memberCount = crew.memberIds.length;
                            return (
                                <tr key={crew.id} className="hover:bg-zinc-50/40 transition-colors">
                                    <td className="px-6 py-3 font-semibold text-zinc-900">{crew.name}</td>
                                    <td className="px-6 py-3 flex items-center gap-2">
                                        {foreman ? (
                                            <>
                                                <div className="w-6 h-6 rounded-full bg-teal-50 text-[#21808D] flex items-center justify-center text-xs font-bold border border-teal-100/30">
                                                    {foreman.firstName[0]}{foreman.lastName[0]}
                                                </div>
                                                <span className="font-medium text-zinc-800">{foreman.firstName} {foreman.lastName}</span>
                                            </>
                                        ) : <span className="text-red-500 font-medium">Brak?</span>}
                                    </td>
                                    <td className="px-6 py-3 text-zinc-700">{memberCount}</td>
                                    <td className="px-6 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${crew.active ? 'bg-green-50 text-green-700 border border-green-150/30' : 'bg-zinc-150 text-zinc-500'}`}>
                                            {crew.active ? 'Aktywna' : 'Nieaktywna'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-right flex justify-end gap-2">
                                        <button onClick={() => handleEdit(crew)} className="p-1.5 text-zinc-400 hover:text-[#21808D] rounded-xl hover:bg-teal-50/50 transition-colors">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => { if (confirm('Dezaktywować brygadę?')) deactivateCrew(crew.id) }}
                                            className="p-1.5 text-zinc-400 hover:text-red-650 rounded-xl hover:bg-red-50 transition-colors"
                                            title="Dezaktywuj"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredCrews.length === 0 && (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-zinc-400 italic">Brak brygad.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-2xl border border-black/10 shadow-2xl w-[600px] max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-bold text-zinc-900 mb-4">{editingId ? 'Edytuj brygadę' : 'Nowa brygada'}</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-zinc-700 block mb-1">Nazwa brygady</label>
                                <input
                                    className="w-full bg-zinc-50 border border-black/10 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#21808D] outline-none"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="np. Ekipa 1 - Montaż"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-zinc-700 block mb-1">Brygadzista</label>
                                <select
                                    className="w-full bg-zinc-50 border border-black/10 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-[#21808D] outline-none"
                                    value={formData.foremanId}
                                    onChange={e => setFormData({ ...formData, foremanId: e.target.value })}
                                >
                                    <option value="">Wybierz brygadzistę</option>
                                    {activeForemen.map(f => (
                                        <option key={f.id} value={f.id}>{f.firstName} {f.lastName}</option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-zinc-400 mt-1">Lista zawiera tylko pracowników z rolą 'foreman' lub 'Brygadzista'.</p>
                            </div>

                            <div className="border-t border-black/5 pt-4">
                                <label className="text-xs font-semibold text-zinc-700 block mb-2">Członkowie zespołu</label>
                                <div className="max-h-60 overflow-y-auto border border-black/10 rounded-xl divide-y divide-black/5">
                                    {allWorkers.filter(w => w.id !== formData.foremanId).map(worker => {
                                        const warning = getWorkerCrewWarning(worker.id);
                                        const isSelected = formData.memberIds.includes(worker.id);
                                        const name = 'firstName' in worker ? `${worker.firstName} ${worker.lastName}` : worker.name;
                                        const type = 'firstName' in worker ? 'Pracownik' : 'Podwykonawca';

                                        return (
                                            <div key={worker.id} className={`p-2.5 flex items-center justify-between hover:bg-zinc-50/50 ${isSelected ? 'bg-teal-50/40' : ''}`}>
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleMember(worker.id)}
                                                        className="rounded text-[#21808D] focus:ring-[#21808D]"
                                                    />
                                                    <div>
                                                        <div className="text-sm font-semibold text-zinc-900">{name}</div>
                                                        <div className="text-xs text-zinc-500">{type} {warning && <span className="text-amber-700 font-bold ml-1 inline-flex items-center gap-1"><AlertCircle size={10} /> {warning}</span>}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-zinc-650 hover:bg-zinc-50 rounded-xl text-sm font-medium">Anuluj</button>
                            <button onClick={handleSubmit} className="px-5 py-2 bg-black hover:bg-zinc-800 text-white rounded-xl text-sm font-semibold">Zapisz</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
