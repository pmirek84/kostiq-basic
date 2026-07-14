import { useState, useEffect, useCallback } from 'react';
import {
    Filter,
    Plus,
    Eye,
    EyeOff,
    MessageSquare,
    AlertTriangle,
    CheckCircle2,
    Hammer,
    Flag,
    Search,
    Smartphone,
    Pencil,
    Save,
    FileDown,
    RotateCcw,
    CheckSquare,
    Square,
    Clock,
    Upload
} from 'lucide-react';
import { toast } from 'sonner';
import type { JobLogEntry, JobLogEntryType, Job, Employee } from '../../../models/types';
import { useJobLog } from '../../../context/JobLogContext';
import { useTiCo } from '../../../context/TiCoContext';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { JobLogEntryModal } from './JobLogEntryModal';
import { Modal as UIModal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { XCircle } from 'lucide-react';
import { generateConstructionReport } from '../../../services/reports/ConstructionReportPDF';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

interface JobDiaryTabProps {
    job: Job;
}

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

// =====================
// PDF Report Modal
// =====================
interface ReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (opts: { dateFrom: string; dateTo: string; onlyApproved: boolean }) => void;
}

function ReportModal({ isOpen, onClose, onGenerate }: ReportModalProps) {
    const today = format(new Date(), 'yyyy-MM-dd');
    const monthAgo = format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
    const [dateFrom, setDateFrom] = useState(monthAgo);
    const [dateTo, setDateTo] = useState(today);
    const [onlyApproved, setOnlyApproved] = useState(false);

    return (
        <UIModal isOpen={isOpen} onClose={onClose} title="Generuj Raport PDF">
            <div className="space-y-5">
                <div className="bg-teal-50 border border-teal-100 rounded-lg p-3 text-sm text-teal-800">
                    Wybierz zakres dat i filtr wpisów do raportu. Tylko zatwierdzone wpisy mają zielony znacznik ✓.
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Data od</label>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Data do</label>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Zawartość raportu</label>
                    <div className="space-y-2">
                        <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-gray-50"
                            style={{ borderColor: !onlyApproved ? '#21808D' : '#e5e7eb', background: !onlyApproved ? '#f0fafb' : '' }}>
                            <input type="radio" checked={!onlyApproved} onChange={() => setOnlyApproved(false)} className="text-teal-600" />
                            <div>
                                <div className="text-sm font-medium text-gray-900">Wszystkie wpisy</div>
                                <div className="text-xs text-gray-500">Wpisy wewnętrzne oraz od pracowników (z terenu)</div>
                            </div>
                        </label>
                        <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-gray-50"
                            style={{ borderColor: onlyApproved ? '#21808D' : '#e5e7eb', background: onlyApproved ? '#f0fafb' : '' }}>
                            <input type="radio" checked={onlyApproved} onChange={() => setOnlyApproved(true)} className="text-teal-600" />
                            <div>
                                <div className="text-sm font-medium text-gray-900">Tylko zatwierdzone do raportu <span className="text-green-600">✓</span></div>
                                <div className="text-xs text-gray-500">Tylko wpisy oznaczone "Dołącz do raportu PDF"</div>
                            </div>
                        </label>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Button variant="secondary" onClick={onClose}>Anuluj</Button>
                    <Button onClick={() => { onGenerate({ dateFrom, dateTo, onlyApproved }); onClose(); }}>
                        <FileDown className="w-4 h-4 mr-2" />
                        Generuj PDF
                    </Button>
                </div>
            </div>
        </UIModal>
    );
}

