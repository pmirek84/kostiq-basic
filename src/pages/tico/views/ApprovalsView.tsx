import { useState } from 'react';
import { useTiCo } from '../../../context/TiCoContext';
import { useJobs } from '../../../context/JobsContext';
import { CheckCircle, XCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export function ApprovalsView() {
    const { timeEntries, updateTimeEntry, batchUpdate, employees, crews } = useTiCo();
    const { jobs } = useJobs();

    // Filters
    const [filterStatus, setFilterStatus] = useState<string>('submitted');
    const [filterEmployee, setFilterEmployee] = useState<string>('all');
    const [filterJob, setFilterJob] = useState<string>('all');
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');

    // Selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const filteredEntries = timeEntries.filter(e => {
        const employee = employees.find(emp => emp.id === e.employeeId);
        const hasCrew = !!employee?.crewId;

        // Status Filter
        if (filterStatus === 'to_foreman') {
            if (!hasCrew || e.status !== 'submitted') return false;
        } else if (filterStatus === 'to_office') {
            const isSoloSubmitted = !hasCrew && e.status === 'submitted';
            const isCrewForemanApproved = hasCrew && e.status === 'foreman_approved';
            if (!isSoloSubmitted && !isCrewForemanApproved) return false;
        } else if (filterStatus !== 'all' && e.status !== filterStatus) {
            return false;
        }

        // Employee Filter
        if (filterEmployee !== 'all' && e.employeeId !== filterEmployee) return false;

        // Job Filter
        if (filterJob !== 'all' && e.jobId !== filterJob) return false;

        // Date Range Filter
        if (dateFrom && e.date < dateFrom) return false;
        if (dateTo && e.date > dateTo) return false;

        return true;
    });

    // Batch Actions
    const toggleSelectAll = () => {
        if (selectedIds.size === filteredEntries.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredEntries.map(e => e.id)));
        }
    };

    const toggleSelectOne = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const handleBatchApprove = () => {
        const selectedEntries = timeEntries.filter(e => selectedIds.has(e.id));
        const invalidEntries = selectedEntries.filter(e => {
            const emp = employees.find(worker => worker.id === e.employeeId);
            return !!emp?.crewId && e.status === 'submitted';
        });

        if (invalidEntries.length > 0) {
            alert(`Nie można zatwierdzić ${invalidEntries.length} wpisów, ponieważ wymagają one najpierw akceptacji brygadzisty.`);
            return;
        }

        if (window.confirm(`Czy na pewno chcesz zatwierdzić ${selectedIds.size} wpisów?`)) {
            batchUpdate(Array.from(selectedIds), {
                status: 'admin_approved',
                adminId: 'Admin',
                adminApprovedAt: new Date().toISOString()
            });
            setSelectedIds(new Set());
        }
    };

    const handleBatchReject = () => {
        if (window.confirm(`Czy na pewno chcesz odrzucić ${selectedIds.size} wpisów?`)) {
            // For batch reject, we usually don't prompt reason per item, or prompt once.
            const reason = prompt("Podaj powód odrzucenia dla wybranych wpisów:");
            if (reason !== null) {
                batchUpdate(Array.from(selectedIds), {
                    status: 'admin_rejected',
                    adminId: 'Admin',
                    adminApprovedAt: new Date().toISOString()
                    // reason: reason // if supported
                });
                setSelectedIds(new Set());
            }
        }
    };

    const totalHours = filteredEntries.reduce((sum, e) => sum + e.hours, 0);
    const totalCost = filteredEntries.reduce((sum, e) => sum + (e.cost || 0), 0);

    return (
        <div className="space-y-4">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="text-gray-500 text-sm">Wszystkie wpisy (widok)</div>
                    <div className="text-2xl font-bold text-gray-900">{filteredEntries.length}</div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="text-gray-500 text-sm">Suma godzin</div>
                    <div className="text-2xl font-bold text-blue-600">{totalHours} h</div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="text-gray-500 text-sm">Estymowany koszt</div>
                    <div className="text-2xl font-bold text-green-600">{totalCost.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}</div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Filters Toolbar */}
                <div className="p-4 border-b border-gray-100 bg-gray-50 space-y-3">
                    <div className="flex flex-wrap gap-3 items-center justify-between">
                        <div className="font-semibold text-gray-700">Filtry i Akcje</div>

                        {selectedIds.size > 0 && (
                            <div className="flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-lg border border-blue-100">
                                <span className="text-sm font-medium text-blue-700">Zaznaczono: {selectedIds.size}</span>
                                <div className="h-4 w-px bg-blue-200 mx-1"></div>
                                <button
                                    onClick={handleBatchApprove}
                                    className="text-xs font-medium text-green-700 hover:text-green-800 hover:bg-green-100 px-2 py-1 rounded transition-colors"
                                >
                                    Zatwierdź wybrane
                                </button>
                                <button
                                    onClick={handleBatchReject}
                                    className="text-xs font-medium text-red-700 hover:text-red-800 hover:bg-red-100 px-2 py-1 rounded transition-colors"
                                >
                                    Odrzuć wybrane
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                        >
                            <option value="all">Wszystkie statusy</option>
                            <option value="to_foreman">Do brygadzisty</option>
                            <option value="to_office">Do akceptacji biura</option>
                            <option value="submitted">Oczekujące (Pracownik)</option>
                            <option value="foreman_approved">Zatwierdzone przez Brygadzistę</option>
                            <option value="foreman_rejected">Odrzucone przez Brygadzistę</option>
                            <option value="approved">Zatwierdzone (Admin)</option>
                            <option value="rejected">Odrzucone (Admin)</option>
                            <option value="draft">Robocze</option>
                        </select>

                        <select
                            value={filterEmployee}
                            onChange={(e) => setFilterEmployee(e.target.value)}
                            className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                        >
                            {/* ... existing employee options ... */}
                            <option value="all">Wszyscy pracownicy</option>
                            {employees.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                            ))}
                        </select>
                        {/* ... existing job/date filters ... */}
                        <select
                            value={filterJob}
                            onChange={(e) => setFilterJob(e.target.value)}
                            className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                        >
                            <option value="all">Wszystkie zlecenia</option>
                            {jobs.map(job => (
                                <option key={job.id} value={job.id}>{job.jobCode} - {job.name}</option>
                            ))}
                        </select>

                        <input
                            type="date"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                            placeholder="Od"
                        />
                        <input
                            type="date"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                            placeholder="Do"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        {/* ... existing thead ... */}
                        <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                            <tr>
                                <th className="px-4 py-3 w-8">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        checked={filteredEntries.length > 0 && selectedIds.size === filteredEntries.length}
                                        onChange={toggleSelectAll}
                                        disabled={filteredEntries.length === 0}
                                    />
                                </th>
                                <th className="px-4 py-3">Data</th>
                                <th className="px-4 py-3">Pracownik</th>
                                <th className="px-4 py-3">Brygada</th>
                                <th className="px-4 py-3">Zlecenie / Etap</th>
                                <th className="px-4 py-3">Godziny</th>
                                <th className="px-4 py-3">Koszt (est.)</th>
                                <th className="px-4 py-3">Opis</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3 text-right">Akcje</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredEntries.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                                        Brak wpisów spełniających kryteria.
                                    </td>
                                </tr>
                            ) : (
                                filteredEntries.map(entry => {
                                    const employee = employees.find(e => e.id === entry.employeeId);
                                    const displayJobName = entry.jobName || jobs.find(j => j.id === entry.jobId)?.name || entry.jobId;
                                    const displayStageName = entry.stageName || entry.stageId;

                                    const crew = crews.find(c => c.id === employee?.crewId);
                                    const foreman = employees.find(emp => emp.id === crew?.foremanId);
                                    const needsForemanApproval = !!employee?.crewId && entry.status === 'submitted';

                                    return (
                                        <tr key={entry.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(entry.id) ? 'bg-blue-50/50' : ''}`}>
                                            <td className="px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    checked={selectedIds.has(entry.id)}
                                                    onChange={() => toggleSelectOne(entry.id)}
                                                />
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {format(parseISO(entry.date), 'dd.MM.yyyy')}
                                            </td>
                                            <td className="px-4 py-3 font-medium text-gray-900">
                                                {employee ? `${employee.firstName} ${employee.lastName}` : (entry.employeeName || 'Nieznany')}
                                            </td>
                                            <td className="px-4 py-3">
                                                {crew ? (
                                                    <div className="text-xs">
                                                        <div className="font-semibold text-indigo-700">{crew.name}</div>
                                                        <div className="text-gray-500">Kier: {foreman ? `${foreman.firstName} ${foreman.lastName}` : '???'}</div>
                                                    </div>
                                                ) : <span className="text-gray-400 text-xs">-</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-gray-900 font-medium">{displayJobName}</div>
                                                <div className="text-xs text-gray-500">{displayStageName}</div>
                                            </td>
                                            <td className="px-4 py-3 font-semibold">{entry.hours}h</td>
                                            <td className="px-4 py-3 text-gray-500">{(entry.cost || 0).toFixed(2)} PLN</td>
                                            <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate" title={entry.description}>
                                                {entry.description || '-'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${entry.status === 'admin_approved' || entry.status === 'approved' ? 'bg-green-100 text-green-700' :
                                                    entry.status === 'admin_rejected' || entry.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                        entry.status === 'foreman_approved' ? 'bg-indigo-100 text-indigo-700' :
                                                            entry.status === 'foreman_rejected' ? 'bg-pink-100 text-pink-700' :
                                                                entry.status === 'submitted' ? 'bg-yellow-100 text-yellow-700' :
                                                                    'bg-gray-100 text-gray-600'
                                                    }`}>
                                                    {entry.status === 'submitted' ? 'Oczekujący' :
                                                        entry.status === 'foreman_approved' ? 'Akcept. Bryg.' :
                                                            entry.status === 'foreman_rejected' ? 'Odrzucony (Bryg.)' :
                                                                (entry.status === 'admin_approved' || entry.status === 'approved') ? 'Zatwierdzony' :
                                                                    (entry.status === 'admin_rejected' || entry.status === 'rejected') ? 'Odrzucony' :
                                                                        entry.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right space-x-2">
                                                {(entry.status === 'submitted' || entry.status === 'foreman_approved') && (
                                                    <div className="flex justify-end gap-1">
                                                        <button
                                                            onClick={() => updateTimeEntry(entry.id, {
                                                                status: 'admin_approved',
                                                                adminId: 'Admin',
                                                                adminApprovedAt: new Date().toISOString()
                                                            })}
                                                            disabled={needsForemanApproval}
                                                            className={`p-1 rounded ${needsForemanApproval
                                                                ? 'text-gray-300 cursor-not-allowed'
                                                                : 'text-green-600 hover:text-green-800 hover:bg-green-50'}`}
                                                            title={needsForemanApproval ? "Wymagana akceptacja brygadzisty" : "Zatwierdź (Admin)"}
                                                        >
                                                            <CheckCircle className="w-5 h-5" />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                const reason = prompt("Podaj powód odrzucenia:");
                                                                if (reason !== null) {
                                                                    updateTimeEntry(entry.id, {
                                                                        status: 'admin_rejected',
                                                                        adminId: 'Admin',
                                                                        adminApprovedAt: new Date().toISOString()
                                                                    });
                                                                }
                                                            }}
                                                            disabled={needsForemanApproval}
                                                            className={`p-1 rounded ${needsForemanApproval
                                                                ? 'text-gray-300 cursor-not-allowed'
                                                                : 'text-red-600 hover:text-red-800 hover:bg-red-50'}`}
                                                            title={needsForemanApproval ? "Wymagana akceptacja brygadzisty" : "Odrzuć (Admin)"}
                                                        >
                                                            <XCircle className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
