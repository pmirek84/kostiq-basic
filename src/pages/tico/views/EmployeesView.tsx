import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTiCo } from '../../../context/TiCoContext';
import { Plus, Search, Edit2, Archive, ShieldCheck, Key, Eye, EyeOff, Lock } from 'lucide-react';
import type { Employee } from '../../../models/types';
import { toast } from 'sonner';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

// ──────────────────────────────────────────────────────────────
// RBAC: 4-poziomowa matryca ról
// ──────────────────────────────────────────────────────────────
const ROLES = [
    {
        value: 'admin',
        label: 'Administrator',
        desc: 'Pełen dostęp — ustawienia, finanse, zarządzanie kontami',
        color: 'bg-rose-100 text-rose-800 border-rose-200',
        badge: 'bg-rose-500',
    },
    {
        value: 'manager',
        label: 'Manager (Admin 2)',
        desc: 'Zarządza zleceniami i raportami, nie usuwa systemu',
        color: 'bg-amber-100 text-amber-800 border-amber-200',
        badge: 'bg-amber-500',
    },
    {
        value: 'foreman',
        label: 'Brygadzista',
        desc: 'Widzi własne zlecenia, dodaje logi dla swojej ekipy',
        color: 'bg-blue-100 text-blue-800 border-blue-200',
        badge: 'bg-blue-500',
    },
    {
        value: 'worker',
        label: 'Pracownik',
        desc: 'Widzi przypisane zlecenia, zgłasza własne godziny',
        color: 'bg-slate-100 text-slate-700 border-slate-200',
        badge: 'bg-slate-400',
    },
] as const;


function getRoleBadge(role: string) {
    const found = ROLES.find(r => r.value === role);
    if (found) return found;
    // legacy custom role (freetext)
    return { label: role, color: 'bg-gray-100 text-gray-700 border-gray-200', badge: 'bg-gray-400', desc: '' };
}