// =====================
// Main Component
// =====================
export const JobDiaryTab = ({ job }: JobDiaryTabProps) => {
    const { getEntriesByJob, updateEntry, addEntry } = useJobLog();
    const { employees } = useTiCo();

    // Resolve authorId → full name
    const resolveAuthor = useCallback((authorId: string): string => {
        if (!authorId) return 'Nieznany autor';
        const emp = employees.find(
            (e: Employee) => e.id === authorId || `${e.firstName} ${e.lastName}` === authorId
        );
        if (emp) return `${emp.firstName} ${emp.lastName}`;
        // If it looks like a UUID, hide it
        if (/^[0-9a-f-]{20,}$/i.test(authorId)) return 'Pracownik APP';
        return authorId;
    }, [employees]);

    // Internal Log State
    const [isInternalModalOpen, setIsInternalModalOpen] = useState(false);
    const [selectedInternalEntry, setSelectedInternalEntry] = useState<JobLogEntry | undefined>(undefined);
    const [internalLogInitialData, setInternalLogInitialData] = useState<Partial<JobLogEntry> | undefined>(undefined);

    // PWA Log State
    const [pwaLogs, setPwaLogs] = useState<SiteLogEntry[]>([]);
    const [editingPwaLog, setEditingPwaLog] = useState<SiteLogEntry | null>(null);
    const [pwaEditDescription, setPwaEditDescription] = useState('');
    const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
    const [previewEntry, setPreviewEntry] = useState<any | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Report Modal
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);

    // Quick Office Entry Form State
    const [quickDate, setQuickDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [quickType, setQuickType] = useState<JobLogEntryType>('work_day');
    const [quickTitle, setQuickTitle] = useState('');
    const [quickText, setQuickText] = useState('');
    const [quickWeather, setQuickWeather] = useState('');
    const [quickWorkers, setQuickWorkers] = useState<number | ''>('');
    const [quickPhotos, setQuickPhotos] = useState<string[]>([]);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [isSubmittingQuick, setIsSubmittingQuick] = useState(false);
    const [isQuickDragActive, setIsQuickDragActive] = useState(false);

    // Fetch PWA Logs with auth + auto-refresh every 30s
    const fetchPwaLogs = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
            const token = localStorage.getItem('kostiq_token');
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`${baseUrl}/site-logs?jobId=${job.id}`, { headers });
            if (res.ok) {
                const data = await res.json();
                setPwaLogs(Array.isArray(data) ? data : (data.data ?? []));
            } else {
                console.warn('[JobDiaryTab] site-logs fetch failed:', res.status);
            }
        } catch (error) {
            console.error('Failed to fetch site logs', error);
        } finally {
            setIsRefreshing(false);
        }
    }, [job.id]);

    useEffect(() => {
        fetchPwaLogs();
        const interval = setInterval(fetchPwaLogs, 30_000);
        return () => clearInterval(interval);
    }, [fetchPwaLogs]);

    // Filters
    const [filterType, setFilterType] = useState<JobLogEntryType | 'all'>('all');
    const [filterVisible, setFilterVisible] = useState<boolean | 'all'>('all');
    const [searchTerm, setSearchTerm] = useState('');

    const internalEntries = getEntriesByJob(job.id, {
        type: filterType === 'all' ? undefined : filterType,
        visibleToClient: filterVisible === 'all' ? undefined : filterVisible,
    });

    // Merge and Sort
    const allEntries = [
        ...internalEntries.map(e => ({ ...e, source: 'internal' as const })),
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
        if (filterType !== 'all' && e.type !== filterType && (filterType as any) !== 'site_log') return false;
        return (e.text || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (e.title || '').toLowerCase().includes(searchTerm.toLowerCase());
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Toggle "Approved for Report" on a PWA log
    const handleToggleApproved = async (e: React.MouseEvent, entry: SiteLogEntry) => {
        e.stopPropagation();
        const newVal = !entry.isApprovedForReport;
        // Optimistic UI
        setPwaLogs(prev => prev.map(l => l.id === entry.id ? { ...l, isApprovedForReport: newVal } : l));
        try {
            const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
            const token = localStorage.getItem('kostiq_token');
            await fetch(`${baseUrl}/site-logs/${entry.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ isApprovedForReport: newVal })
            });
        } catch (e) {
            console.error('Failed to toggle approval', e);
            fetchPwaLogs(); // revert on error
        }
    };

    // Toggle "Approved for Report" on an internal log
    const handleToggleInternalApproved = async (e: React.MouseEvent, entry: any) => {
        e.stopPropagation();
        await updateEntry(entry.id, { isApprovedForReport: !entry.isApprovedForReport } as any);
    };

    // Handlers
    const handleEdit = (entry: any) => {
        if (entry.source === 'pwa') {
            setEditingPwaLog(entry.originalObject);
            setPwaEditDescription(entry.text);
        } else {
            setSelectedInternalEntry(entry);
            setInternalLogInitialData(undefined);
            setIsInternalModalOpen(true);
        }
    };

    const handleMarkAsRead = async (entry: SiteLogEntry) => {
        const updatedLogs = pwaLogs.map(l => l.id === entry.id ? { ...l, status: 'read' as const } : l);
        setPwaLogs(updatedLogs);
        try {
            const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
            const token = localStorage.getItem('kostiq_token');
            await fetch(`${baseUrl}/site-logs/${entry.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ status: 'read' })
            });
        } catch (e) {
            console.error('Failed to mark as read', e);
            fetchPwaLogs();
        }
    };

    const handleConvertToInternal = async () => {
        if (!editingPwaLog) return;
        setInternalLogInitialData({
            date: editingPwaLog.date,
            type: 'work_day',
            title: `Raport (${editingPwaLog.type})`,
            text: pwaEditDescription || editingPwaLog.description,
            visibleToClient: true,
            photos: editingPwaLog.photo ? [editingPwaLog.photo] : []
        });
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
        const token = localStorage.getItem('kostiq_token');
        try {
            await fetch(`${baseUrl}/site-logs/${editingPwaLog.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ status: 'converted', description: pwaEditDescription || editingPwaLog.description })
            });
            setPwaLogs(prev => prev.map(l => l.id === editingPwaLog.id ? { ...l, status: 'converted' as const, description: pwaEditDescription || l.description } : l));
        } catch (e) { console.error('Failed to mark as converted', e); }
        setEditingPwaLog(null);
        setSelectedInternalEntry(undefined);
        setIsInternalModalOpen(true);
    };

    const handleSavePwaLog = async () => {
        if (!editingPwaLog) return;
        setPwaLogs(prev => prev.map(l => l.id === editingPwaLog.id ? { ...l, description: pwaEditDescription } : l));
        setEditingPwaLog(null);
        try {
            const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
            const token = localStorage.getItem('kostiq_token');
            await fetch(`${baseUrl}/site-logs/${editingPwaLog.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ description: pwaEditDescription })
            });
        } catch (e) {
            console.error('Failed to update log', e);
            fetchPwaLogs();
        }
    };

    const handleAddNewInternal = () => {
        setSelectedInternalEntry(undefined);
        setInternalLogInitialData(undefined);
        setIsInternalModalOpen(true);
    };

    // Quick Entry Photo Upload
    const handleQuickPhotoUpload = async (file: File) => {
        setIsUploadingPhoto(true);
        const loadingToast = toast.loading('Przesyłanie zdjęcia...');
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('projectId', job.id);
            formData.append('description', 'Zdjęcie do dziennika budowy');

            const token = localStorage.getItem('kostiq_token');
            const res = await fetch(`${API_BASE}/documents/upload`, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: formData
            });

            if (res.ok) {
                const doc = await res.json();
                setQuickPhotos(prev => [...prev, doc.url]);
                toast.success('Zdjęcie zostało dodane do wpisu.', { id: loadingToast });
            } else {
                toast.error('Błąd podczas przesyłania zdjęcia.', { id: loadingToast });
            }
        } catch (err) {
            console.error('Photo upload error:', err);
            toast.error('Błąd połączenia podczas przesyłania.', { id: loadingToast });
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    const handleQuickDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setIsQuickDragActive(true);
        } else if (e.type === "dragleave") {
            setIsQuickDragActive(false);
        }
    };

    const handleQuickDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsQuickDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                handleQuickPhotoUpload(file);
            } else {
                toast.error('Dozwolone są tylko pliki graficzne.');
            }
        }
    };

    const handleQuickFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleQuickPhotoUpload(e.target.files[0]);
        }
    };

    const handleRemoveQuickPhoto = (indexToRemove: number) => {
        setQuickPhotos(prev => prev.filter((_, idx) => idx !== indexToRemove));
    };

    // Quick Entry Submit
    const handleSubmitQuick = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!quickText.trim()) {
            toast.error('Opis wpisu jest wymagany.');
            return;
        }

        setIsSubmittingQuick(true);
        try {
            const author = localStorage.getItem('kostiq_user') 
                ? JSON.parse(localStorage.getItem('kostiq_user') || '').firstName 
                : 'Biuro';

            const newEntry = {
                jobId: job.id,
                date: new Date(quickDate).toISOString(),
                type: quickType,
                title: quickTitle.trim() || `Wpis z biura - ${format(new Date(quickDate), 'dd.MM.yyyy')}`,
                text: quickText.trim(),
                visibleToClient: true,
                photos: quickPhotos,
                authorId: author,
                isApprovedForReport: true, // Auto-approved for office entries
                details: {
                    weather: quickWeather.trim() || undefined,
                    workers: quickWorkers !== '' ? Number(quickWorkers) : undefined
                }
            };

            await addEntry(newEntry);
            toast.success('Dodano wpis do dziennika.');

            // Reset
            setQuickTitle('');
            setQuickText('');
            setQuickWeather('');
            setQuickWorkers('');
            setQuickPhotos([]);
        } catch (err) {
            console.error('Failed to add quick entry:', err);
            toast.error('Wystąpił błąd podczas dodawania wpisu.');
        } finally {
            setIsSubmittingQuick(false);
        }
    };

    const toggleVisibility = async (e: React.MouseEvent, entry: any) => {
        e.stopPropagation();
        if (entry.source === 'pwa') { alert('Widoczność raportów z App jest domyślnie włączona.'); return; }
        await updateEntry(entry.id, { visibleToClient: !entry.visibleToClient });
    };

    const handleGenerateReport = async (opts: { dateFrom: string; dateTo: string; onlyApproved: boolean }) => {
        try {
            const filtered = allEntries.filter(e => {
                const d = e.date?.substring(0, 10);
                if (opts.dateFrom && d < opts.dateFrom) return false;
                if (opts.dateTo && d > opts.dateTo) return false;
                if (opts.onlyApproved && !(e as any).isApprovedForReport) return false;
                return true;
            });
            await generateConstructionReport(job, filtered, { dateFrom: opts.dateFrom, dateTo: opts.dateTo, onlyApproved: opts.onlyApproved, resolveAuthor });
        } catch (error) {
            console.error('Failed to generate PDF report', error);
            alert('Błąd podczas generowania raportu PDF.');
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'work_day': return <Hammer className="w-5 h-5 text-blue-500" />;
            case 'note': return <MessageSquare className="w-5 h-5 text-gray-500" />;
            case 'issue': return <AlertTriangle className="w-5 h-5 text-red-500" />;
            case 'milestone': return <Flag className="w-5 h-5 text-green-600" />;
            case 'extra_work': return <CheckCircle2 className="w-5 h-5 text-purple-500" />;
            case 'site_log': return <Smartphone className="w-5 h-5 text-orange-500" />;
            default: return <MessageSquare className="w-5 h-5" />;
        }
    };

    const approvedCount = allEntries.filter(e => (e as any).isApprovedForReport).length;

    return (
        <div className="space-y-6">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row justify-between gap-4 bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
                    <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-gray-50">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <select className="bg-transparent border-none text-sm focus:ring-0 cursor-pointer"
                            value={filterType} onChange={(e) => setFilterType(e.target.value as JobLogEntryType | 'all')}>
                            <option value="all">Wszystkie typy</option>
                            <option value="work_day">Dzień pracy</option>
                            <option value="note">Notatka</option>
                            <option value="issue">Problem</option>
                            <option value="extra_work">Prace dodatkowe</option>
                            <option value="milestone">Kamień milowy</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-gray-50">
                        <Eye className="w-4 h-4 text-gray-500" />
                        <select className="bg-transparent border-none text-sm focus:ring-0 cursor-pointer"
                            value={filterVisible.toString()}
                            onChange={(e) => { const v = e.target.value; setFilterVisible(v === 'all' ? 'all' : v === 'true'); }}>
                            <option value="all">Wszystkie</option>
                            <option value="true">Dla klienta</option>
                            <option value="false">Wewnętrzne</option>
                        </select>
                    </div>

                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        <input type="text" placeholder="Szukaj we wpisach..."
                            className="pl-9 pr-4 py-2 text-sm border rounded-md focus:ring-2 focus:ring-primary focus:border-transparent w-56"
                            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* APP refresh button */}
                    <button onClick={fetchPwaLogs} disabled={isRefreshing}
                        className="flex items-center gap-1.5 bg-orange-50 text-orange-700 border border-orange-200 px-3 py-2 rounded-lg hover:bg-orange-100 transition-colors text-sm disabled:opacity-60"
                        title="Odśwież raporty z terenu">
                        <RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                        Z terenu ({pwaLogs.length})
                    </button>

                    {/* PDF button */}
                    <button onClick={() => setIsReportModalOpen(true)} disabled={allEntries.length === 0}
                        className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors shadow-sm disabled:opacity-50 text-sm">
                        <FileDown className="w-4 h-4 text-[#21808D]" />
                        Raport PDF
                        {approvedCount > 0 && (
                            <span className="ml-1 bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                {approvedCount} ✓
                            </span>
                        )}
                    </button>

                    <button onClick={handleAddNewInternal}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm">
                        <Plus className="w-4 h-4" />
                        Dodaj wpis
                    </button>
                </div>
            </div>

            {/* Approved count banner */}
            {approvedCount > 0 && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-4 py-2 text-sm text-green-800">
                    <CheckSquare className="w-4 h-4 text-green-600" />
                    <span><strong>{approvedCount}</strong> {approvedCount === 1 ? 'wpis zatwierdzony' : 'wpisy zatwierdzone'} do raportu PDF</span>
                    <button onClick={() => setIsReportModalOpen(true)} className="ml-auto text-green-700 underline text-xs hover:text-green-900">
                        Generuj teraz →
                    </button>
                </div>
            )}

            {/* Szybki wpis z biura Form */}
            <form 
                onSubmit={handleSubmitQuick}
                className="bg-white rounded-xl border border-gray-205/60 p-5 shadow-sm space-y-4"
            >
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                        <Plus className="w-4 h-4 text-teal-650" />
                        Szybki wpis z biura (na podstawie SMS/WhatsApp)
                    </h3>
                    <span className="text-[10px] bg-slate-100 text-slate-650 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        Klawiatura & Mysz
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Typ wpisu */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Typ wpisu</label>
                        <select 
                            value={quickType}
                            onChange={(e) => setQuickType(e.target.value as JobLogEntryType)}
                            className="w-full text-xs font-medium border border-gray-200 rounded-lg p-2 outline-none focus:ring-1 focus:ring-teal-500"
                        >
                            <option value="work_day">Dzień pracy</option>
                            <option value="note">Notatka</option>
                            <option value="issue">Problem</option>
                            <option value="extra_work">Prace dodatkowe</option>
                            <option value="milestone">Kamień milowy</option>
                        </select>
                    </div>

                    {/* Data */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Data</label>
                        <input 
                            type="date"
                            value={quickDate}
                            onChange={(e) => setQuickDate(e.target.value)}
                            className="w-full text-xs font-medium border border-gray-200 rounded-lg p-1.5 outline-none focus:ring-1 focus:ring-teal-500 text-gray-700"
                        />
                    </div>

                    {/* Pogoda */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Pogoda (opcjonalnie)</label>
                        <input 
                            type="text"
                            value={quickWeather}
                            onChange={(e) => setQuickWeather(e.target.value)}
                            placeholder="np. Słonecznie, +18°C"
                            className="w-full text-xs font-medium border border-gray-200 rounded-lg p-2 outline-none focus:ring-1 focus:ring-teal-500 text-gray-700"
                        />
                    </div>

                    {/* Brygada / Liczba osób */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Liczba montażystów</label>
                        <input 
                            type="number"
                            value={quickWorkers}
                            onChange={(e) => setQuickWorkers(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="np. 4"
                            min={0}
                            className="w-full text-xs font-medium border border-gray-200 rounded-lg p-2 outline-none focus:ring-1 focus:ring-teal-500 text-gray-700 text-right"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Opis / Treść wpisu */}
                    <div className="md:col-span-2 space-y-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Nagłówek / Tytuł (opcjonalnie)</label>
                            <input 
                                type="text"
                                value={quickTitle}
                                onChange={(e) => setQuickTitle(e.target.value)}
                                placeholder="np. Montaż stolarki parteru..."
                                className="w-full text-xs font-medium border border-gray-200 rounded-lg p-2 outline-none focus:ring-1 focus:ring-teal-500 text-gray-800"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Treść raportu / Logi z WhatsApp</label>
                            <textarea
                                value={quickText}
                                onChange={(e) => setQuickText(e.target.value)}
                                placeholder="Wklej tutaj treść SMS lub wiadomości od ekipy z budowy..."
                                rows={4}
                                className="w-full text-xs border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-teal-500 text-gray-800 resize-none font-sans"
                            />
                        </div>
                    </div>

                    {/* Drag & Drop Photo Attachments */}
                    <div className="flex flex-col">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Załączniki (Zdjęcia z WhatsApp)</label>
                        <div 
                            className={`flex-1 border border-dashed rounded-lg p-4 text-center flex flex-col items-center justify-center transition-all ${
                                isQuickDragActive 
                                    ? 'border-teal-500 bg-teal-50/20' 
                                    : 'border-gray-200 bg-slate-50/40 hover:border-gray-300'
                            }`}
                            onDragEnter={handleQuickDrag}
                            onDragOver={handleQuickDrag}
                            onDragLeave={handleQuickDrag}
                            onDrop={handleQuickDrop}
                        >
                            <Upload className="w-5 h-5 text-gray-400 mb-1.5" />
                            <span className="text-[10px] text-gray-600 font-bold block">
                                Przeciągnij zdjęcia tutaj
                            </span>
                            <span className="text-[9px] text-gray-400 block mt-0.5">
                                lub
                            </span>
                            <label className="mt-1.5 px-2.5 py-1 bg-white border border-gray-250 text-gray-700 text-[9px] font-bold rounded cursor-pointer hover:bg-gray-50 transition-colors shadow-sm">
                                Wybierz pliki
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={handleQuickFileInput}
                                    multiple 
                                />
                            </label>
                        </div>
                    </div>
                </div>

                {/* Previews of attached photos */}
                {quickPhotos.length > 0 && (
                    <div className="flex flex-wrap gap-2.5 bg-slate-50 p-2.5 rounded-lg border border-gray-200/50">
                        {quickPhotos.map((url, idx) => (
                            <div key={idx} className="relative w-16 h-16 group rounded-lg overflow-hidden border border-gray-250 shadow-sm bg-white">
                                <img src={url} alt="attached" className="w-full h-full object-cover" />
                                <button
                                    type="button"
                                    onClick={() => handleRemoveQuickPhoto(idx)}
                                    className="absolute inset-0 bg-red-650/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold"
                                >
                                    Usuń
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex justify-end pt-2">
                    <button
                        type="submit"
                        disabled={isSubmittingQuick || isUploadingPhoto}
                        className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                    >
                        {isSubmittingQuick ? 'Zapisywanie wpisu...' : 'Dodaj wpis do Dziennika'}
                    </button>
                </div>
            </form>

            {/* Timeline List */}
            <div className="space-y-3">
                {allEntries.length === 0 ? (
                    <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                        Brak wpisów w dzienniku dla wybranych kryteriów.
                    </div>
                ) : (
                    allEntries.map((entry) => {
                        const isApproved = (entry as any).isApprovedForReport;
                        return (
                            <div key={`${entry.source}-${entry.id}`}
                                className={`group bg-white rounded-xl border transition-all shadow-sm hover:shadow-md relative overflow-hidden ${isApproved ? 'border-green-200 ring-1 ring-green-100' : 'border-gray-200'}`}>

                                {/* Source stripe */}
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${entry.source === 'pwa' ? 'bg-orange-400' : 'bg-blue-400'}`} />

                                <div className="flex flex-col sm:flex-row gap-4 p-4 pl-5">
                                    {/* Date column */}
                                    <div className="sm:w-28 flex-shrink-0 flex flex-row sm:flex-col items-center sm:items-start gap-2">
                                        <div className="flex flex-col items-center bg-gray-50 px-3 py-2 rounded-lg border border-gray-100 min-w-[72px]">
                                            <span className="text-xl font-bold text-gray-900 leading-none">{format(new Date(entry.date), 'dd')}</span>
                                            <span className="text-xs uppercase font-medium text-gray-500">{format(new Date(entry.date), 'MMM', { locale: pl })}</span>
                                            <span className="text-[10px] text-gray-400 mt-1">{format(new Date(entry.date), 'yyyy')}</span>
                                        </div>
                                        {entry.source === 'pwa' && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                                                <Smartphone className="w-3 h-3 mr-1" />Z terenu
                                            </span>
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0" onClick={() => handleEdit(entry)} style={{ cursor: 'pointer' }}>
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${entry.source === 'pwa' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                                                    {getIcon(entry.type)}
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-semibold text-gray-900 leading-tight">{entry.title}</h4>
                                                    <div className="text-xs text-gray-500 mt-0.5 flex gap-2">
                                                        <Clock className="w-3 h-3 mt-0.5" />
                                                        <span>{format(new Date(entry.date), 'HH:mm')}</span>
                                                        <span>•</span>
                                                        <span>{resolveAuthor(entry.authorId)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Visibility toggle (internal only) */}
                                            {entry.source === 'internal' && (
                                                <button onClick={(e) => toggleVisibility(e, entry)}
                                                    className={`p-2 rounded-lg transition-colors ${entry.visibleToClient ? 'text-green-600 bg-green-50 hover:bg-green-100' : 'text-gray-400 hover:bg-gray-100'}`}
                                                    title={entry.visibleToClient ? 'Widoczne dla raportu' : 'Tylko wewnętrzne'}>
                                                    {entry.visibleToClient ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                                </button>
                                            )}
                                        </div>

                                        <div className="prose prose-sm max-w-none text-gray-600 text-sm whitespace-pre-wrap mt-2 mb-3">
                                            {entry.text}
                                        </div>

                                        {/* PWA extra: weather/workers */}
                                        {entry.source === 'pwa' && (entry.details?.weather || entry.details?.workers) && (
                                            <div className="flex gap-4 text-xs bg-gray-50 p-2 rounded-md border border-gray-100 w-fit mb-3">
                                                {entry.details.weather && <span>⛅ {entry.details.weather}</span>}
                                                {entry.details.workers && <span className="border-l pl-3 border-gray-200">👷 {entry.details.workers} os.</span>}
                                            </div>
                                        )}

                                        {/* Photos */}
                                        {entry.photos && entry.photos.length > 0 && (
                                            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
                                                {entry.photos.map((photo: string, i: number) => (
                                                    <div key={i} className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100 cursor-zoom-in"
                                                        onClick={(e) => { e.stopPropagation(); setPreviewPhoto(photo); }}>
                                                        <img src={photo.startsWith('data:image') || photo.startsWith('http') ? photo : `${API_BASE.split('/api')[0]}${photo}`}
                                                            alt={`Zdjęcie ${i + 1}`} className="w-full h-full object-cover" />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Right action column — approve toggle */}
                                    <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:w-36 flex-shrink-0 justify-between sm:justify-start">
                                        {/* Approve for report toggle */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (entry.source === 'pwa') {
                                                    handleToggleApproved(e, (entry as any).originalObject);
                                                } else {
                                                    handleToggleInternalApproved(e, entry);
                                                }
                                            }}
                                            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all ${isApproved
                                                ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                                                : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100 hover:text-gray-700'
                                                }`}
                                            title={isApproved ? 'Zatwierdzony do raportu — kliknij, by cofnąć' : 'Kliknij, by dołączyć do raportu PDF'}
                                        >
                                            {isApproved
                                                ? <><CheckSquare className="w-3.5 h-3.5" /> Do raportu</>
                                                : <><Square className="w-3.5 h-3.5" /> Do raportu</>
                                            }
                                        </button>

                                        {/* Preview button */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setPreviewEntry(entry);
                                            }}
                                            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-transparent hover:bg-zinc-50 text-zinc-650 transition-all hover:border-zinc-100 w-full justify-center"
                                        >
                                            <Search className="w-3.5 h-3.5 text-zinc-400" />
                                            Podgląd
                                        </button>

                                        {/* PWA status + edit */}
                                        {entry.source === 'pwa' ? (
                                            <div className="flex gap-1.5 flex-col items-end w-full">
                                                {(entry.originalObject?.status === 'new' || !entry.originalObject?.status) && (
                                                    <span className="text-[10px] font-bold uppercase tracking-wide text-blue-600 bg-blue-50 px-2 py-0.5 rounded self-center">
                                                        Nowy
                                                    </span>
                                                )}
                                                {entry.originalObject?.status === 'converted' && (
                                                    <span className="text-[10px] font-bold uppercase tracking-wide text-green-600 bg-blue-50 px-2 py-0.5 rounded self-center">
                                                        Przejęty
                                                    </span>
                                                )}
                                                {(entry.originalObject?.status !== 'read' && entry.originalObject?.status !== 'converted') && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleMarkAsRead((entry as any).originalObject); }}
                                                        className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 self-center">
                                                        <CheckCircle2 className="w-3 h-3" /> Przeczytano
                                                    </button>
                                                )}
                                                <button onClick={(e) => { e.stopPropagation(); handleEdit(entry); }}
                                                    className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 px-2 py-1 hover:bg-blue-50 rounded w-full justify-center">
                                                    <Pencil className="w-3 h-3" />
                                                    {entry.originalObject?.status === 'converted' ? 'Szczegóły' : 'Edytuj / Przenieś'}
                                                </button>
                                            </div>
                                        ) : (
                                            <button onClick={(e) => { e.stopPropagation(); handleEdit(entry); }}
                                                className="text-xs font-medium text-blue-600 hover:text-blue-750 flex items-center gap-1 px-2 py-1.5 hover:bg-blue-50 rounded border border-transparent hover:border-blue-100 w-full justify-center">
                                                <Pencil className="w-3 h-3" />
                                                Edytuj
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Internal Entry Modal */}
            {isInternalModalOpen && (
                <JobLogEntryModal isOpen={isInternalModalOpen} onClose={() => setIsInternalModalOpen(false)}
                    jobId={job.id} entryToEdit={selectedInternalEntry} initialData={internalLogInitialData} job={job} />
            )}

            <UIModal isOpen={!!editingPwaLog} onClose={() => setEditingPwaLog(null)} title="Edycja raportu z terenu">
                <div className="space-y-4">
                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 text-sm text-orange-800">
                        Edytujesz treść raportu przesłanego przez pracownika. Zmiana zostanie zapisana w systemie.
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Treść raportu</label>
                        <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[150px] text-sm"
                            value={pwaEditDescription} onChange={(e) => setPwaEditDescription(e.target.value)} />
                    </div>
                    <div className="flex justify-between items-center pt-2">
                        <Button variant="secondary" onClick={handleConvertToInternal}
                            className="text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100">
                            <Plus className="w-4 h-4 mr-2" />
                            Przenieś do dziennika wewnętrznego
                        </Button>
                        <div className="flex gap-3">
                            <Button variant="secondary" onClick={() => setEditingPwaLog(null)}>Anuluj</Button>
                            <Button onClick={handleSavePwaLog}>
                                <Save className="w-4 h-4 mr-2" />
                                Zapisz zmiany
                            </Button>
                        </div>
                    </div>
                </div>
            </UIModal>

            {/* Report Config Modal */}
            <ReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)}
                onGenerate={handleGenerateReport} />

            {/* Photo Lightbox */}
            {previewPhoto && (
                <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
                    onClick={() => setPreviewPhoto(null)}>
                    <img src={previewPhoto.startsWith('data:image') || previewPhoto.startsWith('http') ? previewPhoto : `${API_BASE.split('/api')[0]}${previewPhoto}`}
                        className="max-w-full max-h-full rounded shadow-2xl object-contain" alt="Powiększenie" />
                    <button className="absolute top-6 right-6 text-white bg-white/10 p-2 rounded-full hover:bg-white/20"
                        onClick={(e) => { e.stopPropagation(); setPreviewPhoto(null); }}>
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
                                {job.jobCode} — {job.name}
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
                                                src={photo.startsWith('data:image') || photo.startsWith('http') ? photo : `${API_BASE.split('/api')[0]}${photo}`}
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
};
