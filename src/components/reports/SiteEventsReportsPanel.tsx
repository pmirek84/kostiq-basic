import { useState, useMemo } from 'react';
import {
    Calendar, AlertTriangle, HardHat, FileText, Milestone, ClipboardList,
    Eye, Pencil, X, User, MapPin, Image, ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useJobLog } from '../../context/JobLogContext';
import { useJobs } from '../../context/JobsContext';
import { useTiCo } from '../../context/TiCoContext';
import type { JobLogEntry, JobLogEntryType } from '../../models/types';
import { JobLogEntryModal } from '../jobs/diary/JobLogEntryModal';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

const TYPE_CONFIG: Record<JobLogEntryType, { label: string; color: string; bg: string; border: string; icon: typeof FileText }> = {
    work_day: { label: 'Dzień pracy', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: ClipboardList },
    note: { label: 'Uwaga', color: 'text-gray-700', bg: 'bg-gray-100', border: 'border-gray-200', icon: FileText },
    issue: { label: 'Problem', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: AlertTriangle },
    extra_work: { label: 'Prace dodatkowe', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: HardHat },
    milestone: { label: 'Kamień milowy', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', icon: Milestone },
};

// ──────────────────────────────────────────
// Entry Detail Drawer
// ──────────────────────────────────────────
function EntryDrawer({
    entry, onClose, onEdit, getJobName, resolveAuthor
}: {
    entry: JobLogEntry;
    onClose: () => void;
    onEdit: () => void;
    getJobName: (id: string) => string;
    resolveAuthor: (id: string) => string;
}) {
    const cfg = TYPE_CONFIG[entry.type] ?? TYPE_CONFIG.note;
    const Icon = cfg.icon;
    const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null);

    const baseUrl = API_BASE.replace(/\/api$/, '');

    const dateStr = (() => {
        try { return format(new Date(entry.date), 'EEEE, d MMMM yyyy', { locale: pl }); }
        catch { return entry.date ?? ''; }
    })();

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />

            {/* Drawer panel */}
            <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right-4 duration-200">
                {/* Header */}
                <div className={`flex items-center justify-between px-5 py-4 border-b ${cfg.bg} ${cfg.border} border-b`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg bg-white/70 ${cfg.border} border`}>
                            <Icon className={`w-5 h-5 ${cfg.color}`} />
                        </div>
                        <div>
                            <span className={`text-xs font-bold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</span>
                            <p className="text-sm font-semibold text-gray-900 mt-0.5">{entry.title || '—'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onEdit}
                            className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm">
                            <Pencil className="w-3.5 h-3.5" />
                            Edytuj
                        </button>
                        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-white/80">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Meta row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 rounded-xl p-3 flex items-start gap-2 border border-gray-100">
                            <Calendar className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-[10px] text-gray-400 uppercase font-medium tracking-wide">Data</p>
                                <p className="text-sm font-medium text-gray-900 capitalize">{dateStr}</p>
                            </div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 flex items-start gap-2 border border-gray-100">
                            <User className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-[10px] text-gray-400 uppercase font-medium tracking-wide">Autor</p>
                                <p className="text-sm font-medium text-gray-900">{resolveAuthor(entry.authorId)}</p>
                            </div>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 flex items-start gap-2 border border-gray-100 col-span-2">
                            <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-[10px] text-gray-400 uppercase font-medium tracking-wide">Zlecenie</p>
                                <p className="text-sm font-medium text-teal-700">{getJobName(entry.jobId)}</p>
                            </div>
                        </div>
                    </div>

                    {/* Details (weather, workers) */}
                    {((entry as any).details?.weather || (entry as any).details?.workers) && (
                        <div className="bg-sky-50 rounded-xl p-3 border border-sky-100 flex gap-4 text-sm text-sky-800">
                            {(entry as any).details.weather && <span>⛅ {(entry as any).details.weather}</span>}
                            {(entry as any).details.workers && <span className="border-l border-sky-200 pl-4">👷 {(entry as any).details.workers} pracowników</span>}
                        </div>
                    )}

                    {/* Description */}
                    {entry.text && (
                        <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Opis / Treść</h4>
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{entry.text}</p>
                            </div>
                        </div>
                    )}

                    {/* Extra costs */}
                    {entry.extraCosts && entry.extraCosts.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Koszty dodatkowe</h4>
                            <div className="space-y-1.5">
                                {entry.extraCosts.map((c: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center bg-amber-50 rounded-lg px-3 py-2 border border-amber-100 text-sm">
                                        <span className="text-amber-800">{c.description || `Pozycja ${i + 1}`}</span>
                                        <span className="font-semibold text-amber-900">{c.amount?.toFixed(2)} PLN</span>
                                    </div>
                                ))}
                                <div className="flex justify-between items-center bg-amber-100 rounded-lg px-3 py-2 text-sm font-bold mt-1">
                                    <span className="text-amber-900">Łącznie</span>
                                    <span className="text-amber-900">
                                        {entry.extraCosts.reduce((s: number, c: any) => s + (c.amount || 0), 0).toFixed(2)} PLN
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Photos */}
                    {entry.photos && entry.photos.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <Image className="w-3.5 h-3.5" />
                                Zdjęcia ({entry.photos.length})
                            </h4>
                            <div className="grid grid-cols-3 gap-2">
                                {entry.photos.map((p: string, i: number) => {
                                    const src = p.startsWith('data:image') || p.startsWith('http') ? p : `${baseUrl}${p}`;
                                    return (
                                        <div key={i}
                                            className="aspect-square rounded-xl overflow-hidden border border-gray-200 cursor-zoom-in hover:opacity-90 transition-opacity shadow-sm"
                                            onClick={() => setExpandedPhoto(src)}>
                                            <img src={src} className="w-full h-full object-cover" alt={`Zdjęcie ${i + 1}`} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Approved badge */}
                    {(entry as any).isApprovedForReport && (
                        <div className="flex items-center gap-2 bg-green-50 rounded-xl p-3 border border-green-100 text-sm text-green-700">
                            <span className="font-bold">✓</span>
                            Wpis zatwierdzony do raportu PDF
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between bg-gray-50">
                    <span className="text-xs text-gray-400">
                        {entry.source === 'pwa' ? '📱 Wpis z terenu' : '🖥️ Wpis biurowy'}
                    </span>
                    <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
                        Zamknij
                    </button>
                </div>
            </div>

            {/* Photo lightbox */}
            {expandedPhoto && (
                <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out"
                    onClick={() => setExpandedPhoto(null)}>
                    <img src={expandedPhoto} className="max-w-full max-h-full rounded-xl object-contain shadow-2xl" alt="" />
                    <button className="absolute top-5 right-5 text-white bg-white/10 p-2 rounded-full hover:bg-white/20">
                        <X size={28} />
                    </button>
                </div>
            )}
        </>
    );
}

// ──────────────────────────────────────────
// Main Panel
// ──────────────────────────────────────────
export default function SiteEventsReportsPanel() {
    const { entries } = useJobLog();
    const { jobs } = useJobs();
    const { employees } = useTiCo();

    const [filterJobId, setFilterJobId] = useState('');
    const [filterType, setFilterType] = useState('');
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');

    const [previewEntry, setPreviewEntry] = useState<JobLogEntry | null>(null);
    const [editingEntry, setEditingEntry] = useState<JobLogEntry | null>(null);

    // Author resolver
    const resolveAuthor = (authorId: string): string => {
        if (!authorId) return 'Nieznany';
        const emp = employees.find((e: any) => e.id === authorId || `${e.firstName} ${e.lastName}` === authorId);
        if (emp) return `${(emp as any).firstName} ${(emp as any).lastName}`;
        if (/^[0-9a-f-]{20,}$/i.test(authorId)) return 'Pracownik APP';
        return authorId;
    };

    const filteredEntries = useMemo(() => {
        return entries
            .filter(e => {
                if (filterJobId && e.jobId !== filterJobId) return false;
                if (filterType && e.type !== filterType) return false;
                if (filterDateFrom && e.date < filterDateFrom) return false;
                if (filterDateTo && e.date > filterDateTo) return false;
                return true;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [entries, filterJobId, filterType, filterDateFrom, filterDateTo]);

    const stats = useMemo(() => {
        const total = filteredEntries.length;
        const issues = filteredEntries.filter(e => e.type === 'issue').length;
        const extraWorks = filteredEntries.filter(e => e.type === 'extra_work').length;
        const uniqueJobs = new Set(filteredEntries.map(e => e.jobId)).size;
        const totalExtraCosts = filteredEntries.reduce((sum, e) => {
            if (!e.extraCosts) return sum;
            return sum + e.extraCosts.reduce((s: number, c: any) => s + (c.amount || 0), 0);
        }, 0);
        return { total, issues, extraWorks, uniqueJobs, totalExtraCosts };
    }, [filteredEntries]);

    const getJobName = (jobId: string) => {
        const job = jobs.find(j => j.id === jobId);
        return job ? `${job.jobCode} – ${job.name}` : jobId;
    };

    const selectedJob = (editingEntry
        ? jobs.find(j => j.id === editingEntry.jobId)
        : undefined) as any;

    return (
        <div className="space-y-4">
            {/* Filtry */}
            <div className="bg-white rounded-lg shadow-sm p-4 flex flex-wrap gap-4 items-end">
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Zlecenie</label>
                    <select
                        value={filterJobId}
                        onChange={e => setFilterJobId(e.target.value)}
                        className="border-gray-300 rounded-md text-sm p-1.5 border min-w-[200px]">
                        <option value="">Wszystkie</option>
                        {jobs.map(j => (
                            <option key={j.id} value={j.id}>{j.jobCode} – {j.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Typ zdarzenia</label>
                    <select
                        value={filterType}
                        onChange={e => setFilterType(e.target.value)}
                        className="border-gray-300 rounded-md text-sm p-1.5 border">
                        <option value="">Wszystkie</option>
                        {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                            <option key={key} value={key}>{cfg.label}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Od</label>
                    <div className="inline-flex items-center">
                        <Calendar className="h-4 w-4 text-gray-400 mr-1" />
                        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                            className="border-gray-300 rounded-md text-sm p-1 border" />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Do</label>
                    <div className="inline-flex items-center">
                        <Calendar className="h-4 w-4 text-gray-400 mr-1" />
                        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                            className="border-gray-300 rounded-md text-sm p-1 border" />
                    </div>
                </div>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <KpiCard label="Łączna liczba zdarzeń" value={String(stats.total)} />
                <KpiCard label="Problemy" value={String(stats.issues)} highlight={stats.issues > 0 ? 'red' : undefined} />
                <KpiCard label="Prace dodatkowe" value={String(stats.extraWorks)} highlight={stats.extraWorks > 0 ? 'amber' : undefined} />
                <KpiCard label="Zlecenia z wpisami" value={String(stats.uniqueJobs)} />
                <KpiCard label="Koszty dodatkowe" value={`${stats.totalExtraCosts.toFixed(2)} PLN`} />
            </div>

            {/* Tabela */}
            {filteredEntries.length === 0 ? (
                <div className="bg-white rounded-lg p-6 text-sm text-gray-500 text-center border border-dashed border-gray-300">
                    Brak zdarzeń spełniających kryteria filtrów.
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                            <thead>
                                <tr className="border-b text-gray-500 bg-gray-50">
                                    <th className="py-2.5 px-3 text-left font-medium">Data</th>
                                    <th className="py-2.5 px-3 text-left font-medium">Typ</th>
                                    <th className="py-2.5 px-3 text-left font-medium">Zlecenie</th>
                                    <th className="py-2.5 px-3 text-left font-medium">Autor</th>
                                    <th className="py-2.5 px-3 text-left font-medium">Tytuł / Opis</th>
                                    <th className="py-2.5 px-3 text-right font-medium">Koszty dod.</th>
                                    <th className="py-2.5 px-3 text-center font-medium w-24">Akcje</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredEntries.map(entry => {
                                    const cfg = TYPE_CONFIG[entry.type] || TYPE_CONFIG.note;
                                    const Icon = cfg.icon;
                                    const extraCostsSum = (entry.extraCosts as any[])?.reduce((s, c) => s + (c.amount || 0), 0) || 0;
                                    const isApproved = (entry as any).isApprovedForReport;

                                    return (
                                        <tr key={entry.id}
                                            className="border-b last:border-b-0 hover:bg-gray-50 cursor-pointer group"
                                            onClick={() => setPreviewEntry(entry)}>
                                            <td className="py-2 px-3 text-gray-700 whitespace-nowrap">{entry.date?.substring(0, 10)}</td>
                                            <td className="py-2 px-3">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.color} ${cfg.bg}`}>
                                                    <Icon className="h-3 w-3" />
                                                    {cfg.label}
                                                </span>
                                            </td>
                                            <td className="py-2 px-3 text-gray-700 max-w-[180px] truncate">
                                                {getJobName(entry.jobId)}
                                            </td>
                                            <td className="py-2 px-3 text-gray-600 whitespace-nowrap">
                                                {resolveAuthor(entry.authorId)}
                                            </td>
                                            <td className="py-2 px-3">
                                                <div className="flex items-start gap-1.5">
                                                    {isApproved && (
                                                        <span className="text-[10px] text-green-600 font-bold mt-0.5 flex-shrink-0">✓</span>
                                                    )}
                                                    <div>
                                                        {entry.title && (
                                                            <div className="font-medium text-gray-900 text-[12px]">{entry.title}</div>
                                                        )}
                                                        <div className="text-gray-600 line-clamp-1">{entry.text}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="py-2 px-3 text-right whitespace-nowrap">
                                                {extraCostsSum > 0 ? (
                                                    <span className="font-medium text-amber-700">{extraCostsSum.toFixed(2)} PLN</span>
                                                ) : (
                                                    <span className="text-gray-400">—</span>
                                                )}
                                            </td>
                                            <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => setPreviewEntry(entry)}
                                                        title="Podgląd"
                                                        className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => { setEditingEntry(entry); }}
                                                        title="Edytuj"
                                                        className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <ChevronRight className="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors" />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Entry Drawer — Preview */}
            {previewEntry && (
                <EntryDrawer
                    entry={previewEntry}
                    onClose={() => setPreviewEntry(null)}
                    onEdit={() => { setEditingEntry(previewEntry); setPreviewEntry(null); }}
                    getJobName={getJobName}
                    resolveAuthor={resolveAuthor}
                />
            )}

            {/* Edit Modal */}
            {editingEntry && (
                <JobLogEntryModal
                    isOpen={true}
                    onClose={() => setEditingEntry(null)}
                    jobId={editingEntry.jobId}
                    entryToEdit={editingEntry}
                    job={selectedJob}
                />
            )}
        </div>
    );
}

function KpiCard({ label, value, highlight }: { label: string; value: string; highlight?: 'red' | 'amber' }) {
    const valueColor = highlight === 'red' ? 'text-red-600' : highlight === 'amber' ? 'text-amber-600' : 'text-gray-900';
    return (
        <div className="bg-white rounded-lg shadow-sm p-3 border border-gray-200">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
            <p className={`mt-1 text-sm font-semibold ${valueColor}`}>{value}</p>
        </div>
    );
}
