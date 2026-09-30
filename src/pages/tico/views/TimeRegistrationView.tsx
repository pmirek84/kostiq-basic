import { useState, useMemo } from 'react';
import { useTiCo } from '../../../context/TiCoContext';
import { useJobs } from '../../../context/JobsContext';
import { Plus, Search, Trash2, CheckCircle, Info, XCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export const TimeRegistrationView = () => {
    const { timeEntries, addTimeEntry, deleteTimeEntry, batchUpdate, employees } = useTiCo();
    const { jobs } = useJobs();

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterJob, setFilterJob] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');

    // --- Form State ---
    const [isSubmitting, setIsSubmitting] = useState(false); // Shield #4: Race condition guard
    const [newEntry, setNewEntry] = useState<{
        jobId: string;
        stageId: string;
        employeeId: string;
        date: string;
        hours: number;
        billingType: 'hourly' | 'daily' | 'project';
        customRate?: number;
        description: string;
    }>({
        jobId: '',
        stageId: '',
        employeeId: '',
        date: new Date().toISOString().split('T')[0],
        hours: 8,
        billingType: 'hourly',
        description: ''
    });

    // --- Stats ---
    const stats = useMemo(() => {
        const totalHours = timeEntries.reduce((sum, e) => sum + e.hours, 0);
        const totalCost = timeEntries.reduce((sum, e) => sum + (e.cost || 0), 0);
        const pendingCount = timeEntries.filter(e => e.status === 'submitted' || e.status === 'pending').length;
        const avgRate = totalHours > 0 ? totalCost / totalHours : 0;

        return { totalHours, totalCost, pendingCount, avgRate };
    }, [timeEntries]);

    // --- Filtering ---
    const filteredEntries = timeEntries.filter(entry => {
        if (filterStatus !== 'all' && entry.status !== filterStatus) {
            // Mapping for pending
            if (filterStatus === 'submitted' && entry.status === 'pending') return true;
            return false;
        }
        if (filterJob !== 'all' && entry.jobId !== filterJob) return false;
        if (searchTerm) {
            const emp = employees.find(e => e.id === entry.employeeId);
            const searchLower = searchTerm.toLowerCase();
            return (emp?.lastName.toLowerCase().includes(searchLower) ||
                (entry.description || '').toLowerCase().includes(searchLower) ||
                (entry.jobName || '').toLowerCase().includes(searchLower));
        }
        return true;
    });

    // --- Helpers ---
    const activeJobs = jobs.filter(j => j.status === 'planned' || j.status === 'in_progress');
    const selectedJob = jobs.find(j => j.id === newEntry.jobId);
    // Enforce rule: Time can only be logged against active stages
    const availableStages = (selectedJob?.stages || []).filter(s => s.status === 'planowany' || s.status === 'w_toku');

    const getStatusBadge = (status: string | undefined) => {
        if (!status) return <span className="px-2 py-1 rounded bg-gray-100 text-gray-400 text-xs">Nieznany</span>;
        switch (status) {
            case 'draft': return <span className="px-2 py-1 rounded bg-gray-100 text-gray-600 text-xs">Wprowadzone</span>;
            case 'submitted': case 'pending': return <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700 text-xs border-l-4 border-yellow-500">Do akceptacji</span>;
            case 'approved': return <span className="px-2 py-1 rounded bg-green-100 text-green-700 text-xs flex items-center"><CheckCircle className="w-3 h-3 mr-1" /> Zaakceptowane</span>;
            case 'rejected': return <span className="px-2 py-1 rounded bg-red-100 text-red-700 text-xs text-red-600">Odrzucone</span>;
            default: return status;
        }
    };

    // --- Handlers ---
    const handleBatchApprove = () => {
        batchUpdate(selectedIds, { status: 'approved' });
        setSelectedIds([]);
    };

    const handleAddSubmit = () => {
        if (isSubmitting) return; // Shield #4: prevent double-click race condition
        if (!newEntry.jobId || !newEntry.stageId || !newEntry.employeeId) {
            alert('Wybierz Zlecenie, Etap i Pracownika');
            return;
        }

        const job = jobs.find(j => j.id === newEntry.jobId);
        const stage = job?.stages?.find(s => s.id === newEntry.stageId);
        const employee = employees.find(e => e.id === newEntry.employeeId);

        if (job && stage && employee) {
            setIsSubmitting(true);
            const billingType = newEntry.billingType;
            let rate = 0;
            let cost = 0;
            let hours = newEntry.hours;

            if (billingType === 'hourly') {
                rate = newEntry.customRate !== undefined ? newEntry.customRate : (employee.hourlyRate || 0);
                cost = hours * rate;
            } else if (billingType === 'daily') {
                rate = newEntry.customRate !== undefined ? newEntry.customRate : (employee.dailyRate || 0);
                cost = hours * rate; // hours acts as number of days
            } else if (billingType === 'project') {
                rate = newEntry.customRate !== undefined ? newEntry.customRate : (employee.projectRate || 0);
                cost = rate; // flat project cost
                hours = 0; // project based doesn't enforce work hours
            }

            // Shield #3: Ensure date is sent as ISO 8601 UTC
            const [year, month, day] = newEntry.date.split('-').map(Number);
            const utcDate = new Date(Date.UTC(year, month - 1, day));
            const isoUtcDate = utcDate.toISOString();

            const entryPayload = {
                employeeId: employee.id,
                employeeName: `${employee.firstName} ${employee.lastName}`,
                jobId: job.id,
                jobCode: job.jobCode,
                jobName: job.name,
                stageId: stage.id,
                stageName: stage.name,
                date: isoUtcDate,
                hours: hours,
                billingType: billingType,
                hourlyRate: rate, // snapshot rate
                cost: cost,
                type: 'work' as const,
                description: newEntry.description,
            };

            addTimeEntry(entryPayload);
            setIsSubmitting(false);
            setIsAddModalOpen(false);
            setNewEntry(prev => ({ ...prev, description: '', customRate: undefined }));
        }
    };

    const [viewNote, setViewNote] = useState<string | null>(null);

    // ... (keep existing state and logic until return)

    return (
        <div className="space-y-6">

            {/* ... Stats Cards & Filters (Keep as is in original file, just ensure wrapper structure) ... */}

            {/* --- Stats Cards --- */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500">Godziny łącznie</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalHours.toLocaleString()} h</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500">Koszt pracy (est.)</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.totalCost.toLocaleString()} PLN</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500">Do akceptacji</p>
                    <p className="text-2xl font-bold text-yellow-600">{stats.pendingCount}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-sm text-gray-500">Średnia stawka</p>
                    <p className="text-2xl font-bold text-gray-900">{stats.avgRate.toFixed(2)} PLN/h</p>
                </div>
            </div>

            {/* --- Filters & Actions --- */}
            <div className="flex flex-col md:flex-row justify-between gap-4 items-center bg-white p-5 rounded-2xl border border-zinc-200/60">
                <div className="flex gap-2 flex-wrap w-full md:w-auto">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Szukaj..."
                            className="pl-9 pr-3 py-2 border border-zinc-200 rounded-xl text-sm w-48 focus:ring-2 focus:ring-zinc-300 outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <select
                        className="p-2 border border-zinc-200 rounded-xl text-sm bg-white cursor-pointer focus:ring-2 focus:ring-zinc-300 outline-none"
                        value={filterJob}
                        onChange={(e) => setFilterJob(e.target.value)}
                    >
                        <option value="all">Wszystkie zlecenia</option>
                        {jobs.map(j => <option key={j.id} value={j.id}>{j.jobCode} - {j.name}</option>)}
                    </select>
                    <select
                        className="p-2 border border-zinc-200 rounded-xl text-sm bg-white cursor-pointer focus:ring-2 focus:ring-zinc-300 outline-none"
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                    >
                        <option value="all">Wszystkie statusy</option>
                        <option value="draft">Wprowadzone</option>
                        <option value="submitted">Do akceptacji</option>
                        <option value="approved">Zaakceptowane</option>
                        <option value="rejected">Odrzucone</option>
                    </select>
                </div>

                <div className="flex gap-2">
                    {selectedIds.length > 0 && (
                        <button
                            onClick={handleBatchApprove}
                            className="flex items-center px-4 py-2 bg-emerald-55 text-emerald-700 hover:bg-emerald-100/80 border border-emerald-200 rounded-xl text-sm font-semibold transition-colors"
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Zatwierdź ({selectedIds.length})
                        </button>
                    )}
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center px-5 py-2.5 bg-zinc-950 text-white hover:bg-zinc-850 rounded-xl text-sm font-bold shadow-sm transition-colors"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Nowy wpis czasu
                    </button>
                </div>
            </div>

            {/* --- Table --- */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                        <tr>
                            <th className="px-4 py-3 w-10">
                                <input
                                    type="checkbox"
                                    onChange={(e) => {
                                        if (e.target.checked) setSelectedIds(filteredEntries.map(e => e.id));
                                        else setSelectedIds([]);
                                    }}
                                    checked={selectedIds.length === filteredEntries.length && filteredEntries.length > 0}
                                />
                            </th>
                            <th className="px-4 py-3">Data</th>
                            <th className="px-4 py-3">Zlecenie / Etap</th>
                            <th className="px-4 py-3">Osoba</th>
                            <th className="px-4 py-3 text-right">Godziny</th>
                            <th className="px-4 py-3 text-center">Status</th>
                            <th className="px-4 py-3 text-right">Koszt</th>
                            <th className="px-4 py-3 text-right">Akcje</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredEntries.map(entry => {
                            // Robust Lookup Logic
                            const empId = entry.employeeId || (entry as any).employee_id;
                            const employee = employees.find(e => String(e.id) === String(empId));

                            const job = jobs.find(j => String(j.id) === String(entry.jobId));
                            const displayJobName = entry.jobName || job?.name || entry.jobId;
                            const displayJobCode = entry.jobCode || job?.jobCode || '';
                            const displayStageName = entry.stageName || entry.stageId;

                            const isSelected = selectedIds.includes(entry.id);                             return (
                                <tr key={entry.id} className={`hover:bg-zinc-50/60 transition-colors ${isSelected ? 'bg-zinc-50/80 font-medium' : ''}`}>
                                    <td className="px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => {
                                                if (isSelected) setSelectedIds(prev => prev.filter(id => id !== entry.id));
                                                else setSelectedIds(prev => [...prev, entry.id]);
                                            }}
                                        />
                                    </td>
                                    <td className="px-4 py-3 font-medium text-gray-900">
                                        {format(parseISO(entry.date), 'dd.MM.yyyy')}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-bold text-zinc-950 hover:text-[#21808D] hover:underline cursor-pointer">
                                            {displayJobCode} {displayJobName}
                                        </div>
                                        <div className="text-xs text-zinc-500">{displayStageName}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center">
                                            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 mr-2">
                                                {(employee?.firstName || entry.employeeName || '??').substring(0, 2).toUpperCase()}
                                            </div>
                                            {/* Display Name usually, fallback to raw ID if debugging needed */}
                                            {employee ? `${employee.firstName} ${employee.lastName}` : (entry.employeeName || empId || 'Nieznany')}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium text-xs">
                                        {(entry.billingType as string) === 'daily' ? (
                                            <span>{entry.hours} dni</span>
                                        ) : (entry.billingType as string) === 'project' ? (
                                            <span className="text-zinc-450 font-bold uppercase text-[9px] tracking-wider bg-zinc-100 px-1.5 py-0.5 rounded-md">Akord</span>
                                        ) : (
                                            <span>{entry.hours} h</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {getStatusBadge(entry.status)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium text-gray-600">
                                        {(entry.cost || 0).toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })}
                                    </td>
                                    <td className="px-4 py-3 text-right flex justify-end gap-2 items-center">
                                        {/* Description Icon Button */}
                                        {entry.description && (
                                            <button
                                                onClick={() => setViewNote(entry.description || '')}
                                                className="p-1 mr-2 text-blue-600 hover:text-blue-800 transition-colors"
                                                title="Zobacz uwagi"
                                            >
                                                <Info className="w-4 h-4" />
                                            </button>
                                        )}

                                        {/* Approve/Reject Actions */}
                                        {(entry.status === 'pending' || entry.status === 'submitted') && (
                                            <>
                                                <button
                                                    onClick={() => batchUpdate([entry.id], { status: 'approved' })}
                                                    className="p-1 px-1.5 text-green-600 hover:bg-green-50 rounded"
                                                    title="Zatwierdź"
                                                >
                                                    <CheckCircle className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => batchUpdate([entry.id], { status: 'rejected' })}
                                                    className="p-1 px-1.5 text-red-600 hover:bg-red-50 rounded"
                                                    title="Odrzuć"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                </button>
                                                <div className="w-px h-4 bg-gray-300 mx-1"></div>
                                            </>
                                        )}

                                        {/* Delete Actions */}
                                        {(true) && (
                                            <>
                                                <button
                                                    className="p-1 px-1.5 text-gray-400 hover:text-red-600"
                                                    title="Usuń"
                                                    onClick={() => {
                                                        if (confirm('Usunąć wpis?')) deleteTimeEntry(entry.id);
                                                    }}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredEntries.length === 0 && (
                            <tr>
                                <td colSpan={8} className="px-4 py-8 text-center text-gray-500 italic">
                                    Brak wpisów spełniających kryteria.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Note View Modal */}
            {viewNote !== null && (
                <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[28px] border border-zinc-100 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-8 py-5 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
                            <h3 className="font-bold text-zinc-950 flex items-center gap-2">
                                <Info className="w-4 h-4 text-[#21808D]" />
                                Uwagi do wpisu
                            </h3>
                            <button onClick={() => setViewNote(null)} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-8 py-6">
                            <p className="text-zinc-700 whitespace-pre-wrap leading-relaxed text-sm">
                                {viewNote}
                            </p>
                        </div>
                        <div className="px-8 py-5 bg-zinc-50 border-t border-zinc-100 flex justify-end">
                            <button
                                onClick={() => setViewNote(null)}
                                className="px-4 py-2 bg-white border border-zinc-200 rounded-xl text-zinc-650 hover:bg-zinc-100 text-sm font-semibold transition-all shadow-sm"
                            >
                                Zamknij
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal - Add Time Entry (Existing) */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[28px] border border-zinc-100 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Modal header */}
                        <div className="px-8 py-5 border-b border-zinc-100 bg-zinc-50 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-zinc-950">Nowy wpis czasu</h3>
                                <p className="text-xs text-zinc-500">Zarejestruj wykonane godziny, dniówkę lub akord</p>
                            </div>
                            <button onClick={() => setIsAddModalOpen(false)} className="text-zinc-400 hover:text-zinc-650 transition-colors">
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="px-8 py-6 space-y-4 max-h-[60vh] overflow-y-auto">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Pracownik</label>
                                <select
                                    className="mt-1 block w-full border rounded-md p-2"
                                    value={newEntry.employeeId}
                                    onChange={e => setNewEntry(prev => ({ ...prev, employeeId: e.target.value }))}
                                >
                                    <option value="">-- Wybierz pracownika --</option>
                                    {employees.map(e => (
                                        <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Zlecenie</label>
                                <select
                                    className="mt-1 block w-full border rounded-md p-2"
                                    value={newEntry.jobId}
                                    onChange={e => setNewEntry(prev => ({ ...prev, jobId: e.target.value, stageId: '' }))} // Reset stage
                                >
                                    <option value="">-- Wybierz zlecenie --</option>
                                    {activeJobs.map(j => (
                                        <option key={j.id} value={j.id}>{j.jobCode} - {j.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Etap</label>
                                <select
                                    className="mt-1 block w-full border rounded-md p-2 disabled:bg-gray-100 disabled:text-gray-400"
                                    value={newEntry.stageId}
                                    onChange={e => setNewEntry(prev => ({ ...prev, stageId: e.target.value }))}
                                    disabled={!newEntry.jobId}
                                >
                                    <option value="">-- Wybierz etap --</option>
                                    {availableStages.map(s => (
                                        <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Model rozliczenia</label>
                                <select
                                    className="mt-1 block w-full border rounded-md p-2"
                                    value={newEntry.billingType}
                                    onChange={e => {
                                        const type = e.target.value as any;
                                        setNewEntry(prev => ({ 
                                            ...prev, 
                                            billingType: type,
                                            hours: type === 'project' ? 0 : (type === 'daily' ? 1 : 8)
                                        }));
                                    }}
                                >
                                    <option value="hourly">Godzinowe (PLN/h)</option>
                                    <option value="daily">Dniówka (PLN/dzień)</option>
                                    <option value="project">Zlecenie / Ryczałt (PLN)</option>
                                </select>
                            </div>

                            {(() => {
                                const selectedEmployee = employees.find(e => e.id === newEntry.employeeId);
                                const defaultRate = selectedEmployee
                                    ? (newEntry.billingType === 'hourly'
                                        ? (selectedEmployee.hourlyRate || 0)
                                        : newEntry.billingType === 'daily'
                                            ? (selectedEmployee.dailyRate || 0)
                                            : (selectedEmployee.projectRate || 0))
                                    : 0;

                                return (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Stawka (PLN) [Opcjonalnie]</label>
                                            <input
                                                type="number"
                                                placeholder={`Domyślnie: ${defaultRate} PLN`}
                                                className="mt-1 block w-full border rounded-md p-2"
                                                value={newEntry.customRate !== undefined ? newEntry.customRate : ''}
                                                onChange={e => setNewEntry(prev => ({ 
                                                    ...prev, 
                                                    customRate: e.target.value === '' ? undefined : Number(e.target.value) 
                                                }))}
                                            />
                                        </div>
                                        <div>
                                            {newEntry.billingType !== 'project' ? (
                                                <>
                                                    <label className="block text-sm font-medium text-gray-700">
                                                        {newEntry.billingType === 'daily' ? 'Liczba dni' : 'Godziny'}
                                                    </label>
                                                    <input
                                                        type="number"
                                                        step={newEntry.billingType === 'daily' ? '1' : '0.5'}
                                                        min="0"
                                                        className="mt-1 block w-full border rounded-md p-2"
                                                        value={newEntry.hours}
                                                        onChange={e => setNewEntry(prev => ({ ...prev, hours: Number(e.target.value) }))}
                                                    />
                                                </>
                                            ) : (
                                                <>
                                                    <label className="block text-sm font-medium text-zinc-400">Wymiar czasu</label>
                                                    <div className="mt-1 p-2 bg-zinc-50 border rounded-md text-zinc-400 text-sm text-center">
                                                        Brak (Ryczałt)
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Data</label>
                                <input
                                    type="date"
                                    className="mt-1 block w-full border rounded-md p-2"
                                    value={newEntry.date}
                                    onChange={e => setNewEntry(prev => ({ ...prev, date: e.target.value }))}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Opis (opcjonalnie)</label>
                                <input
                                    type="text"
                                    className="mt-1 block w-full border rounded-md p-2"
                                    value={newEntry.description}
                                    onChange={e => setNewEntry(prev => ({ ...prev, description: e.target.value }))}
                                />
                            </div>

                        </div>

                        <div className="flex justify-end gap-3 px-8 py-5 border-t border-zinc-100 bg-zinc-50">
                            <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border border-zinc-200 text-zinc-650 hover:bg-zinc-100 rounded-xl text-sm font-semibold transition-all">Anuluj</button>
                            <button
                                onClick={handleAddSubmit}
                                disabled={isSubmitting} // Shield #4: prevent double-click
                                className="px-5 py-2 bg-zinc-950 text-white rounded-xl text-sm hover:bg-zinc-850 font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? 'Zapisywanie...' : 'Zapisz'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
