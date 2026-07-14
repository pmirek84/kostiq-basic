import { useState, useEffect, useCallback } from 'react';
import {
    Filter, Plus, MessageSquare, AlertTriangle,
    CheckCircle2, Hammer, Flag, Search, Smartphone, Pencil, Save,
    FileDown, RotateCcw, CheckSquare, Square, Clock, ChevronDown,
    Archive, BookOpen, XCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { JobLogEntry, Job, Employee } from '../models/types';
import { useJobLog } from '../context/JobLogContext';
import { useTiCo } from '../context/TiCoContext';
import { useJobs } from '../context/JobsContext';
import { JobLogEntryModal } from '../components/jobs/diary/JobLogEntryModal';
import { Modal as UIModal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { generateConstructionReport } from '../services/reports/ConstructionReportPDF';
import { toast } from 'sonner';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

interface SiteLogEntry {
    id: string;
    jobId: string;
    date: string;
    type: string;
    description: string;
    weather?: string;
    workersPresent?: number;
    authorId: string;
    photo?: string;
    status?: 'new' | 'read' | 'converted';
    isApprovedForReport?: boolean;
}

// ──────────────────────────────────────────
// PDF Report Modal
// ──────────────────────────────────────────
interface ReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (opts: { dateFrom: string; dateTo: string; onlyApproved: boolean }) => void;
    approvedCount: number;
    totalCount: number;
}

function ReportModal({ isOpen, onClose, onGenerate, approvedCount, totalCount }: ReportModalProps) {
    const today = format(new Date(), 'yyyy-MM-dd');
    const monthAgo = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
    const [dateFrom, setDateFrom] = useState(monthAgo);
    const [dateTo, setDateTo] = useState(today);
    const [onlyApproved, setOnlyApproved] = useState(false);

    return (
        <UIModal isOpen={isOpen} onClose={onClose} title="Generuj Raport PDF">
            <div className="space-y-5">
                <div className="bg-teal-50 border border-teal-100 rounded-lg p-3 text-sm text-teal-800">
                    Raport zostanie pobrany <strong>i zapisany na serwerze</strong> w archiwum zlecenia (zakładka "Archiwum PDF").
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Data od</label>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Data do</label>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500" />
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Zawartość raportu</label>
                    <div className="space-y-2">
                        <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50"
                            style={{ borderColor: !onlyApproved ? '#21808D' : '#e5e7eb', background: !onlyApproved ? '#f0fafb' : '' }}>
                            <input type="radio" checked={!onlyApproved} onChange={() => setOnlyApproved(false)} className="text-teal-600" />
                            <div>
                                <div className="text-sm font-medium">Wszystkie wpisy <span className="text-gray-400 font-normal">({totalCount})</span></div>
                                <div className="text-xs text-gray-500">Wpisy wewnętrzne i z APP</div>
                            </div>
                        </label>
                        <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50"
                            style={{ borderColor: onlyApproved ? '#21808D' : '#e5e7eb', background: onlyApproved ? '#f0fafb' : '' }}>
                            <input type="radio" checked={onlyApproved} onChange={() => setOnlyApproved(true)} className="text-teal-600" />
                            <div>
                                <div className="text-sm font-medium">Tylko zatwierdzone ✓ <span className="text-green-600 font-normal">({approvedCount})</span></div>
                                <div className="text-xs text-gray-500">Oznaczone "Dołącz do raportu PDF"</div>
                            </div>
                        </label>
                    </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                    <Button variant="secondary" onClick={onClose}>Anuluj</Button>
                    <Button onClick={() => { onGenerate({ dateFrom, dateTo, onlyApproved }); onClose(); }}>
                        <FileDown className="w-4 h-4 mr-2" />
                        Generuj i Archiwizuj PDF
                    </Button>
                </div>
            </div>
        </UIModal>
    );
}

// ──────────────────────────────────────────
// Entry type helpers
// ──────────────────────────────────────────
const TYPE_ICON: Record<string, any> = {
    work_day: Hammer,
    note: MessageSquare,
    issue: AlertTriangle,
    milestone: Flag,
    extra_work: CheckCircle2,
    site_log: Smartphone,
};

const TYPE_COLOR: Record<string, string> = {
    work_day: 'text-blue-500 bg-blue-50',
    note: 'text-gray-500 bg-gray-50',
    issue: 'text-red-500 bg-red-50',
    milestone: 'text-green-600 bg-green-50',
    extra_work: 'text-purple-500 bg-purple-50',
    site_log: 'text-orange-500 bg-orange-50',
};

// ──────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────
export default function GlobalDiaryPage() {
    const { getEntriesByJob, updateEntry } = useJobLog();
    const { employees } = useTiCo();
    const { jobs } = useJobs();

    // Resolve author UUID → name
    const resolveAuthor = useCallback((authorId: string): string => {
        if (!authorId) return 'Nieznany autor';
        const emp = employees.find((e: Employee) =>
            e.id === authorId || `${e.firstName} ${e.lastName}` === authorId
        );
        if (emp) return `${emp.firstName} ${emp.lastName}`;
        if (/^[0-9a-f-]{20,}$/i.test(authorId)) return 'Pracownik APP';
        return authorId;
    }, [employees]);

    // Filters
    const [selectedJobId, setSelectedJobId] = useState<string>('all');
    const [filterType, setFilterType] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [showOnlyApproved, setShowOnlyApproved] = useState(false);

    // PWA Logs
    const [pwaLogs, setPwaLogs] = useState<SiteLogEntry[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Modals
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [isInternalModalOpen, setIsInternalModalOpen] = useState(false);
    const [selectedInternalEntry, setSelectedInternalEntry] = useState<JobLogEntry | undefined>();
    const [editingPwaLog, setEditingPwaLog] = useState<SiteLogEntry | null>(null);
    const [pwaEditDescription, setPwaEditDescription] = useState('');
    const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
    const [previewEntry, setPreviewEntry] = useState<any | null>(null);

    // Generating state
    const [isGenerating, setIsGenerating] = useState(false);

    // Fetch ALL PWA logs (no jobId filter — global view)
    const fetchPwaLogs = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const token = localStorage.getItem('kostiq_token');
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const query = selectedJobId !== 'all' ? `?jobId=${selectedJobId}` : '';
            const res = await fetch(`${API_BASE}/site-logs${query}`, { headers });
            if (res.ok) {
                const data = await res.json();
                setPwaLogs(Array.isArray(data) ? data : (data.data ?? []));
            }
        } finally {
            setIsRefreshing(false);
        }
    }, [selectedJobId]);

    useEffect(() => {
        fetchPwaLogs();
        const interval = setInterval(fetchPwaLogs, 30_000);
        return () => clearInterval(interval);
    }, [fetchPwaLogs]);

    // Collect internal entries
    const internalEntries = getEntriesByJob(
        selectedJobId === 'all' ? '' : selectedJobId
    );

    // Selected job object (for PDF)
    const selectedJob: Job | undefined = selectedJobId !== 'all'
        ? jobs.find(j => j.id === selectedJobId)
        : undefined;

    // Merge + filter
    const allEntries = [
        ...internalEntries.map(e => ({ ...e, source: 'internal' as const, originalObject: e })),
        ...pwaLogs.map(l => ({
            id: String(l.id),
            jobId: l.jobId,
            date: l.date,
            type: 'site_log' as any,
            title: `Raport z budowy (${l.type})`,
            text: l.description,
            visibleToClient: true,
            photos: l.photo ? [l.photo] : [],
            authorId: l.authorId,
            details: { weather: l.weather, workers: l.workersPresent },
            source: 'pwa' as const,
            isApprovedForReport: l.isApprovedForReport ?? false,
            originalObject: l
        }))
    ].filter(e => {
        if (filterType !== 'all' && e.type !== filterType) return false;
        if (showOnlyApproved && !(e as any).isApprovedForReport) return false;
        if (searchTerm && !(e.text || '').toLowerCase().includes(searchTerm.toLowerCase()) &&
            !(e.title || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
        return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const approvedCount = allEntries.filter(e => (e as any).isApprovedForReport).length;

    // Toggle approved for PWA log
    const handleToggleApproved = async (entry: SiteLogEntry) => {
        const newVal = !entry.isApprovedForReport;
        setPwaLogs(prev => prev.map(l => l.id === entry.id ? { ...l, isApprovedForReport: newVal } : l));
        try {
            const token = localStorage.getItem('kostiq_token');
            await fetch(`${API_BASE}/site-logs/${entry.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ isApprovedForReport: newVal })
            });
        } catch { fetchPwaLogs(); }
    };

    // Toggle approved for internal log
    const handleToggleInternalApproved = async (entry: any) => {
        await updateEntry(entry.id, { isApprovedForReport: !entry.isApprovedForReport } as any);
    };

    // Generate PDF → download + archive on server
    const handleGenerateReport = async (opts: { dateFrom: string; dateTo: string; onlyApproved: boolean }) => {
        if (!selectedJob) {
            toast.error('Wybierz konkretne zlecenie przed generowaniem raportu.');
            return;
        }
        setIsGenerating(true);
        try {
            const filtered = allEntries.filter(e => {
                const d = e.date?.substring(0, 10);
                if (opts.dateFrom && d < opts.dateFrom) return false;
                if (opts.dateTo && d > opts.dateTo) return false;
                if (opts.onlyApproved && !(e as any).isApprovedForReport) return false;
                return true;
            });
            const record = await generateConstructionReport(selectedJob, filtered, {
                ...opts,
                resolveAuthor,
                saveToServer: true,
                entryCount: filtered.length
            });
            if (record) {
                toast.success(`Raport zapisany w archiwum! (${record.title})`, { duration: 5000 });
            } else {
                toast.success('Raport PDF pobrany.');
            }
        } catch (err) {
            console.error(err);
            toast.error('Błąd podczas generowania raportu PDF.');
        } finally {
            setIsGenerating(false);
        }
    };

    // Edit handlers
    const handleEdit = (entry: any) => {
        if (entry.source === 'pwa') {
            setEditingPwaLog(entry.originalObject);
            setPwaEditDescription(entry.text);
        } else {
            setSelectedInternalEntry(entry);
            setIsInternalModalOpen(true);
        }
    };

    const handleSavePwaEdit = async () => {
        if (!editingPwaLog) return;
        setPwaLogs(prev => prev.map(l => l.id === editingPwaLog.id ? { ...l, description: pwaEditDescription } : l));
        try {
            const token = localStorage.getItem('kostiq_token');
            await fetch(`${API_BASE}/site-logs/${editingPwaLog.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ description: pwaEditDescription })
            });
            toast.success('Wpis zaktualizowany.');
        } catch { toast.error('Błąd zapisu.'); }
        setEditingPwaLog(null);
    };

    // Job label helper
    const getJobLabel = (jobId: string) => {
        const j = jobs.find(j => j.id === jobId);
        return j ? `${j.jobCode} — ${j.name}` : jobId;
    };

    return (
        <div className="space-y-6">
            {/* ─── Page Header ─── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <BookOpen className="w-6 h-6 text-rose-600" />
                        Globalny Dziennik Budowy
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Wszystkie wpisy z budowy — od pracowników oraz biurowe. Zatwierdź wybrane, generuj PDF.
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={fetchPwaLogs} disabled={isRefreshing}
                        className="flex items-center gap-1.5 bg-orange-50 text-orange-700 border border-orange-200 px-3 py-2 rounded-lg hover:bg-orange-100 text-sm disabled:opacity-60">
                        <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                        Z terenu ({pwaLogs.length})
                    </button>
                    <button onClick={() => { setSelectedInternalEntry(undefined); setIsInternalModalOpen(true); }}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
                        <Plus className="w-4 h-4" />
                        Nowy wpis
                    </button>
                    <button onClick={() => setIsReportModalOpen(true)}
                        disabled={isGenerating || !selectedJob}
                        className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 text-sm disabled:opacity-50"
                        title={!selectedJob ? 'Wybierz zlecenie, by generować raport' : ''}>
                        {isGenerating
                            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generuję...</>
                            : <><FileDown className="w-4 h-4" /> Raport PDF {approvedCount > 0 && <span className="bg-green-300 text-green-900 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{approvedCount} ✓</span>}</>
                        }
                    </button>
                </div>
            </div>

            {/* ─── Filter Bar ─── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-3">
                {/* Job selector */}
                <div className="relative flex-1 min-w-[220px]">
                    <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <select
                        value={selectedJobId}
                        onChange={e => setSelectedJobId(e.target.value)}
                        className="w-full appearance-none pl-10 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 bg-white">
                        <option value="all">📁 Wszystkie zlecenia</option>
                        {jobs.filter(j => j.status !== 'cancelled').map(j => (
                            <option key={j.id} value={j.id}>{j.jobCode} — {j.name}</option>
                        ))}
                    </select>
                    <BookOpen className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>

                {/* Type filter */}
                <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-gray-50">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select value={filterType} onChange={e => setFilterType(e.target.value)}
                        className="bg-transparent text-sm focus:ring-0 border-none">
                        <option value="all">Wszystkie typy</option>
                        <option value="work_day">Dzień pracy</option>
                        <option value="note">Notatka</option>
                        <option value="issue">Problem</option>
                        <option value="extra_work">Prace dodatkowe</option>
                        <option value="milestone">Kamień milowy</option>
                        <option value="site_log">od pracowników</option>
                    </select>
                </div>

                {/* Approved filter toggle */}
                <button
                    onClick={() => setShowOnlyApproved(v => !v)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${showOnlyApproved ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}>
                    <CheckSquare className="w-4 h-4" />
                    {showOnlyApproved ? 'Zatwierdzone ✓' : 'Tylko zatwierdzone'}
                </button>

                {/* Search */}
                <div className="relative flex-1 min-w-[160px]">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="Szukaj..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-teal-500" />
                </div>
            </div>

            {/* ─── Approved banner ─── */}
            {approvedCount > 0 && selectedJob && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-4 py-2 text-sm text-green-800">
                    <CheckSquare className="w-4 h-4 text-green-600" />
                    <span><strong>{approvedCount}</strong> {approvedCount === 1 ? 'wpis zatwierdzony' : 'wpisy zatwierdzone'} do raportu PDF</span>
                    <button onClick={() => setIsReportModalOpen(true)}
                        className="ml-auto text-green-700 underline text-xs hover:text-green-900">
                        Generuj PDF →
                    </button>
                </div>
            )}

            {!selectedJob && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2 text-sm text-amber-800">
                    <Archive className="w-4 h-4 text-amber-600" />
                    Wybierz konkretne zlecenie z listy powyżej, aby wygenerować i zarchiwizować raport PDF.
                </div>
            )}

            {/* ─── Stats row ─── */}
            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: 'Wszystkich wpisów', value: allEntries.length, color: 'text-gray-700' },
                    { label: 'Z terenu (Pracownicy)', value: pwaLogs.filter(l => selectedJobId === 'all' || l.jobId === selectedJobId).length, color: 'text-orange-600' },
                    { label: 'Zatwierdzonych ✓', value: approvedCount, color: 'text-green-600' },
                ].map(stat => (
                    <div key={stat.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                        <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                        <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* ─── Entry List ─── */}
            <div className="space-y-3">
                {allEntries.length === 0 ? (
                    <div className="text-center py-16 text-gray-400 bg-gray-50 rounded-xl border border-dashed">
                        <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                        <p className="text-sm">Brak wpisów dla wybranych filtrów.</p>
                    </div>
                ) : allEntries.map(entry => {
                    const isApproved = (entry as any).isApprovedForReport;
                    const IconComp = TYPE_ICON[entry.type] ?? MessageSquare;
                    const iconCls = TYPE_COLOR[entry.type] ?? 'text-gray-500 bg-gray-50';

                    return (
                        <div key={`${entry.source}-${entry.id}`}
                            className={`group bg-white rounded-xl border shadow-sm hover:shadow-md transition-all relative overflow-hidden ${isApproved ? 'border-green-200 ring-1 ring-green-100' : 'border-gray-200'}`}>
                            {/* Source stripe */}
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${entry.source === 'pwa' ? 'bg-orange-400' : 'bg-blue-400'}`} />

                            <div className="flex gap-4 p-4 pl-5">
                                {/* Date */}
                                <div className="w-20 flex-shrink-0">
                                    <div className="bg-gray-50 rounded-lg border border-gray-100 px-2 py-2 text-center">
                                        <div className="text-xs text-gray-400">{format(new Date(entry.date), 'MMM', { locale: pl }).toUpperCase()}</div>
                                        <div className="text-2xl font-bold text-gray-900 leading-none">{format(new Date(entry.date), 'dd')}</div>
                                        <div className="text-[10px] text-gray-400">{format(new Date(entry.date), 'yyyy')}</div>
                                    </div>
                                    {entry.source === 'pwa' && (
                                        <div className="mt-1.5 text-center">
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800">
                                                <Smartphone className="w-2.5 h-2.5 mr-0.5" />Z terenu
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleEdit(entry)}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className={`p-1.5 rounded-lg ${iconCls}`}>
                                            <IconComp className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-gray-900">{entry.title}</h4>
                                            <div className="flex gap-2 text-xs text-gray-400 mt-0.5">
                                                <Clock className="w-3 h-3 mt-0.5" />
                                                <span>{format(new Date(entry.date), 'HH:mm')}</span>
                                                <span>·</span>
                                                <span>{resolveAuthor(entry.authorId)}</span>
                                                {selectedJobId === 'all' && (
                                                    <>
                                                        <span>·</span>
                                                        <span className="font-medium text-teal-600">{getJobLabel(entry.jobId)}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-3">{entry.text}</p>

                                    {/* PWA meta */}
                                    {entry.source === 'pwa' && (entry.details?.weather || entry.details?.workers) && (
                                        <div className="flex gap-3 text-xs mt-2 bg-gray-50 p-1.5 rounded border border-gray-100 w-fit">
                                            {entry.details.weather && <span>⛅ {entry.details.weather}</span>}
                                            {entry.details.workers && <span className="border-l pl-2 border-gray-200">👷 {entry.details.workers} os.</span>}
                                        </div>
                                    )}

                                    {/* Photos strip */}
                                    {entry.photos?.length > 0 && (
                                        <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                                            {entry.photos.slice(0, 5).map((p: string, i: number) => (
                                                <div key={i} className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0 cursor-zoom-in"
                                                    onClick={e => { e.stopPropagation(); setPreviewPhoto(p); }}>
                                                    <img
                                                        src={p.startsWith('data:image') || p.startsWith('http') ? p : `${API_BASE.replace('/api', '')}${p}`}
                                                        className="w-full h-full object-cover" alt="" />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Actions column */}
                                <div className="flex flex-col items-end gap-2 w-28 flex-shrink-0">
                                    {/* Approve toggle */}
                                    <button
                                        onClick={() => {
                                            if (entry.source === 'pwa') handleToggleApproved((entry as any).originalObject);
                                            else handleToggleInternalApproved(entry);
                                        }}
                                        className={`flex items-center gap-1 text-xs font-medium px-2 py-1.5 rounded-lg border transition-all w-full justify-center ${isApproved
                                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                                            }`}
                                        title={isApproved ? 'Kliknij by cofnąć zatwierdzenie' : 'Dołącz do raportu PDF'}>
                                        {isApproved ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                                        {isApproved ? 'Zatwierdzone' : 'Do raportu'}
                                    </button>

                                    {/* Preview button */}
                                    <button onClick={() => setPreviewEntry(entry)}
                                        className="flex items-center gap-1.5 text-xs text-zinc-600 hover:bg-zinc-50 px-2 py-1.5 rounded-lg border border-transparent hover:border-zinc-100 w-full justify-center">
                                        <Search className="w-3.5 h-3.5 text-zinc-400" />
                                        Podgląd
                                    </button>

                                    {/* Edit button */}
                                    <button onClick={() => handleEdit(entry)}
                                        className="flex items-center gap-1 text-xs text-blue-600 hover:bg-blue-50 px-2 py-1.5 rounded-lg border border-transparent hover:border-blue-100 w-full justify-center">
                                        <Pencil className="w-3 h-3" />
                                        Edytuj
                                    </button>

                                    {/* Source badge */}
                                    <span className={`text-[9px] font-bold uppercase self-center px-1.5 py-0.5 rounded ${entry.source === 'pwa' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                                        {entry.source === 'pwa' ? 'Teren' : 'Web'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Internal Entry Modal */}
            {isInternalModalOpen && (
                <JobLogEntryModal isOpen={isInternalModalOpen}
                    onClose={() => setIsInternalModalOpen(false)}
                    jobId={selectedJobId !== 'all' ? selectedJobId : (jobs[0]?.id ?? '')}
                    entryToEdit={selectedInternalEntry}
                    job={selectedJob ?? jobs[0]}
                />
            )}

            <UIModal isOpen={!!editingPwaLog} onClose={() => setEditingPwaLog(null)} title="Edycja raportu z terenu">
                <div className="space-y-4">
                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 text-sm text-orange-800">
                        Edytujesz treść raportu przesłanego przez pracownika.
                    </div>
                    <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[150px] text-sm"
                        value={pwaEditDescription} onChange={e => setPwaEditDescription(e.target.value)} />
                    <div className="flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => setEditingPwaLog(null)}>Anuluj</Button>
                        <Button onClick={handleSavePwaEdit}><Save className="w-4 h-4 mr-2" />Zapisz</Button>
                    </div>
                </div>
            </UIModal>

            {/* Report Modal */}
            <ReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)}
                onGenerate={handleGenerateReport}
                approvedCount={approvedCount}
                totalCount={allEntries.length} />

            {/* Lightbox */}
            {previewPhoto && (
                <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
                    onClick={() => setPreviewPhoto(null)}>
                    <img src={previewPhoto.startsWith('data:image') || previewPhoto.startsWith('http') ? previewPhoto : `${API_BASE.replace('/api', '')}${previewPhoto}`}
                        className="max-w-full max-h-full rounded shadow-2xl object-contain" alt="" />
                    <button className="absolute top-6 right-6 text-white bg-white/10 p-2 rounded-full hover:bg-white/20"
                        onClick={e => { e.stopPropagation(); setPreviewPhoto(null); }}>
                        <XCircle size={32} />
                    </button>
                </div>
            )}

            {/* Entry Preview Modal */}
            <UIModal isOpen={!!previewEntry} onClose={() => setPreviewEntry(null)} title="Podgląd wpisu w dzienniku">
                {previewEntry && (
                    <div className="space-y-4 text-sm">
                        <div className="flex justify-between items-center bg-gray-50 p-3.5 rounded-2xl border border-gray-100">
                            <div>
                                <span className="text-[10px] text-gray-400 block uppercase font-bold">Autor</span>
                                <span className="font-bold text-gray-800">{resolveAuthor(previewEntry.authorId)}</span>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] text-gray-400 block uppercase font-bold">Data i godzina</span>
                                <span className="font-bold text-gray-800">{format(new Date(previewEntry.date), 'dd.MM.yyyy HH:mm')}</span>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <span className="text-[10px] text-gray-400 block uppercase font-bold">Zlecenie</span>
                            <span className="font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-xl border border-teal-150/30 inline-block text-xs">
                                {getJobLabel(previewEntry.jobId)}
                            </span>
                        </div>

                        {previewEntry.title && (
                            <div className="space-y-1">
                                <span className="text-[10px] text-gray-400 block uppercase font-bold">Tytuł</span>
                                <h4 className="text-base font-bold text-gray-900">{previewEntry.title}</h4>
                            </div>
                        )}

                        <div className="space-y-1">
                            <span className="text-[10px] text-gray-400 block uppercase font-bold">Treść wpisu</span>
                            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200/50 text-gray-700 whitespace-pre-wrap leading-relaxed max-h-[250px] overflow-y-auto text-sm">
                                {previewEntry.text}
                            </div>
                        </div>

                        {/* Metadata (weather/workers) */}
                        {previewEntry.source === 'pwa' && (previewEntry.details?.weather || previewEntry.details?.workers) && (
                            <div className="flex gap-4 p-3 bg-orange-50/50 rounded-2xl border border-orange-100/50 text-xs">
                                {previewEntry.details.weather && (
                                    <div>
                                        <span className="text-gray-400 block mb-0.5 font-bold uppercase text-[9px]">Pogoda</span>
                                        <span className="font-semibold text-orange-900">⛅ {previewEntry.details.weather}</span>
                                    </div>
                                )}
                                {previewEntry.details.workers && (
                                    <div className="border-l pl-4 border-orange-200/50">
                                        <span className="text-gray-400 block mb-0.5 font-bold uppercase text-[9px]">Liczba osób</span>
                                        <span className="font-semibold text-orange-900">👷 {previewEntry.details.workers} os.</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Extra Costs */}
                        {previewEntry.extraCosts && previewEntry.extraCosts.length > 0 && (
                            <div className="space-y-2">
                                <span className="text-[10px] text-gray-400 block uppercase font-bold">Dodatkowe koszty</span>
                                <div className="border border-gray-150 rounded-2xl overflow-hidden">
                                    <table className="min-w-full divide-y divide-gray-150">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Opis kosztu</th>
                                                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Kwota</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-150 text-xs">
                                            {previewEntry.extraCosts.map((cost: any) => (
                                                <tr key={cost.id}>
                                                    <td className="px-4 py-2 text-gray-600">{cost.description}</td>
                                                    <td className="px-4 py-2 text-right font-semibold text-gray-900">{cost.amount.toFixed(2)} {cost.currency}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Photos */}
                        {previewEntry.photos && previewEntry.photos.length > 0 && (
                            <div className="space-y-1.5">
                                <span className="text-[10px] text-gray-400 block uppercase font-bold">Załączone zdjęcia</span>
                                <div className="flex flex-wrap gap-2">
                                    {previewEntry.photos.map((photo: string, i: number) => (
                                        <div key={i} className="w-20 h-20 rounded-xl overflow-hidden border border-gray-250 cursor-zoom-in shadow-sm bg-gray-100"
                                            onClick={() => setPreviewPhoto(photo)}>
                                            <img
                                                src={photo.startsWith('data:image') || photo.startsWith('http') ? photo : `${API_BASE.replace('/api', '')}${photo}`}
                                                className="w-full h-full object-cover" alt=""
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end pt-2">
                            <Button variant="secondary" onClick={() => setPreviewEntry(null)}>Zamknij podgląd</Button>
                        </div>
                    </div>
                )}
            </UIModal>
        </div>
    );
}
