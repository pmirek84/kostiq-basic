import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Target, HelpCircle, BarChart2 } from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';
import { useJobs } from '../../context/JobsContext';
import { useTiCo } from '../../context/TiCoContext';

const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

// ── Deviation bar ──────────────────────────────────
function DeviationBar({ value, max }: { value: number; max: number }) {
    const abs = Math.abs(value);
    const ratio = max > 0 ? Math.min((abs / max) * 100, 100) : 0;
    const isOver = value > 0;
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden flex">
                {isOver ? (
                    <>
                        <div className="h-full bg-slate-100 flex-1" />
                        <div className="h-full bg-red-400 rounded-r-full" style={{ width: `${ratio / 2}%` }} />
                    </>
                ) : (
                    <>
                        <div className="h-full bg-emerald-400 rounded-l-full ml-auto" style={{ width: `${ratio / 2}%` }} />
                        <div className="flex-1 h-full bg-slate-100" />
                    </>
                )}
            </div>
        </div>
    );
}

// ── Bottleneck row ─────────────────────────────────
function BottleneckRow({ rank, label, count, avgDev, frequency, maxDev }:
    { rank: number; label: string; count: number; avgDev: number; frequency: number; maxDev: number }) {
    const isCritical = avgDev > 20;
    return (
        <tr className={`hover:bg-slate-50/60 transition-colors ${isCritical ? 'bg-red-50/40' : ''}`}>
            <td className="px-4 py-3.5">
                <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black flex-shrink-0 ${isCritical ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                        {rank}
                    </div>
                    <div>
                        <p className="font-semibold text-slate-900 text-sm">{label}</p>
                        <p className="text-[10px] text-slate-400">{count} zleceń z przekroczeniem</p>
                    </div>
                </div>
            </td>
            <td className="px-4 py-3.5 text-right">
                <span className={`text-sm font-black ${isCritical ? 'text-red-700' : 'text-amber-700'}`}>
                    {pct(avgDev)}
                </span>
            </td>
            <td className="px-4 py-3.5">
                <DeviationBar value={avgDev} max={maxDev} />
            </td>
            <td className="px-4 py-3.5 text-right text-sm font-semibold text-slate-600">
                {frequency.toFixed(0)}%
                <span className="text-[10px] font-normal text-slate-400 ml-1">zleceń</span>
            </td>
        </tr>
    );
}

// ── MAIN ──────────────────────────────────────────
export default function DifficultyReportsPanel() {
    const { jobs } = useJobs();
    const { timeEntries } = useTiCo();

    // ── Per-job: plan hours vs actual hours ─────────
    const jobDeviations = useMemo(() => {
        return jobs
            .filter(j => j.laborPlannedNet && j.laborPlannedNet > 0)
            .map(job => {
                const plannedHours = (job.laborPlannedNet || 0) / 80; // estimate: avg 80 PLN/h
                const jobEntries = timeEntries.filter(e => e.jobId === job.id);
                const actualHours = jobEntries.reduce((s, e) => s + (e.hours || 0), 0);
                if (actualHours === 0) return null;

                const deviationPct = ((actualHours - plannedHours) / plannedHours) * 100;
                const tags = (job as any).tags || [];
                const jobType = (job as any).type || (job.name.includes('hala') ? 'Hala' :
                    job.name.includes('dom') ? 'Dom' :
                        job.name.includes('okno') || job.name.includes('okna') ? 'Okna' :
                            'Inne');
                return {
                    id: job.id, name: job.name,
                    code: job.jobCode || '',
                    plannedHours, actualHours, deviationPct,
                    jobType, tags,
                    difficulty: (job as any).difficulty || null,
                    isOverrun: deviationPct > 20,
                };
            })
            .filter(Boolean) as any[];
    }, [jobs, timeEntries]) as any[];

    // ── Group by job type: find bottlenecks ────────
    const bottlenecks = useMemo(() => {
        const typeMap = new Map<string, { deviations: number[]; total: number }>();

        jobDeviations.forEach((job: any) => {
            const type = job.jobType;
            if (!typeMap.has(type)) typeMap.set(type, { deviations: [], total: 0 });
            const grp = typeMap.get(type)!;
            grp.deviations.push(job.deviationPct);
            grp.total++;
        });

        return Array.from(typeMap.entries())
            .map(([label, data]) => {
                const overruns = data.deviations.filter(d => d > 20);
                const avgDev = data.deviations.reduce((s, v) => s + v, 0) / data.deviations.length;
                return {
                    label,
                    count: overruns.length,
                    total: data.total,
                    avgDev,
                    frequency: data.total > 0 ? (overruns.length / data.total) * 100 : 0,
                };
            })
            .filter(b => b.count > 0 || b.avgDev > 5)
            .sort((a, b) => b.avgDev - a.avgDev);
    }, [jobDeviations]);

    const maxDev = Math.max(...bottlenecks.map(b => b.avgDev), 1);

    // ── Radar chart — difficulty vs deviation ──────
    const difficultyData = useMemo(() => {
        const grp = new Map<number, number[]>();
        jobDeviations.forEach((j: any) => {
            if (j.difficulty == null) return;
            if (!grp.has(j.difficulty)) grp.set(j.difficulty, []);
            grp.get(j.difficulty)!.push(j.deviationPct);
        });
        return Array.from(grp.entries())
            .sort(([a], [b]) => a - b)
            .map(([d, vals]) => ({
                subject: `Trudność ${d}`,
                avgDev: parseFloat((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1)),
                count: vals.length,
            }));
    }, [jobDeviations]);

    // ── Summary stats ──────────────────────────────
    const overrunCount = jobDeviations.filter((j: any) => j.isOverrun).length;
    const overrunRate = jobDeviations.length > 0 ? (overrunCount / jobDeviations.length) * 100 : 0;
    const avgDevAll = jobDeviations.length > 0
        ? jobDeviations.reduce((s: number, j: any) => s + j.deviationPct, 0) / jobDeviations.length : 0;

    return (
        <div className="space-y-6">
            {/* Explanation */}
            <div className="flex items-start gap-3 bg-zinc-50 border border-zinc-200/60 rounded-2xl px-5 py-4">
                <HelpCircle className="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-zinc-700">
                    <strong>Wąskie gardła kalkulacyjne</strong> — zestawienie planu robocizny (z oferty) z rzeczywistym
                    wykonaniem (z terenu). Odchylenie &gt;20% oznacza systematyczny błąd w wycenie tego typu prac.
                </p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl p-5 border border-zinc-200/60">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Zlecenia dane</p>
                    <p className="text-3xl font-black text-zinc-950 mt-1">{jobDeviations.length}</p>
                </div>
                <div className={`rounded-2xl p-5 border ${overrunRate > 40 ? 'bg-red-50/40 border-red-250' : 'bg-white border-zinc-200/60'}`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Przekroczenia &gt;20%</p>
                    <p className={`text-3xl font-black mt-1 ${overrunRate > 40 ? 'text-red-700' : 'text-amber-700'}`}>
                        {overrunCount} <span className="text-sm font-normal">({overrunRate.toFixed(0)}%)</span>
                    </p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-zinc-200/60">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Śr. odchylenie</p>
                    <p className={`text-3xl font-black mt-1 ${avgDevAll > 20 ? 'text-red-700' : avgDevAll > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {pct(avgDevAll)}
                    </p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-zinc-200/60">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Typy z nadwyżką</p>
                    <p className="text-3xl font-black text-zinc-950 mt-1">{bottlenecks.length}</p>
                </div>
            </div>

            {/* Radar + Bottleneck table */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                {/* Radar chart */}
                {difficultyData.length >= 3 && (
                    <div className="xl:col-span-2 bg-white rounded-2xl border border-zinc-200/60 p-6">
                        <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4">
                            Odchylenie wg. Trudności
                        </h3>
                        <ResponsiveContainer width="100%" height={220}>
                            <RadarChart data={difficultyData}>
                                <PolarGrid stroke="#e4e4e7" />
                                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: '#71717a' }} />
                                <Tooltip formatter={(v: any) => [`${v > 0 ? '+' : ''}${v}%`, 'Śr. odchylenie']} />
                                <Radar name="Odchylenie" dataKey="avgDev" stroke="#21808D" fill="#21808D" fillOpacity={0.15} strokeWidth={2} />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* Bottleneck table */}
                <div className={`${difficultyData.length >= 3 ? 'xl:col-span-3' : 'xl:col-span-5'} bg-white rounded-2xl border border-zinc-200/60 overflow-hidden`}>
                    <div className="px-5 py-4 border-b border-zinc-200/60 flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-zinc-400" />
                        <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400">Najczęstsze przekroczenia standardu</h3>
                    </div>
                    {bottlenecks.length === 0 ? (
                        <div className="p-12 text-center text-zinc-400">
                            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-zinc-200" />
                            <p className="font-medium text-sm">Brak istotnych odchyleń</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-zinc-50/50 border-b border-zinc-200/60">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-wide">Typ zlecenia</th>
                                    <th className="px-4 py-3 text-right text-xs font-bold text-zinc-500 uppercase tracking-wide">Śr. przekroczenie</th>
                                    <th className="px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wide">Skala</th>
                                    <th className="px-4 py-3 text-right text-xs font-bold text-zinc-500 uppercase tracking-wide">Częstość</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                                {bottlenecks.map((b, i) => (
                                    <BottleneckRow key={b.label} rank={i + 1}
                                        label={b.label} count={b.count} avgDev={b.avgDev}
                                        frequency={b.frequency} maxDev={maxDev} />
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Per-job detail table */}
            <div className="bg-white rounded-2xl border border-zinc-200/60 overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-200/60 flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400">Szczegóły per zlecenie</h3>
                    <div className="flex items-center gap-3 text-[10px]">
                        <span className="flex items-center gap-1 text-red-600"><AlertTriangle className="w-3.5 h-3.5" /> &gt;20% przekroczenie</span>
                        <span className="flex items-center gap-1 text-emerald-600"><Target className="w-3.5 h-3.5" /> w normie</span>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-zinc-50/50 border-b border-zinc-200/60 text-zinc-500">
                            <tr>
                                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide">Zlecenie</th>
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">Plan godz.</th>
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">Rzeczyw. godz.</th>
                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">Odchylenie</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {jobDeviations.length === 0 ? (
                                <tr><td colSpan={4} className="px-5 py-8 text-center text-zinc-450">Brak danych roboczogodzin do porównania</td></tr>
                            ) : (jobDeviations as any[]).sort((a, b) => b.deviationPct - a.deviationPct).map((job: any) => (
                                <tr key={job.id} className={`hover:bg-zinc-50/60 ${job.isOverrun ? 'bg-red-50/30' : ''}`}>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-2">
                                            {job.isOverrun
                                                ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                                                : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                            }
                                            <div>
                                                <p className="font-medium text-zinc-900 text-sm">{job.name}</p>
                                                <p className="text-[10px] text-zinc-400">{job.code} · {job.jobType}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right text-zinc-600">{job.plannedHours.toFixed(1)} h</td>
                                    <td className="px-4 py-3 text-right font-semibold text-zinc-800">{job.actualHours.toFixed(1)} h</td>
                                    <td className={`px-4 py-3 text-right font-bold ${job.deviationPct > 20 ? 'text-red-700' : job.deviationPct > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                        {pct(job.deviationPct)}
                                        <div className="w-16 ml-auto mt-1 h-1 bg-zinc-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full ${job.deviationPct > 20 ? 'bg-red-400' : job.deviationPct > 0 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                                style={{ width: `${Math.min(Math.abs(job.deviationPct), 100)}%` }} />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
