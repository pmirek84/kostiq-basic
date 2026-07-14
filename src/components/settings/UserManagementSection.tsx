/**
 * UserManagementSection.tsx
 * Central IAM panel — visible only to admin role.
 * Features: employee table with role badges, quick role change, secure password reset.
 */
import { useState, useCallback } from 'react';
import {
    ShieldCheck, Key, Check, X, Eye, EyeOff,
    Users, Search, Lock, RefreshCw, MoreVertical, AtSign, Pencil
} from 'lucide-react';
import { useTiCo } from '../../context/TiCoContext';
import { useAuth } from '../../context/AuthContext';
import type { Employee } from '../../models/types';
import { toast } from 'sonner';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('kostiq_token');
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

// ──────────────────────────────────────────
// RBAC Role Dictionary
// ──────────────────────────────────────────
const ROLES = [
    { value: 'admin', label: 'Administrator', desc: 'Pełen dostęp', pill: 'bg-rose-100 text-rose-800 border-rose-200', dot: 'bg-rose-500' },
    { value: 'manager', label: 'Manager', desc: 'Zlecenia i raporty', pill: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
    { value: 'foreman', label: 'Brygadzista', desc: 'Logi dla ekipy', pill: 'bg-blue-100 text-blue-800 border-blue-200', dot: 'bg-blue-500' },
    { value: 'worker', label: 'Pracownik', desc: 'Własne zlecenia i godziny', pill: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
] as const;

type RoleValue = typeof ROLES[number]['value'];

function getRoleDef(role: string) {
    return ROLES.find(r => r.value === role) ?? { value: role, label: role, desc: '', pill: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400' };
}

// ──────────────────────────────────────────
// Role Change Modal
// ──────────────────────────────────────────
interface RoleModalProps {
    employee: Employee;
    onClose: () => void;
    onSave: (newRole: RoleValue) => Promise<void>;
}
function RoleModal({ employee, onClose, onSave }: RoleModalProps) {
    const current = getRoleDef(employee.role);
    const [selected, setSelected] = useState<RoleValue>(employee.role as RoleValue);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (selected === employee.role) { onClose(); return; }
        setSaving(true);
        await onSave(selected);
        setSaving(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                            <ShieldCheck className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-base">Zmień uprawnienia</h3>
                            <p className="text-xs text-gray-500">{employee.firstName} {employee.lastName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
                </div>

                {/* Current role */}
                <div className="px-6 pt-4 pb-2">
                    <p className="text-xs text-gray-500 mb-1">Aktualna rola</p>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${current.pill}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
                        {current.label}
                    </span>
                </div>

                {/* Role selector */}
                <div className="px-6 pb-5 space-y-2 mt-3">
                    <p className="text-xs font-semibold text-gray-600 mb-2">Wybierz nową rolę</p>
                    {ROLES.map(r => (
                        <label key={r.value}
                            className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${selected === r.value ? `${r.pill} border-current shadow-sm` : 'border-gray-100 hover:bg-gray-50'}`}>
                            <input type="radio" name="role" value={r.value} checked={selected === r.value}
                                onChange={() => setSelected(r.value)} className="mt-0.5 text-indigo-600" />
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className={`w-2 h-2 rounded-full ${r.dot}`} />
                                    <span className="text-sm font-semibold">{r.label}</span>
                                    {r.value === employee.role && (
                                        <span className="text-[10px] bg-white/70 px-1.5 py-0.5 rounded border border-current">aktualna</span>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5 ml-4">{r.desc}</p>
                            </div>
                            {selected === r.value && <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-current" />}
                        </label>
                    ))}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Anuluj</button>
                    <button onClick={handleSave} disabled={saving || selected === employee.role}
                        className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                        {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        {saving ? 'Zapisuję...' : 'Zapisz rolę'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────
// Password Reset Modal
// ──────────────────────────────────────────
interface PasswordModalProps {
    employee: Employee;
    onClose: () => void;
}
function PasswordModal({ employee, onClose }: PasswordModalProps) {
    const [newPwd, setNewPwd] = useState('');
    const [confirmPwd, setConfirmPwd] = useState('');
    const [show, setShow] = useState(false);
    const [saving, setSaving] = useState(false);

    const mismatch = confirmPwd.length > 0 && newPwd !== confirmPwd;
    const canSave = newPwd.length >= 4 && newPwd === confirmPwd;

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/auth/set-password`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ employeeId: employee.id, newPassword: newPwd })
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || 'Błąd serwera');
            }
            toast.success(`Hasło zmienione dla ${employee.firstName} ${employee.lastName}`);
            onClose();
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-rose-50 to-white">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                            <Lock className="w-5 h-5 text-rose-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 text-base">Reset hasła</h3>
                            <p className="text-xs text-gray-500">{employee.firstName} {employee.lastName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
                </div>

                <div className="px-6 py-5 space-y-4">
                    <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs text-amber-800">
                        Hasło po zmianie będzie zahashowane (bcrypt). Pracownik użyje go przy logowaniu do systemu.
                    </div>

                    {/* New password */}
                    <div>
                        <label className="text-xs font-semibold text-gray-700 block mb-1.5">Nowe hasło</label>
                        <div className="relative">
                            <input
                                type={show ? 'text' : 'password'}
                                placeholder="min. 4 znaki"
                                value={newPwd}
                                onChange={e => setNewPwd(e.target.value)}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm pr-10 focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
                            <button type="button" onClick={() => setShow(v => !v)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {/* Strength bar */}
                        <div className="mt-1.5 flex gap-1">
                            {[4, 7, 10, 14].map((threshold, i) => (
                                <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${newPwd.length >= threshold ? ['bg-red-400', 'bg-amber-400', 'bg-blue-400', 'bg-green-500'][i] : 'bg-gray-100'}`} />
                            ))}
                        </div>
                    </div>

                    {/* Confirm */}
                    <div>
                        <label className="text-xs font-semibold text-gray-700 block mb-1.5">Powtórz hasło</label>
                        <input
                            type={show ? 'text' : 'password'}
                            placeholder="Powtórz nowe hasło"
                            value={confirmPwd}
                            onChange={e => setConfirmPwd(e.target.value)}
                            className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:outline-none ${mismatch ? 'border-red-300 bg-red-50 focus:ring-red-200' : 'border-gray-200 focus:ring-indigo-300'}`} />
                        {mismatch && <p className="text-[11px] text-red-500 mt-1">Hasła nie są identyczne</p>}
                    </div>
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Anuluj</button>
                    <button onClick={handleSave} disabled={saving || !canSave}
                        className="px-5 py-2 bg-rose-600 text-white rounded-xl text-sm font-semibold hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2">
                        {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        <Key className="w-3.5 h-3.5" />
                        {saving ? 'Zapisuję...' : 'Zmień hasło'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ──────────────────────────────────────────
// Action Menu (three-dot)
// ──────────────────────────────────────────
function ActionMenu({ onChangeRole, onResetPassword }: { onChangeRole: () => void; onResetPassword: () => void }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative">
            <button onClick={() => setOpen(v => !v)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">
                <MoreVertical className="w-4 h-4" />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-8 z-30 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-[170px]">
                        <button onClick={() => { setOpen(false); onChangeRole(); }}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-800 transition-colors">
                            <ShieldCheck className="w-4 h-4 text-indigo-500" />
                            Zmień rolę
                        </button>
                        <button onClick={() => { setOpen(false); onResetPassword(); }}
                            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-rose-50 hover:text-rose-800 transition-colors">
                            <Key className="w-4 h-4 text-rose-500" />
                            Resetuj hasło
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

// ──────────────────────────────────────────
// Main Export — UserManagementSection
// ──────────────────────────────────────────
export function UserManagementSection() {
    const { user } = useAuth();
    const { employees, updateEmployee } = useTiCo();

    const [searchTerm, setSearchTerm] = useState('');
    const [roleModal, setRoleModal] = useState<Employee | null>(null);
    const [pwdModal, setPwdModal] = useState<Employee | null>(null);
    const [loginModal, setLoginModal] = useState<Employee | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [loginValue, setLoginValue] = useState('');

    // Admin-only guard
    if (user?.role !== 'admin') return null;

    const filtered = employees.filter(e =>
        e.isActive !== false &&
        (`${e.firstName} ${e.lastName}`).toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleLoginSave = useCallback(async () => {
        if (!loginModal) return;
        const trimmed = loginValue.trim();
        setUpdatingId(loginModal.id);
        try {
            const res = await fetch(`${API_BASE}/employees/${loginModal.id}`, {
                method: 'PATCH',
                headers: getAuthHeaders(),
                body: JSON.stringify({ email: trimmed, login: trimmed })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            await updateEmployee(loginModal.id, { email: trimmed, login: trimmed } as any);
            toast.success(`Login zaktualizowany: ${loginModal.firstName}`);
        } catch (e: any) {
            toast.error(`Błąd: ${e.message}`);
        } finally {
            setUpdatingId(null);
            setLoginModal(null);
        }
    }, [loginModal, loginValue, updateEmployee]);

    const handleRoleChange = useCallback(async (newRole: RoleValue) => {
        if (!roleModal) return;
        setUpdatingId(roleModal.id);
        try {
            // 1. Update in backend via PATCH
            const res = await fetch(`${API_BASE}/employees/${roleModal.id}`, {
                method: 'PATCH',
                headers: getAuthHeaders(),
                body: JSON.stringify({ role: newRole })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            // 2. Update local state via context
            await updateEmployee(roleModal.id, { role: newRole } as any);
            toast.success(`Rola zmieniona: ${roleModal.firstName} → ${getRoleDef(newRole).label}`);
        } catch (e: any) {
            toast.error(`Błąd zmiany roli: ${e.message}`);
        } finally {
            setUpdatingId(null);
        }
    }, [roleModal, updateEmployee]);

    return (
        <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden">
            {/* Panel header */}
            <div className="px-8 py-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-indigo-50/60 to-white">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                        <Users className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h3 className="text-base font-black text-slate-800">Pracownicy i Uprawnienia</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Zarządzanie rolami i hasłami — widoczne tylko dla admina</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* RBAC legend pills */}
                    {ROLES.map(r => (
                        <span key={r.value} className={`hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${r.pill}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${r.dot}`} />
                            {r.label}
                        </span>
                    ))}
                </div>
            </div>

            {/* Search bar */}
            <div className="px-8 py-4 border-b border-slate-100">
                <div className="relative max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Szukaj pracownika..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-slate-50" />
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="px-8 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Pracownik</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Rola systemowa</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Login / Email</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Status hasła</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wide">Akcje</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {filtered.length === 0 && (
                            <tr><td colSpan={5} className="px-8 py-10 text-center text-slate-400 text-sm">Brak pracowników</td></tr>
                        )}
                        {filtered.map(emp => {
                            const roleDef = getRoleDef(emp.role);
                            const isUpdating = updatingId === emp.id;
                            const hasPwd = !!(emp as any).pwaPassword;
                            return (
                                <tr key={emp.id} className={`hover:bg-slate-50/80 transition-colors ${isUpdating ? 'opacity-60 animate-pulse' : ''}`}>
                                    {/* Avatar + name */}
                                    <td className="px-8 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${roleDef.pill}`}>
                                                {emp.firstName[0]}{emp.lastName[0]}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-slate-900 text-sm">{emp.firstName} {emp.lastName}</p>
                                                <p className="text-[11px] text-slate-400 font-mono">{emp.id.substring(0, 8)}…</p>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Role badge */}
                                    <td className="px-4 py-3.5">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${roleDef.pill}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${roleDef.dot}`} />
                                            {roleDef.label}
                                        </span>
                                    </td>

                                    {/* Login / Email */}
                                    <td className="px-4 py-3.5">
                                        <div className="flex items-center gap-1.5">
                                            {(emp.email || emp.login) ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded-lg">
                                                    <AtSign className="w-3 h-3 text-slate-400" />
                                                    {emp.email || emp.login}
                                                </span>
                                            ) : (
                                                <span className="text-[11px] text-slate-400 italic">{emp.firstName} {emp.lastName}</span>
                                            )}
                                            <button
                                                onClick={() => { setLoginModal(emp); setLoginValue(emp.email || emp.login || ''); }}
                                                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors ml-1"
                                                title="Edytuj login">
                                                <Pencil className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </td>

                                    {/* Password status */}
                                    <td className="px-4 py-3.5">
                                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${hasPwd ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                            <Lock className="w-2.5 h-2.5" />
                                            {hasPwd ? 'Ustawione' : 'Domyślne'}
                                        </span>
                                    </td>

                                    {/* Actions — three-dot menu */}
                                    <td className="px-4 py-3.5 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => setRoleModal(emp)}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-colors font-medium">
                                                <ShieldCheck className="w-3 h-3" />
                                                Rola
                                            </button>
                                            <button
                                                onClick={() => setPwdModal(emp)}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg hover:bg-rose-100 transition-colors font-medium">
                                                <Key className="w-3 h-3" />
                                                Hasło
                                            </button>
                                            <ActionMenu
                                                onChangeRole={() => setRoleModal(emp)}
                                                onResetPassword={() => setPwdModal(emp)} />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Footer summary */}
            <div className="px-8 py-3 border-t border-slate-100 bg-slate-50 flex items-center gap-6 text-xs text-slate-400">
                <span><strong className="text-slate-600">{filtered.length}</strong> pracowników</span>
                {ROLES.map(r => {
                    const count = filtered.filter(e => e.role === r.value).length;
                    if (!count) return null;
                    return (
                        <span key={r.value} className={`inline-flex items-center gap-1 font-medium`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${r.dot}`} />
                            {r.label}: {count}
                        </span>
                    );
                })}
            </div>

            {/* Modals */}
            {roleModal && (
                <RoleModal
                    employee={roleModal}
                    onClose={() => setRoleModal(null)}
                    onSave={handleRoleChange} />
            )}
            {pwdModal && (
                <PasswordModal
                    employee={pwdModal}
                    onClose={() => setPwdModal(null)} />
            )}
            {loginModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
                                    <AtSign className="w-4 h-4 text-indigo-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 text-sm">Ustaw login</h3>
                                    <p className="text-xs text-gray-500">{loginModal.firstName} {loginModal.lastName}</p>
                                </div>
                            </div>
                            <button onClick={() => setLoginModal(null)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-3">
                                Pracownik użyje tego loginu (lub imienia i nazwiska) przy logowaniu do panelu web.
                                Jeśli pozostawisz puste — logowanie przez <strong>{loginModal.firstName} {loginModal.lastName}</strong>.
                            </p>
                            <div>
                                <label className="text-xs font-semibold text-gray-700 block mb-1.5">Email / Login</label>
                                <div className="relative">
                                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder={`np. ${loginModal.firstName.toLowerCase()}.${loginModal.lastName.toLowerCase()}@firma.pl`}
                                        value={loginValue}
                                        onChange={e => setLoginValue(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-300 focus:outline-none" />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
                            <button onClick={() => setLoginModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Anuluj</button>
                            <button onClick={handleLoginSave}
                                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold flex items-center gap-1.5">
                                <Check className="w-3.5 h-3.5" /> Zapisz login
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
