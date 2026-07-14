import { useState, useEffect, useMemo } from 'react';
import { useTiCo } from '../../../context/TiCoContext';
import { Plus, Download, Eye, CheckCircle, Lock } from 'lucide-react';
// import type { Settlement } from '../../../models/types';

interface SettlementsListViewProps {
    onCreateClick: () => void;
    onDetailsClick: (id: string) => void;
    jobFilter?: string;
    workerFilter?: string;
}

export function SettlementsListView({ onCreateClick, onDetailsClick, jobFilter, workerFilter }: SettlementsListViewProps) {
    const { settlements, markSettlementExported, updateSettlement, getSettlementsByJob, timeEntries, employees, subcontractors } = useTiCo();

    // Filters
    const [filterWorkerType, setFilterWorkerType] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');

    // Deep-link / Interactive Filters
    // These track the 'jobId' and 'workerId' filters which can be set via URL (props) 
    // but modified/cleared by the user locally.
    const [activeJobId, setActiveJobId] = useState<string | undefined>(jobFilter);
    const [activeWorkerId, setActiveWorkerId] = useState<string | undefined>(workerFilter);

    // Sync state with props (one-way entry point)
    useEffect(() => {
        setActiveJobId(jobFilter);
    }, [jobFilter]);

    useEffect(() => {
        setActiveWorkerId(workerFilter);
    }, [workerFilter]);

    // Unsettled Balances Calculation
    const unsettledBalances = useMemo(() => {
        const balances: Record<string, { workerId: string, workerName: string, workerType: string, hours: number, amount: number }> = {};

        const relevantEntries = timeEntries.filter(t =>
            (t.status === 'approved' || t.status === 'admin_approved') &&
            !t.settlementId
        );

        relevantEntries.forEach(entry => {
            if (!balances[entry.employeeId]) {
                const emp = employees.find(e => String(e.id) === String(entry.employeeId));
                const sub = subcontractors.find(s => String(s.id) === String(entry.employeeId));
                let name = entry.employeeName || 'Nieznany';
                let type = 'employee';

                if (emp) {
                    name = `${emp.firstName} ${emp.lastName}`;
                } else if (sub) {
                    name = sub.name;
                    type = 'subcontractor';
                }

                balances[entry.employeeId] = {
                    workerId: entry.employeeId,
                    workerName: name,
                    workerType: type,
                    hours: 0,
                    amount: 0
                };
            }
            balances[entry.employeeId].hours += entry.hours;
            balances[entry.employeeId].amount += (entry.cost || 0);
        });

        // Filter by View Filters
        return Object.values(balances).filter(b => {
            if (filterWorkerType !== 'all' && b.workerType !== filterWorkerType) return false;
            if (activeWorkerId && String(b.workerId) !== String(activeWorkerId)) return false;
            // Job filter is tricky for balances since they are aggregated per user. 
            // We could filter entries inside, but here we aggregate all.
            // If activeJobId is set, ideally we only check if user has hours on THAT job.
            // But let's keep it simple: show all pending for the user.
            return true;
        });
    }, [timeEntries, employees, subcontractors, filterWorkerType, activeWorkerId]);

    // Filter Logic
    const filteredSettlements = settlements.filter(s => {
        if (filterWorkerType !== 'all' && s.workerType !== filterWorkerType) return false;
        if (filterStatus !== 'all' && s.status !== filterStatus) return false;

        // Apply Worker Filter
        if (activeWorkerId && s.workerId !== activeWorkerId) return false;

        // Apply Job Filter
        // We use getSettlementsByJob from context which checks TimeEntries overlap
        if (activeJobId) {
            const jobSettlements = getSettlementsByJob(activeJobId);
            if (!jobSettlements.find(js => js.id === s.id)) return false;
        }

        return true;
    });

    const stats = {
        openCount: filteredSettlements.filter(s => s.status === 'open').length,
        openAmount: filteredSettlements.filter(s => s.status === 'open').reduce((sum, s) => sum + s.totalAmount, 0),
        settledAmount: filteredSettlements.filter(s => s.status !== 'open').reduce((sum, s) => sum + s.totalAmount, 0),
        avgRate: filteredSettlements.reduce((sum, s) => sum + s.totalHours, 0) > 0
            ? filteredSettlements.reduce((sum, s) => sum + s.totalAmount, 0) / filteredSettlements.reduce((sum, s) => sum + s.totalHours, 0)
            : 0
    };

    const handleCloseSettlement = async (id: string) => {
        if (confirm('Czy na pewno zamknąć to rozliczenie?')) {
            try {
                await updateSettlement(id, { status: 'closed' });
            } catch (error) {
                console.error('Error closing settlement:', error);
                alert('Nie udało się zamknąć rozliczenia.');
            }
        }
    };

    const handleExport = (id: string) => {
        markSettlementExported(id);
        alert('Eksport CSV (symulacja) zakończony sukcesem.');
    };

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="text-gray-500 text-sm">Otwarte rozliczenia</div>
                    <div className="text-2xl font-bold text-gray-900">{stats.openCount}</div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="text-gray-500 text-sm">Do wypłaty (otwarte)</div>
                    <div className="text-2xl font-bold text-blue-600">{stats.openAmount.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="text-gray-500 text-sm">Rozliczono (zamknięte)</div>
                    <div className="text-2xl font-bold text-green-600">{stats.settledAmount.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="text-gray-500 text-sm">Średnia stawka (z listy)</div>
                    <div className="text-2xl font-bold text-gray-700">{stats.avgRate.toFixed(2)} PLN/h</div>
                </div>
            </div>

            {/* Active Filters Banner */}
            {(activeJobId || activeWorkerId) && (
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg flex items-center justify-between">
                    <div>
                        <p className="text-sm text-blue-700 font-medium mb-1">
                            Aktywne filtry:
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {activeJobId && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    Zlecenie: {activeJobId}
                                    <button
                                        onClick={() => setActiveJobId(undefined)}
                                        className="ml-1.5 text-blue-400 hover:text-blue-600 focus:outline-none font-bold"
                                    >
                                        ×
                                    </button>
                                </span>
                            )}
                            {activeWorkerId && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                    Pracownik: {activeWorkerId}
                                    <button
                                        onClick={() => setActiveWorkerId(undefined)}
                                        className="ml-1.5 text-purple-400 hover:text-purple-600 focus:outline-none font-bold"
                                    >
                                        ×
                                    </button>
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => { setActiveJobId(undefined); setActiveWorkerId(undefined); }}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                        Wyczyść wszystkie
                    </button>
                </div>
            )}

            {/* --- NEW SECTION: Pending Settlements --- */}
            {unsettledBalances.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-yellow-200 overflow-hidden mb-8">
                    <div className="bg-yellow-50 px-6 py-3 border-b border-yellow-100 flex justify-between items-center">
                        <h3 className="text-yellow-800 font-semibold flex items-center gap-2">
                            <Lock className="w-4 h-4" />
                            Do rozliczenia (Zatwierdzone godziny)
                        </h3>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-yellow-50/50 text-yellow-800/70 font-medium">
                            <tr>
                                <th className="px-6 py-2">Osoba</th>
                                <th className="px-6 py-2">Godziny</th>
                                <th className="px-6 py-2">Kwota (Est.)</th>
                                <th className="px-6 py-2 text-right">Akcja</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-yellow-100">
                            {unsettledBalances.map(balance => (
                                <tr key={balance.workerId} className="hover:bg-yellow-50/30">
                                    <td className="px-6 py-3 font-medium text-gray-900">
                                        {balance.workerName}
                                        <span className="text-xs text-gray-400 font-normal ml-2">
                                            ({balance.workerType === 'employee' ? 'Pracownik' : 'Podwykonawca'})
                                        </span>
                                    </td>
                                    <td className="px-6 py-3">{balance.hours} h</td>
                                    <td className="px-6 py-3 font-semibold text-gray-900">
                                        {balance.amount.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <button
                                            onClick={onCreateClick} // TODO: Pass workerId to prefill wizard
                                            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 shadow-sm"
                                        >
                                            Rozlicz
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Toolbar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap justify-between items-center gap-4">
                <div className="flex gap-4">
                    <select
                        value={filterWorkerType}
                        onChange={(e) => setFilterWorkerType(e.target.value)}
                        className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    >
                        <option value="all">Wzyscy (Pracownicy i Podwykonawcy)</option>
                        <option value="employee">Pracownicy</option>
                        <option value="subcontractor">Podwykonawcy</option>
                    </select>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    >
                        <option value="all">Wszystkie statusy</option>
                        <option value="open">Otwarte</option>
                        <option value="closed">Zamknięte</option>
                        <option value="exported">Wyeksportowane</option>
                    </select>
                </div>
                <button
                    onClick={onCreateClick}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Nowe rozliczenie
                </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-3">Osoba</th>
                            <th className="px-6 py-3">Okres</th>
                            <th className="px-6 py-3">Godziny</th>
                            <th className="px-6 py-3">Kwota</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Akcje</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredSettlements.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                                    Brak rozliczeń spełniających kryteria.
                                </td>
                            </tr>
                        ) : (
                            filteredSettlements.map(s => (
                                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">{s.workerName}</div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wide">
                                            {s.workerType === 'employee' ? 'Pracownik' : 'Podwykonawca'}
                                        </div>
                                        <div className="text-xs text-gray-400 font-mono mt-0.5">
                                            {s.id.slice(0, 8)}...
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                                        {s.periodFrom} - {s.periodTo}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-900">{s.totalHours} h</td>
                                    <td className="px-6 py-4 font-bold text-gray-900">
                                        {s.totalAmount.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.status === 'open' ? 'bg-blue-100 text-blue-800' :
                                            s.status === 'closed' ? 'bg-green-100 text-green-800' :
                                                'bg-gray-100 text-gray-800'
                                            }`}>
                                            {s.status === 'open' ? 'Otwarte' :
                                                s.status === 'closed' ? 'Zamknięte' : 'Wyeksportowane'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-3">
                                        <button
                                            onClick={() => onDetailsClick(s.id)}
                                            className="text-gray-400 hover:text-blue-600 transition-colors"
                                            title="Szczegóły"
                                        >
                                            <Eye className="w-5 h-5" />
                                        </button>
                                        {s.status === 'open' && (
                                            <button
                                                onClick={() => handleCloseSettlement(s.id)}
                                                className="text-gray-400 hover:text-green-600 transition-colors"
                                                title="Zamknij"
                                            >
                                                <CheckCircle className="w-5 h-5" />
                                            </button>
                                        )}
                                        {s.status !== 'exported' && (
                                            <button
                                                onClick={() => handleExport(s.id)}
                                                className="text-gray-400 hover:text-indigo-600 transition-colors"
                                                title="Eksportuj"
                                            >
                                                <Download className="w-5 h-5" />
                                            </button>
                                        )}
                                        {s.status === 'exported' && (
                                            <span title="Zablokowane" className="inline-block">
                                                <Lock className="w-5 h-5 text-gray-300" />
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
