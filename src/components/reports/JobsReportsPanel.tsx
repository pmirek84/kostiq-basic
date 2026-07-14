import { useMemo, useState, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, Flame, TrendingDown, TrendingUp, ArrowUpDown, FileDown } from 'lucide-react';
import { useJobs } from '../../context/JobsContext';
import { useTiCo } from '../../context/TiCoContext';
import { useJobLog } from '../../context/JobLogContext';
import { generateConstructionReport } from '../../services/reports/ConstructionReportPDF';
import { Modal as UIModal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { toast } from 'sonner';

const fmt = (v: number) => v.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 });
const pct = (v: number) => `${v.toFixed(1)}%`;

// ── Budget progress bar ──────────────────────────────
function BurnBar({ used, total, label }: { used: number; total: number; label: string }) {
    const ratio = total > 0 ? Math.min((used / total) * 100, 100) : 0;
    const danger = ratio >= 90;
    const warning = ratio >= 70 && !danger;
    const color = danger ? 'bg-red-500' : warning ? 'bg-amber-400' : 'bg-[#21808D]';
    const textColor = danger ? 'text-red-700' : warning ? 'text-amber-700' : 'text-zinc-700';
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">{label}</span>
                <span className={`font-bold ${textColor}`}>{ratio.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${ratio}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-400">
                <span>{fmt(used)} wyd.</span>
                <span>{fmt(total)} plan</span>
            </div>
        </div>
    );
}

// ── Risk badge ───────────────────────────────────────
function RiskBadge({ score }: { score: number }) {
    if (score >= 90) return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-red-50 border border-red-200 text-red-700">
            <Flame className="w-2.5 h-2.5" /> KRYTYCZNE
        </span>
    );
    if (score >= 70) return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-700">
            <AlertTriangle className="w-2.5 h-2.5" /> ZAGROŻONE
        </span>
    );
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-green-50 border border-green-200 text-green-700">
            <CheckCircle2 className="w-2.5 h-2.5" /> OK
        </span>
    );
}

