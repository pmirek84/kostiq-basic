import { useMemo } from 'react';
import { useJobs } from '../../context/JobsContext';
import { useTiCo } from '../../context/TiCoContext';
import {
    TrendingUp, TrendingDown, CheckCircle2, Download,
    Award, AlertCircle
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer
} from 'recharts';

const fmt = (v: number) => v.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 });
const pct = (v: number) => `${v.toFixed(1)}%`;

// ─── Margin area chart (last 12 closed jobs) ────────
const MarginTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white rounded-xl shadow-xl border border-slate-100 px-4 py-3 text-sm">
            <p className="font-bold text-slate-700">{payload[0]?.payload?.name}</p>
            <p className="text-emerald-600 font-semibold">{pct(payload[0]?.value)} marży</p>
        </div>
    );
};

export default function ClosedJobsReportPanel() {
    const { jobs } = useJobs();
    const { timeEntries } = useTiCo();

    const closedJobs = useMemo(() => {
        return jobs
            .filter(j => ['done', 'completed', 'closed'].includes(j.status as string))
            .map(job => {
                const revenue = job.actualRevenue || job.totalPlannedRevenueNet || 0;
                const plannedTotal = (job.materialsPlannedNet || 0)
                    + (job.laborPlannedNet || 0)
                    + (job.logisticsPlannedNet || 0)
                    + ((job as any).otherCostsNet || 0);

                const expenses = (job as any).expenses || [];
                const actualMaterials = expenses.filter((e: any) => e.category === 'material').reduce((s: number, e: any) => s + (e.amountNet || 0), 0);
                const actualTransport = expenses.filter((e: any) => e.category === 'transport').reduce((s: number, e: any) => s + (e.amountNet || 0), 0);
                const actualEquipment = expenses.filter((e: any) => e.category === 'equipment').reduce((s: number, e: any) => s + (e.amountNet || 0), 0);
                const actualOtherExp = expenses.filter((e: any) => e.category === 'other').reduce((s: number, e: any) => s + (e.amountNet || 0), 0);

                const jobEntries = timeEntries.filter(e => e.jobId === job.id);
                const actualLaborHours = jobEntries.reduce((s, e) => s + (e.hours || 0), 0);
                const actualLaborCost = jobEntries.reduce((s, e) => s + (e.cost || 0), 0);
                const plannedLaborHours = (job.laborPlannedNet || 0) / 80; // estimate from cost

                const actualTotal = actualMaterials + actualLaborCost + actualTransport + actualEquipment + actualOtherExp;

                const plannedMargin = revenue - plannedTotal;
                const actualMargin = revenue - actualTotal;
                const plannedMarginPct = revenue > 0 ? (plannedMargin / revenue) * 100 : 0;
                const actualMarginPct = revenue > 0 ? (actualMargin / revenue) * 100 : 0;
                const deviationPct = actualMarginPct - plannedMarginPct;
                const laborAccuracy = plannedLaborHours > 0
                    ? ((actualLaborHours - plannedLaborHours) / plannedLaborHours) * 100
                    : 0;

                return {
                    id: job.id, name: job.name,
                    code: job.jobCode || '',
                    clientName: job.clientName || '',
                    closedAt: (job as any).closedAt || job.updatedAt || '',
                    revenue, plannedTotal, actualTotal,
                    actualLaborCost, actualMaterials,
                    plannedMargin, actualMargin,
                    plannedMarginPct, actualMarginPct,
                    deviationPct, actualLaborHours,
                    plannedLaborHours, laborAccuracy,
                };
            })
            .sort((a, b) => b.actualMarginPct - a.actualMarginPct);
    }, [jobs, timeEntries]);

    // Aggregate KPIs
    const totalRevenue = closedJobs.reduce((s, j) => s + j.revenue, 0);
    const totalActualCost = closedJobs.reduce((s, j) => s + j.actualTotal, 0);
    const totalActualMargin = totalRevenue - totalActualCost;
    const avgMarginPct = totalRevenue > 0 ? (totalActualMargin / totalRevenue) * 100 : 0;
    const totalPlannedCost = closedJobs.reduce((s, j) => s + j.plannedTotal, 0);

    // Chart data — last 12 closed jobs (reverse for chronological)
    const chartData = [...closedJobs].reverse().slice(-12).map(j => ({
        name: j.code || j.name.substring(0, 14),
        margin: parseFloat(j.actualMarginPct.toFixed(1)),
    }));

    const handleExportCSV = () => {
        if (!closedJobs.length) return;
        const BOM = '\uFEFF';
        const headers = ['Zlecenie;Kod;Klient;Przychód;Koszty Plan;Koszty Rzecz.;Marża Plan;Marża Rzecz.;Odchyl.(p.p.);Godz.Plan;Godz.Rzecz.'];
        const rows = closedJobs.map(j => [
            j.name, j.code, j.clientName,
            j.revenue.toFixed(2), j.plannedTotal.toFixed(2), j.actualTotal.toFixed(2),
            j.plannedMargin.toFixed(2), j.actualMargin.toFixed(2), j.deviationPct.toFixed(1),
            j.plannedLaborHours.toFixed(1), j.actualLaborHours.toFixed(1),
        ].join(';'));
        const blob = new Blob([BOM + headers.join('\n') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', `post-mortem_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-lg font-black text-slate-900">Post-mortem & ROI</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Analiza zamkniętych zleceń — gdzie zarabiamy, a gdzie tracimy</p>
                </div>
                <button onClick={handleExportCSV} disabled={!closedJobs.length}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-40">
                    <Download className="w-4 h-4" /> Eksport CSV
                </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Zamknięte</p>
                    <p className="text-3xl font-black text-slate-900 mt-1">{closedJobs.length}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Łączny przychód</p>
                    <p className="text-xl font-black text-slate-900 mt-1">{fmt(totalRevenue)}</p>
                </div>
                <div className={`rounded-2xl p-5 border shadow-sm text-center ${totalActualMargin >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Zysk netto (Σ)</p>
                    <p className={`text-xl font-black mt-1 ${totalActualMargin >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmt(totalActualMargin)}</p>
                </div>
                <div className={`rounded-2xl p-5 border shadow-sm text-center ${avgMarginPct >= 18 ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Śr. marża</p>
                    <p className={`text-3xl font-black mt-1 ${avgMarginPct >= 18 ? 'text-emerald-700' : 'text-amber-700'}`}>{pct(avgMarginPct)}</p>
                    <p className="text-[10px] text-slate-400 mt-1">próg &gt;18%</p>
                </div>
            </div>

            {/* Margin trend chart */}
            {chartData.length > 1 && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-5">
                        Marża na zamkniętych zleceniach (chronologicznie)
                    </h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                            <defs>
                                <linearGradient id="marginGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit="%" domain={['auto', 'auto']} />
                            <Tooltip content={<MarginTooltip />} />
                            <Area type="monotone" dataKey="margin" stroke="#10b981" strokeWidth={2.5}
                                fill="url(#marginGrad)" dot={{ r: 4, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
                            <tr>
                                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide">Zlecenie</th>
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">Przychód</th>
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">Koszty Plan</th>
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">Koszty Rzecz.</th>
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">Marża Rzecz.</th>
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">Δ Marża</th>
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">Godz. +/-</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {closedJobs.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-16 text-center text-slate-400">
                                        <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                                        <p className="font-medium">Brak zamkniętych zleceń</p>
                                        <p className="text-xs mt-1">Zamknij zlecenie, aby zobaczyć raport końcowy.</p>
                                    </td>
                                </tr>
                            ) : closedJobs.map(job => (
                                <tr key={job.id} className="hover:bg-slate-50/60 transition-colors">
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-start gap-2">
                                            {job.actualMarginPct >= 20 ?
                                                <Award className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" /> :
                                                job.actualMarginPct < 10 ?
                                                    <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" /> :
                                                    <div className="w-4" />
                                            }
                                            <div>
                                                <div className="font-semibold text-slate-900 text-sm">{job.name}</div>
                                                <div className="text-[11px] text-slate-400">{job.code} · {job.clientName}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3.5 text-right font-semibold text-slate-800">{fmt(job.revenue)}</td>
                                    <td className="px-4 py-3.5 text-right text-slate-500">{fmt(job.plannedTotal)}</td>
                                    <td className={`px-4 py-3.5 text-right font-medium ${job.actualTotal > job.plannedTotal ? 'text-red-600' : 'text-slate-700'}`}>
                                        {fmt(job.actualTotal)}
                                    </td>
                                    <td className={`px-4 py-3.5 text-right font-bold ${job.actualMarginPct >= 18 ? 'text-emerald-700' : job.actualMarginPct >= 0 ? 'text-amber-700' : 'text-red-700'}`}>
                                        {fmt(job.actualMargin)}
                                        <span className="text-xs ml-1 font-normal">({pct(job.actualMarginPct)})</span>
                                    </td>
                                    <td className={`px-4 py-3.5 text-right font-bold ${job.deviationPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                        <span className="flex items-center justify-end gap-1">
                                            {job.deviationPct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                            {job.deviationPct >= 0 ? '+' : ''}{pct(job.deviationPct)}
                                        </span>
                                    </td>
                                    <td className={`px-4 py-3.5 text-right text-sm ${Math.abs(job.laborAccuracy) > 20 ? 'font-bold text-red-600' : 'text-slate-500'}`}>
                                        {job.actualLaborHours.toFixed(0)}h
                                        {job.plannedLaborHours > 0 && (
                                            <span className="text-xs ml-1">
                                                ({job.laborAccuracy >= 0 ? '+' : ''}{job.laborAccuracy.toFixed(0)}%)
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        {closedJobs.length > 0 && (
                            <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-sm">
                                <tr>
                                    <td className="px-5 py-3 text-slate-700">RAZEM</td>
                                    <td className="px-4 py-3 text-right text-slate-800">{fmt(totalRevenue)}</td>
                                    <td className="px-4 py-3 text-right text-slate-600">{fmt(totalPlannedCost)}</td>
                                    <td className="px-4 py-3 text-right text-slate-700">{fmt(totalActualCost)}</td>
                                    <td className={`px-4 py-3 text-right ${totalActualMargin >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                        {fmt(totalActualMargin)} <span className="font-normal text-xs">({pct(avgMarginPct)})</span>
                                    </td>
                                    <td colSpan={2} className="px-4 py-3 text-right text-slate-400">—</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
