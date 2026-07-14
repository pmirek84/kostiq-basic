import { useState, useMemo } from 'react';
import { useTiCo } from '../../../context/TiCoContext';
import { X, Save, Check, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { Employee, Subcontractor, WorkerType } from '../../../models/types';
import { format, startOfMonth, endOfMonth } from 'date-fns';

interface SettlementWizardProps {
    onClose: () => void;
    onSuccess: () => void;
}

export function SettlementWizard({ onClose, onSuccess }: SettlementWizardProps) {
    const { employees, subcontractors, timeEntries, requests, createSettlement, updateTimeEntryStatus } = useTiCo();

    // Step 1: Selection
    const [workerType, setWorkerType] = useState<WorkerType>('employee');
    const [workerId, setWorkerId] = useState<string>('');
    const [periodFrom, setPeriodFrom] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [periodTo, setPeriodTo] = useState<string>(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

    // Step 2: Entries Selection
    const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());

    // Show both approved and pending time entries
    const candidates = useMemo(() => {
        if (!workerId) return [];
        return timeEntries.filter(t =>
            t.employeeId === workerId &&
            !t.settlementId &&
            t.date >= periodFrom &&
            t.date <= periodTo
        );
    }, [workerId, periodFrom, periodTo, timeEntries]);

    const pendingCount = useMemo(() => {
        return candidates.filter(c => c.status !== 'approved' && c.status !== 'admin_approved').length;
    }, [candidates]);

    // Derived stats (only count selected approved entries)
    const selectedEntries = candidates.filter(c => selectedEntryIds.has(c.id) && (c.status === 'approved' || c.status === 'admin_approved'));
    const totalSelectedHours = selectedEntries.reduce((sum, e) => sum + e.hours, 0);
    const baseAmount = selectedEntries.reduce((sum, e) => sum + e.cost, 0);

    // Calc Overtime Preview
    const overtimeData = useMemo(() => {
        const hourlyEntries = selectedEntries.filter(e => !e.billingType || e.billingType === 'hourly');
        const dailyMap = new Map<string, number>();
        hourlyEntries.forEach(e => {
            dailyMap.set(e.date, (dailyMap.get(e.date) || 0) + e.hours);
        });
        let hours = 0;
        let pay = 0;
        const rate = hourlyEntries.find(e => e.hourlyRate)?.hourlyRate || 0;
        dailyMap.forEach((h) => {
            if (h > 8) {
                const ot = h - 8;
                hours += ot;
                pay += ot * rate * 0.5;
            }
        });
        return { hours, pay };
    }, [selectedEntries]);

    // Advances Preview
    const advances = useMemo(() => {
        if (!workerId) return [];
        return requests.filter(r =>
            r.employeeId === workerId &&
            r.type === 'zaliczka' &&
            r.status === 'zaakceptowany' &&
            !r.settlementId
        );
    }, [workerId, requests]);

    const totalAdvances = advances.reduce((sum, r) => sum + (r.amount || 0), 0);
    const grossAmount = baseAmount + overtimeData.pay;
    const finalAmount = grossAmount - totalAdvances;

    const handleCreate = () => {
        try {
            createSettlement({
                workerId,
                workerType,
                periodFrom,
                periodTo,
                timeEntryIds: Array.from(selectedEntryIds).filter(id => {
                    const entry = candidates.find(c => c.id === id);
                    return entry && (entry.status === 'approved' || entry.status === 'admin_approved');
                }),
                notes: ''
            });
            onSuccess();
        } catch (e) {
            alert((e as Error).message);
        }
    };

    const toggleSelectAll = async () => {
        const approvedCandidates = candidates.filter(c => c.status === 'approved' || c.status === 'admin_approved');
        if (selectedEntryIds.size === approvedCandidates.length) {
            setSelectedEntryIds(new Set());
        } else {
            setSelectedEntryIds(new Set(approvedCandidates.map(c => c.id)));
        }
    };

    const toggleSelectOne = async (id: string) => {
        const entry = candidates.find(c => c.id === id);
        if (!entry) return;

        if (entry.status !== 'approved' && entry.status !== 'admin_approved') {
            // Auto approve first
            await updateTimeEntryStatus(id, 'approved');
        }

        const next = new Set(selectedEntryIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedEntryIds(next);
    };

    const handleApproveAllPending = async () => {
        const pending = candidates.filter(c => c.status !== 'approved' && c.status !== 'admin_approved');
        for (const p of pending) {
            await updateTimeEntryStatus(p.id, 'approved');
        }
    };

    const availableWorkers = workerType === 'employee' ? employees : subcontractors;

    return (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-3xl border border-zinc-200/60 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-6 border-b border-zinc-200/60 flex justify-between items-center bg-white">
                    <h2 className="text-xl font-bold text-zinc-950">Nowe rozliczenie</h2>
                    <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-8">
                    {/* Step 1: Configuration */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-zinc-50/50 p-5 rounded-2xl border border-zinc-200/50">
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Typ osoby</label>
                            <select
                                value={workerType}
                                onChange={e => { setWorkerType(e.target.value as WorkerType); setWorkerId(''); }}
                                className="w-full text-sm py-2 px-3 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-300 appearance-none cursor-pointer"
                            >
                                <option value="employee">Pracownik</option>
                                <option value="subcontractor">Podwykonawca</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Osoba</label>
                            <select
                                value={workerId}
                                onChange={e => setWorkerId(e.target.value)}
                                className="w-full text-sm py-2 px-3 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-300 appearance-none cursor-pointer"
                            >
                                <option value="">-- Wybierz --</option>
                                {availableWorkers.map(w => (
                                    <option key={w.id} value={w.id}>
                                        {workerType === 'employee' ? (w as Employee).firstName + ' ' + (w as Employee).lastName : (w as Subcontractor).name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Od</label>
                            <input
                                type="date"
                                value={periodFrom}
                                onChange={e => setPeriodFrom(e.target.value)}
                                className="w-full text-sm py-2 px-3 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-300 cursor-pointer"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider mb-1">Do</label>
                            <input
                                type="date"
                                value={periodTo}
                                onChange={e => setPeriodTo(e.target.value)}
                                className="w-full text-sm py-2 px-3 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-300 cursor-pointer"
                            />
                        </div>
                    </div>

                    {/* Step 2: Candidates */}
                    {workerId && (
                        <div>
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-4">
                                <div>
                                    <h3 className="font-bold text-zinc-900 text-sm">Wpisy czasu w wybranym okresie</h3>
                                    <p className="text-xs text-zinc-550 mt-0.5">Zaznacz zatwierdzone wpisy, aby dodać je do rozliczenia.</p>
                                    {pendingCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleApproveAllPending}
                                            className="mt-2 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100/85 border border-amber-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all"
                                        >
                                            <Check className="w-3.5 h-3.5" /> Zatwierdź wszystkie oczekujące ({pendingCount})
                                        </button>
                                    )}
                                </div>
                                <div className="text-sm text-zinc-500 text-right bg-zinc-50/50 border border-zinc-200/50 p-4 rounded-2xl min-w-[240px]">
                                    <div className="flex justify-between gap-4 mb-1 text-xs">
                                        <span>Wybrano: <strong className="text-zinc-950">{selectedEntryIds.size}</strong></span>
                                        <span>Suma h: <strong className="text-zinc-950">{totalSelectedHours} h</strong></span>
                                    </div>
                                    <div className="space-y-0.5 text-xs text-right border-t border-zinc-200/50 pt-2 mt-2">
                                        {overtimeData.hours > 0 && <p className="text-[#21808D]">Nadgodziny: +{overtimeData.hours}h (+{overtimeData.pay.toFixed(2)} PLN)</p>}
                                        {totalAdvances > 0 && <p className="text-red-650">Zaliczki do potrącenia: -{totalAdvances.toFixed(2)} PLN</p>}
                                        <p className="text-base font-black text-emerald-700 mt-1">Sugerowana wypłata: {finalAmount.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="border border-zinc-200/60 rounded-2xl overflow-hidden max-h-[300px] overflow-y-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-zinc-50/50 text-zinc-500 font-bold border-b border-zinc-200/60 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-3 w-10">
                                                <input
                                                    type="checkbox"
                                                    checked={candidates.length > 0 && selectedEntryIds.size === candidates.filter(c => c.status === 'approved' || c.status === 'admin_approved').length}
                                                    onChange={toggleSelectAll}
                                                    disabled={candidates.filter(c => c.status === 'approved' || c.status === 'admin_approved').length === 0}
                                                />
                                            </th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Data</th>
                                            <th className="px-4 py-3">Zlecenie</th>
                                            <th className="px-4 py-3">Etap</th>
                                            <th className="px-4 py-3 text-right">Godziny</th>
                                            <th className="px-4 py-3 text-right">Kwota</th>
                                            <th className="px-4 py-3">Opis</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-100">
                                        {candidates.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="px-4 py-8 text-center text-zinc-400">
                                                    Brak wpisów w tym zakresie dat.
                                                </td>
                                            </tr>
                                        ) : (
                                            candidates.map(entry => {
                                                const isApproved = entry.status === 'approved' || entry.status === 'admin_approved';
                                                return (
                                                    <tr key={entry.id} className={`hover:bg-zinc-50/60 transition-colors ${selectedEntryIds.has(entry.id) ? 'bg-zinc-50/80 font-medium' : ''}`}>
                                                        <td className="px-4 py-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedEntryIds.has(entry.id)}
                                                                onChange={() => toggleSelectOne(entry.id)}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                            {isApproved ? (
                                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg">
                                                                    <CheckCircle2 className="w-3 h-3" /> Zatwierdzony
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => updateTimeEntryStatus(entry.id, 'approved')}
                                                                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-lg transition-colors"
                                                                >
                                                                    <AlertCircle className="w-3 h-3" /> Zatwierdź
                                                                </button>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap text-zinc-650">{entry.date}</td>
                                                        <td className="px-4 py-3 font-semibold text-zinc-900">{entry.jobCode}</td>
                                                        <td className="px-4 py-3 text-zinc-650">{entry.stageName}</td>
                                                        <td className="px-4 py-3 text-right font-semibold text-zinc-800">{entry.hours} h</td>
                                                        <td className="px-4 py-3 text-right font-bold text-zinc-700">{entry.cost.toFixed(2)} zł</td>
                                                        <td className="px-4 py-3 text-zinc-400 max-w-[150px] truncate">{entry.description || '-'}</td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-zinc-200/60 bg-zinc-50/50 flex justify-end gap-3 rounded-b-xl">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 text-sm text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 font-bold transition-colors"
                    >
                        Anuluj
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={selectedEntryIds.size === 0 || candidates.filter(c => selectedEntryIds.has(c.id) && (c.status === 'approved' || c.status === 'admin_approved')).length === 0}
                        className="px-5 py-2.5 text-sm text-white bg-zinc-950 rounded-xl hover:bg-zinc-850 font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    >
                        <Save className="w-4 h-4" />
                        Utwórz rozliczenie
                    </button>
                </div>
            </div>
        </div>
    );
}