export default function JobsReportsPanel() {
    const { jobs } = useJobs();
    const { timeEntries, employees } = useTiCo();
    const { getEntriesByJob } = useJobLog();

    // Report states
    const [selectedJobForReport, setSelectedJobForReport] = useState<any | null>(null);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [onlyApproved, setOnlyApproved] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    const resolveAuthor = useCallback((authorId: string): string => {
        if (!authorId) return 'Nieznany autor';
        const emp = employees.find(
            (e: any) => e.id === authorId || `${e.firstName} ${e.lastName}` === authorId
        );
        if (emp) return `${emp.firstName} ${emp.lastName}`;
        if (/^[0-9a-f-]{20,}$/i.test(authorId)) return 'Pracownik APP';
        return authorId;
    }, [employees]);

    const handleGenerateReport = async () => {
        if (!selectedJobForReport) return;
        const job = selectedJobForReport;
        setIsGenerating(true);
        try {
            // Fetch PWA logs
            const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
            const token = localStorage.getItem('kostiq_token');
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`${baseUrl}/site-logs?jobId=${job.id}`, { headers });
            let pwaLogs: any[] = [];
            if (res.ok) {
                const data = await res.json();
                pwaLogs = Array.isArray(data) ? data : (data.data ?? []);
            }

            // Get internal entries
            const internalLogs = getEntriesByJob(job.id);

            // Merge & format
            const allMerged = [
                ...internalLogs.map(e => ({ ...e, source: 'internal' as const })),
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
            ];

            // Filter
            const filtered = allMerged.filter(e => {
                const d = e.date?.substring(0, 10);
                if (dateFrom && d < dateFrom) return false;
                if (dateTo && d > dateTo) return false;
                if (onlyApproved && !(e as any).isApprovedForReport) return false;
                return true;
            });

            await generateConstructionReport(job, filtered, {
                dateFrom,
                dateTo,
                onlyApproved,
                resolveAuthor,
                saveToServer: true,
                entryCount: filtered.length
            });

            toast.success('Raport PDF został pomyślnie wygenerowany i pobrany.');
            setSelectedJobForReport(null);
        } catch (error) {
            console.error('Failed to generate report', error);
            toast.error('Błąd podczas generowania raportu PDF.');
        } finally {
            setIsGenerating(false);
        }
    };

    const activeJobs = useMemo(() => {
        return jobs
            .filter(j => (j.status as string) === 'active' || (j.status as string) === 'in_progress' || (j.status as string) === 'inProgress')
            .map(job => {
                // Planned budget
                const plannedMaterials = job.materialsPlannedNet || 0;
                const plannedLabor = job.laborPlannedNet || 0;
                const plannedLogistics = job.logisticsPlannedNet || 0;
                const plannedOther = (job as any).otherCostsNet || 0;
                const plannedTotal = plannedMaterials + plannedLabor + plannedLogistics + plannedOther;

                // Actual costs from expenses
                const expenses = (job as any).expenses || [];
                const actualMaterials = expenses.filter((e: any) => e.category === 'material').reduce((s: number, e: any) => s + (e.amountNet || 0), 0);
                const actualTransport = expenses.filter((e: any) => e.category === 'transport').reduce((s: number, e: any) => s + (e.amountNet || 0), 0);
                const actualEquipment = expenses.filter((e: any) => e.category === 'equipment').reduce((s: number, e: any) => s + (e.amountNet || 0), 0);
                const actualOther = expenses.filter((e: any) => e.category === 'other').reduce((s: number, e: any) => s + (e.amountNet || 0), 0);

                // Labor from time entries
                const jobEntries = timeEntries.filter(e => e.jobId === job.id);
                const actualLaborCost = jobEntries.reduce((s, e) => s + (e.cost || 0), 0);
                const actualLaborHours = jobEntries.reduce((s, e) => s + (e.hours || 0), 0);

                const actualTotal = actualMaterials + actualLaborCost + actualTransport + actualEquipment + actualOther;

                // Revenue & margin
                const revenue = job.actualRevenue || job.totalPlannedRevenueNet || 0;
                const plannedMarginPct = revenue > 0 && plannedTotal > 0 ? ((revenue - plannedTotal) / revenue) * 100 : 0;
                const currentMarginPct = revenue > 0 ? ((revenue - actualTotal) / revenue) * 100 : 0;
                const budgetUsedPct = plannedTotal > 0 ? (actualTotal / plannedTotal) * 100 : 0;

                // Risk score = max of budget % used (higher = worse)
                const riskScore = budgetUsedPct;

                return {
                    id: job.id, name: job.name,
                    code: job.jobCode || '',
                    clientName: job.clientName || '',
                    plannedTotal, actualTotal, revenue,
                    plannedMaterials, actualMaterials,
                    plannedLabor, actualLaborCost,
                    actualLaborHours,
                    plannedMarginPct, currentMarginPct,
                    budgetUsedPct, riskScore,
                };
            })
            // Sort by risk descending (most dangerous first)
            .sort((a, b) => b.riskScore - a.riskScore);
    }, [jobs, timeEntries]);

    const critical = activeJobs.filter(j => j.riskScore >= 90).length;
    const warning = activeJobs.filter(j => j.riskScore >= 70 && j.riskScore < 90).length;
    const ok = activeJobs.filter(j => j.riskScore < 70).length;

    return (
        <div className="space-y-6">
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-zinc-200/60">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">Aktywne zlecenia</p>
                    <p className="text-3xl font-black text-zinc-950 mt-1">{activeJobs.length}</p>
                </div>
                <div className="bg-red-50/40 rounded-2xl p-5 border border-red-200">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-red-550">Krytyczne (&gt;90%)</p>
                    <p className="text-3xl font-black text-red-700 mt-1 flex items-center gap-2">
                        {critical} <Flame className="w-6 h-6 text-red-500" />
                    </p>
                </div>
                <div className="bg-amber-50/40 rounded-2xl p-5 border border-amber-200">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-amber-600">Zagrożone (70–90%)</p>
                    <p className="text-3xl font-black text-amber-700 mt-1 flex items-center gap-2">
                        {warning} <AlertTriangle className="w-6 h-6 text-amber-500" />
                    </p>
                </div>
                <div className="bg-emerald-50/40 rounded-2xl p-5 border border-emerald-200">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-600">Pod kontrolą</p>
                    <p className="text-3xl font-black text-emerald-700 mt-1 flex items-center gap-2">
                        {ok} <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    </p>
                </div>
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-3 bg-zinc-50 border border-zinc-200/60 rounded-2xl px-5 py-4">
                <ArrowUpDown className="w-4 h-4 text-zinc-550 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-zinc-800 font-medium">
                    Zlecenia posortowane <strong>od najbardziej zagrożonych</strong>. Burn Rate = % wykorzystania budżetu.
                    Czerwony pasek oznacza przekroczenie 90% planu — ryzyko straty.
                </p>
            </div>

            {/* Cards */}
            {activeJobs.length === 0 ? (
                <div className="bg-white rounded-2xl border border-zinc-200/60 p-12 text-center text-zinc-400">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-zinc-200" />
                    <p className="font-medium">Brak aktywnych zleceń</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {activeJobs.map(job => {
                        const marginDelta = job.currentMarginPct - job.plannedMarginPct;
                        return (
                            <div key={job.id}
                                className={`bg-white rounded-2xl border overflow-hidden ${job.riskScore >= 90 ? 'border-red-300' : job.riskScore >= 70 ? 'border-amber-300' : 'border-zinc-200/60'}`}>
                                <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200/60">
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <RiskBadge score={job.riskScore} />
                                            <span className="font-bold text-zinc-950">{job.name}</span>
                                            {job.code && <span className="text-xs text-zinc-400">{job.code}</span>}
                                        </div>
                                        <p className="text-xs text-zinc-400 mt-0.5">{job.clientName}</p>
                                    </div>
                                    <div className="flex items-center gap-4 sm:gap-6 text-sm flex-wrap sm:flex-nowrap">
                                        {/* Margin comparison */}
                                        <div className="text-right">
                                            <p className="text-[10px] text-zinc-400 uppercase tracking-wide">Marża teraz</p>
                                            <p className={`font-black text-lg ${job.currentMarginPct >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                                {pct(job.currentMarginPct)}
                                            </p>
                                        </div>
                                        <div className="text-right border-r pr-4 border-zinc-200">
                                            <p className="text-[10px] text-zinc-400 uppercase tracking-wide">Delta vs plan</p>
                                            <p className={`font-bold flex items-center gap-1 ${marginDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {marginDelta >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                                {marginDelta >= 0 ? '+' : ''}{pct(marginDelta)}
                                            </p>
                                        </div>

                                        {/* Generate report button */}
                                        <button
                                            onClick={() => {
                                                const matchingJobObj = jobs.find(j => j.id === job.id);
                                                setSelectedJobForReport(matchingJobObj || job);
                                            }}
                                            className="flex items-center gap-1.5 bg-zinc-950 text-white hover:bg-zinc-800 px-3 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shadow-zinc-950/10"
                                            title="Generuj zbiorczy raport PDF dla tego zlecenia"
                                        >
                                            <FileDown className="w-3.5 h-3.5" />
                                            <span>Raport</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <BurnBar
                                        used={job.actualMaterials}
                                        total={job.plannedMaterials}
                                        label="Materiały" />
                                    <BurnBar
                                        used={job.actualLaborCost}
                                        total={job.plannedLabor}
                                        label="Robocizna" />
                                </div>
                                <div className="px-6 pb-4 flex items-center justify-between text-xs text-zinc-550 border-t border-zinc-100 pt-3">
                                    <span>Robocizna: <strong className="text-zinc-800">{job.actualLaborHours.toFixed(1)} h</strong> przepracowane</span>
                                    <span>Budżet: <strong className="text-zinc-800">{fmt(job.actualTotal)}</strong> / {fmt(job.plannedTotal)}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Consolidated Report Config Modal */}
            {selectedJobForReport && (
                <UIModal
                    isOpen={!!selectedJobForReport}
                    onClose={() => setSelectedJobForReport(null)}
                    title={`Generuj zbiorczy raport — ${selectedJobForReport.jobCode || selectedJobForReport.code}`}
                >
                    <div className="space-y-5 text-sm">
                        <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4 text-teal-800 text-xs">
                            System wygeneruje i pobierze zbiorczy raport dziennika budowy (PDF) dla zlecenia <strong>{selectedJobForReport.name}</strong> oraz automatycznie zarchiwizuje go w systemie.
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Data od (opcjonalnie)</label>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={e => setDateFrom(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Data do (opcjonalnie)</label>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={e => setDateTo(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Opcje raportu</label>
                            <label className="flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer hover:bg-gray-50 border-gray-200 transition-all">
                                <input
                                    type="checkbox"
                                    checked={onlyApproved}
                                    onChange={e => setOnlyApproved(e.target.checked)}
                                    className="w-4 h-4 text-teal-650 rounded border-gray-300 focus:ring-teal-500"
                                />
                                <div>
                                    <div className="font-semibold text-gray-800 text-sm">Tylko zatwierdzone wpisy</div>
                                    <div className="text-xs text-gray-400">Dołącz wyłącznie wpisy oznaczone jako "Kandydat do raportu"</div>
                                </div>
                            </label>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                            <Button variant="secondary" onClick={() => setSelectedJobForReport(null)} disabled={isGenerating}>
                                Anuluj
                            </Button>
                            <Button onClick={handleGenerateReport} disabled={isGenerating} className="bg-zinc-950 hover:bg-zinc-800 text-white font-semibold">
                                {isGenerating ? 'Generowanie...' : 'Generuj i pobierz raport'}
                            </Button>
                        </div>
                    </div>
                </UIModal>
            )}
        </div>
    );
}