// ──────────────────────────────────────────────────────────────
// Password Reset Section (separate API call with bcrypt)
// ──────────────────────────────────────────────────────────────
function PasswordResetSection({ employeeId }: { employeeId: string }) {
    const [newPwd, setNewPwd] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [show, setShow] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!newPwd || newPwd.length < 4) {
            toast.error('Hasło musi mieć co najmniej 4 znaki.');
            return;
        }
        if (newPwd !== confirmPwd) {
            toast.error('Hasła nie są identyczne.');
            return;
        }
        setSaving(true);
        try {
            const token = localStorage.getItem('kostiq_token');
            const res = await fetch(`${API_BASE}/auth/set-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ employeeId, newPassword: newPwd })
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || 'Błąd serwera');
            }
            toast.success('Hasło zmienione pomyślnie.');
            setNewPwd('');
            setConfirmPwd('');
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="pt-4 border-t border-indigo-100 mt-4">
            <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-indigo-50 rounded-lg">
                    <Lock className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                    <h4 className="text-sm font-bold text-gray-800">Konto i Dostęp</h4>
                    <p className="text-[10px] text-gray-500">Hasło dostępowe pracownika (bcrypt)</p>
                </div>
            </div>
            <div className="space-y-2">
                <div className="relative">
                    <label className="text-xs font-medium text-gray-700 block mb-1">Nowe hasło</label>
                    <input
                        type={show ? 'text' : 'password'}
                        className="w-full border border-gray-200 rounded-lg p-2 text-sm pr-9 focus:ring-2 focus:ring-indigo-300"
                        placeholder="min. 4 znaki"
                        value={newPwd}
                        onChange={e => setNewPwd(e.target.value)}
                    />
                    <button type="button" onClick={() => setShow(v => !v)}
                        className="absolute right-2 top-7 text-gray-400 hover:text-gray-600">
                        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>
                <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Powtórz hasło</label>
                    <input
                        type={show ? 'text' : 'password'}
                        className={`w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-300 ${confirmPwd && confirmPwd !== newPwd ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                        placeholder="Powtórz nowe hasło"
                        value={confirmPwd}
                        onChange={e => setConfirmPwd(e.target.value)}
                    />
                    {confirmPwd && confirmPwd !== newPwd && (
                        <p className="text-[10px] text-red-500 mt-0.5">Hasła nie są identyczne</p>
                    )}
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving || !newPwd || newPwd !== confirmPwd}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    <Key className="w-3.5 h-3.5" />
                    {saving ? 'Zapisywanie...' : 'Zapisz nowe hasło'}
                </button>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────
export const EmployeesView = () => {
    const { employees, addEmployee, updateEmployee, toggleEmployeeStatus, getSettlementsByWorker, timeEntries } = useTiCo();
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showArchived, setShowArchived] = useState(false);
    const [activeTab, setActiveTab] = useState<'info' | 'access'>('info');

    const [formData, setFormData] = useState<Omit<Employee, 'id' | 'type' | 'currency'>>({
        firstName: '',
        lastName: '',
        role: 'worker',
        hourlyRate: 0,
        dailyRate: 0,
        projectRate: 0,
        isActive: true,
    });

    const filteredEmployees = employees.filter(e =>
        (showArchived || e.isActive !== false) &&
        (e.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            e.firstName.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const editingStats = editingId ? (() => {
        const settlements = getSettlementsByWorker(editingId);
        const settledAmount = settlements.reduce((sum, s) => sum + s.totalAmount, 0);
        const approvedEntries = timeEntries.filter(t => t.employeeId === editingId && t.status === 'approved');
        const totalApprovedHours = approvedEntries.reduce((sum, t) => sum + t.hours, 0);
        return { settledAmount, totalApprovedHours, settlementCount: settlements.length };
    })() : null;

    const handleEdit = (employee: Employee) => {
        setFormData({
            firstName: employee.firstName,
            lastName: employee.lastName,
            role: employee.role,
            hourlyRate: employee.hourlyRate,
            dailyRate: employee.dailyRate || 0,
            projectRate: employee.projectRate || 0,
            isActive: employee.isActive,
        });
        setEditingId(employee.id);
        setActiveTab('info');
        setIsModalOpen(true);
    };

    const handleAdd = () => {
        setFormData({
            firstName: '',
            lastName: '',
            role: 'worker',
            hourlyRate: 0,
            dailyRate: 0,
            projectRate: 0,
            isActive: true
        });
        setEditingId(null);
        setActiveTab('info');
        setIsModalOpen(true);
    };

    const handleSubmit = () => {
        if (!formData.lastName || !formData.firstName) {
            toast.error('Imię i nazwisko są wymagane');
            return;
        }
        if (editingId) {
            updateEmployee(editingId, { ...formData, type: 'employee', currency: 'PLN' });
            toast.success('Dane pracownika zaktualizowane.');
        } else {
            addEmployee({ ...formData, type: 'employee', currency: 'PLN' });
            toast.success('Pracownik dodany.');
        }
        setIsModalOpen(false);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" placeholder="Szukaj pracownika..."
                        className="pl-9 pr-3 py-2 border rounded-lg text-sm w-64"
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                </div>
                <div className="flex items-center gap-3">
                    <label className="flex items-center text-xs text-gray-500 cursor-pointer">
                        <input type="checkbox" className="mr-1.5" checked={showArchived}
                            onChange={e => setShowArchived(e.target.checked)} />
                        Pokaż zarchiwizowanych
                    </label>
                    <button onClick={handleAdd}
                        className="flex items-center px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-sm font-medium">
                        <Plus className="w-4 h-4 mr-2" />Dodaj pracownika
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-3">Pracownik</th>
                            <th className="px-6 py-3">Rola systemowa</th>
                            <th className="px-6 py-3">Stanowisko</th>
                            <th className="px-6 py-3">Stawka</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Akcje</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredEmployees.map(emp => {
                            const roleDef = getRoleBadge(emp.role);
                            return (
                                <tr key={emp.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-3">
                                        <div className="flex items-center">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold mr-3 text-sm">
                                                {emp.firstName[0]}{emp.lastName[0]}
                                            </div>
                                            <div>
                                                <div className="font-medium text-gray-900">{emp.firstName} {emp.lastName}</div>
                                                <div className="text-xs text-gray-400">ID: {emp.id.substring(0, 8)}...</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${roleDef.color}`}>
                                            <ShieldCheck className="w-3 h-3" />
                                            {roleDef.label}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-gray-600 text-sm">{emp.role}</td>
                                    <td className="px-6 py-3 font-medium text-gray-900 text-xs space-y-0.5">
                                        <div>Godz: <span className="font-bold text-zinc-950">{emp.hourlyRate}</span> PLN/h</div>
                                        {emp.dailyRate ? <div>Dniówka: <span className="font-bold text-zinc-950">{emp.dailyRate}</span> PLN</div> : null}
                                        {emp.projectRate ? <div>Akord: <span className="font-bold text-zinc-950">{emp.projectRate}</span> PLN</div> : null}
                                    </td>
                                    <td className="px-6 py-3">
                                        <span className={`px-2 py-1 rounded text-xs ${emp.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {emp.isActive ? 'Aktywny' : 'Nieaktywny'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => handleEdit(emp)}
                                                className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50" title="Edytuj">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => { if (confirm(`${emp.isActive ? 'Zarchiwizować' : 'Przywrócić'} pracownika ${emp.firstName} ${emp.lastName}?`)) toggleEmployeeStatus(emp.id); }}
                                                className={`p-1.5 rounded-lg ${emp.isActive ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}
                                                title={emp.isActive ? 'Archiwizuj' : 'Przywróć'}>
                                                <Archive className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredEmployees.length === 0 && (
                            <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500 italic">Brak pracowników.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[28px] border border-zinc-100 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Modal header */}
                        <div className="px-8 py-5 border-b border-zinc-100 flex items-center gap-3 bg-zinc-50">
                            <div className="w-9 h-9 bg-zinc-200 rounded-xl flex items-center justify-center text-zinc-700">
                                <ShieldCheck className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-zinc-950">{editingId ? 'Edytuj profil pracownika' : 'Nowy pracownik'}</h3>
                                <p className="text-xs text-zinc-500">{editingId ? 'Dane, rola i dostęp do systemu' : 'Wypełnij dane nowego konta'}</p>
                            </div>
                        </div>

                        {/* Stats (edit only) */}
                        {editingId && editingStats && (
                            <div className="mx-6 mt-4 p-3 bg-gray-50 rounded-xl border border-gray-100 grid grid-cols-3 gap-3 text-center">
                                <div>
                                    <div className="text-xs text-gray-500">Godz. zatwierdzonych</div>
                                    <div className="font-bold text-gray-900">{editingStats.totalApprovedHours} h</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500">Suma rozliczeń</div>
                                    <div className="font-bold text-green-600">{editingStats.settledAmount.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</div>
                                </div>
                                <div className="flex flex-col items-center justify-center">
                                    <button onClick={() => navigate(`/tico?tab=payroll&workerId=${editingId}`)}
                                        className="text-xs text-indigo-600 hover:underline">
                                        Historia ({editingStats.settlementCount})
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Tabs */}
                        {editingId && (
                            <div className="flex border-b border-gray-100 mx-6 mt-4">
                                {[
                                    { id: 'info', label: 'Dane i rola' },
                                    { id: 'access', label: 'Konto i hasło' },
                                ].map(tab => (
                                    <button key={tab.id}
                                        onClick={() => setActiveTab(tab.id as any)}
                                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                            {/* Tab: Info */}
                            {(activeTab === 'info' || !editingId) && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-medium text-gray-700 block mb-1">Imię</label>
                                            <input type="text" className="w-full border rounded-lg p-2 text-sm"
                                                value={formData.firstName}
                                                onChange={e => setFormData({ ...formData, firstName: e.target.value })} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-700 block mb-1">Nazwisko</label>
                                            <input type="text" className="w-full border rounded-lg p-2 text-sm"
                                                value={formData.lastName}
                                                onChange={e => setFormData({ ...formData, lastName: e.target.value })} />
                                        </div>
                                    </div>

                                    {/* RBAC Role Selector */}
                                    <div>
                                        <label className="text-xs font-bold text-gray-700 block mb-2 flex items-center gap-1.5">
                                            <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                                            Rola systemowa (RBAC)
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {ROLES.map(r => (
                                                <label key={r.value}
                                                    className={`flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${formData.role === r.value ? `${r.color} border-current shadow-sm` : 'border-gray-200 hover:bg-gray-50'}`}>
                                                    <input type="radio" name="systemRole" value={r.value}
                                                        checked={formData.role === r.value}
                                                        onChange={() => setFormData({ ...formData, role: r.value })}
                                                        className="mt-0.5 text-indigo-600 flex-shrink-0" />
                                                    <div>
                                                        <div className="text-xs font-bold">{r.label}</div>
                                                        <div className="text-[10px] opacity-75 leading-tight">{r.desc}</div>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="text-xs font-medium text-gray-700 block mb-1">Stawka (PLN/h)</label>
                                            <input type="number" className="w-full border rounded-lg p-2 text-sm"
                                                value={formData.hourlyRate}
                                                onChange={e => setFormData({ ...formData, hourlyRate: Number(e.target.value) })} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-700 block mb-1">Dniówka (PLN/dzień)</label>
                                            <input type="number" className="w-full border rounded-lg p-2 text-sm"
                                                value={formData.dailyRate}
                                                onChange={e => setFormData({ ...formData, dailyRate: Number(e.target.value) })} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-medium text-gray-700 block mb-1">Akord / Zlecenie (PLN)</label>
                                            <input type="number" className="w-full border rounded-lg p-2 text-sm"
                                                value={formData.projectRate}
                                                onChange={e => setFormData({ ...formData, projectRate: Number(e.target.value) })} />
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <label className="flex items-center text-sm cursor-pointer">
                                            <input type="checkbox" className="mr-2"
                                                checked={formData.isActive}
                                                onChange={e => setFormData({ ...formData, isActive: e.target.checked })} />
                                            Konto aktywne
                                        </label>
                                    </div>
                                </>
                            )}

                            {/* Tab: Access */}
                            {activeTab === 'access' && editingId && (
                                <PasswordResetSection employeeId={editingId} />
                            )}
                        </div>

                        <div className="flex justify-end gap-3 px-8 py-5 border-t border-zinc-100 bg-zinc-50">
                            <button onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 border border-zinc-200 text-zinc-650 hover:bg-zinc-100 rounded-xl text-sm font-semibold transition-all">Anuluj</button>
                            {(activeTab === 'info' || !editingId) && (
                                <button onClick={handleSubmit}
                                    className="px-5 py-2 bg-zinc-950 text-white rounded-xl text-sm hover:bg-zinc-850 font-semibold transition-all">
                                    Zapisz dane
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
