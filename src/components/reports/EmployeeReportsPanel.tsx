import { useState, useMemo } from 'react';
import { Users, Clock, DollarSign, TrendingUp, Calendar, ChevronDown, User } from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Cell
} from 'recharts';
import { useTiCo } from '../../context/TiCoContext';
import { useJobs } from '../../context/JobsContext';

// ─── helpers ──────────────────────────────────────────
const fmt = (v: number) => v.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 });
const COLORS = ['#21808D', '#0ea5e9', '#71717a', '#a1a1aa', '#d4d4d8'];

function monthOptions() {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        opts.push({
            value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: d.toLocaleDateString('pl-PL', { year: 'numeric', month: 'long' })
        });
    }
    return opts;
}

function KpiCard({ label, value, sub, icon: Icon }:
    { label: string; value: string; sub?: string; icon: any }) {
    return (
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/60 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-zinc-50 border border-zinc-200/50 text-[#21808D]">
                <Icon className="w-5 h-5" />
            </div>
            <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">{label}</p>
                <p className="text-xl font-black text-zinc-950 mt-0.5">{value}</p>
                {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

// ─── Custom Tooltip ────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white rounded-xl shadow-lg border border-zinc-200/60 px-4 py-3 text-xs leading-relaxed">
            <p className="font-bold text-zinc-900 mb-1">{label}</p>
            <p className="text-zinc-700"><span className="font-semibold text-[#21808D]">{payload[0]?.value?.toFixed(1)} h</span> przepracowane</p>
            <p className="text-zinc-700"><span className="font-semibold text-emerald-600">{fmt(payload[1]?.value ?? 0)}</span> koszt</p>
        </div>
    );
};

// ─── MAIN ──────────────────────────────────────────────
export default function EmployeeReportsPanel() {
    const { employees, timeEntries } = useTiCo();
    const { jobs } = useJobs();

    const months = useMemo(() => monthOptions(), []);
    const [selectedMonth, setSelectedMonth] = useState(months[0].value);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('all');

    // Build per-employee stats for selected month
    const stats = useMemo(() => {
        const [year, month] = selectedMonth.split('-').map(Number);
        const from = new Date(year, month - 1, 1);
        const to = new Date(year, month, 0, 23, 59, 59);

        const filtered = timeEntries.filter(e => {
            const d = new Date(e.date || e.createdAt);
            return d >= from && d <= to;
        });

        return employees.map(emp => {
            const empEntries = filtered.filter(e =>
                e.employeeId === emp.id || (e as any).employee_id === emp.id
            );
            const totalHours = empEntries.reduce((s, e) => s + (e.hours || 0), 0);
            const rate = emp.hourlyRate || (emp as any).rate || 50;
            const totalCost = empEntries.reduce((s, e) => s + (e.cost || e.hours * rate || 0), 0);
            const jobSet = new Set(empEntries.map(e => e.jobId || (e as any).project_id).filter(Boolean));

            return {
                id: emp.id,
                name: `${emp.firstName} ${emp.lastName}`,
                role: emp.role || 'worker',
                totalHours,
                totalCost,
                jobCount: jobSet.size,
                rate,
            };
        }).filter(e => e.totalHours > 0)
            .sort((a, b) => b.totalHours - a.totalHours);
    }, [employees, timeEntries, selectedMonth]);

    // Per-job breakdown for selected employee
    const selectedEmpStats = useMemo(() => {
        if (selectedEmployeeId === 'all') return null;
        const [year, month] = selectedMonth.split('-').map(Number);
        const from = new Date(year, month - 1, 1);
        const to = new Date(year, month, 0, 23, 59, 59);

        const empEntries = timeEntries.filter(e => {
            const d = new Date(e.date || e.createdAt);
            return d >= from && d <= to &&
                (e.employeeId === selectedEmployeeId || (e as any).employee_id === selectedEmployeeId);
        });

        // Group by jobId
        const byJob = new Map<string, { hours: number; cost: number }>();
        empEntries.forEach(e => {
            const jid = e.jobId || (e as any).project_id || 'unknown';
            const cur = byJob.get(jid) || { hours: 0, cost: 0 };
            byJob.set(jid, { hours: cur.hours + (e.hours || 0), cost: cur.cost + (e.cost || 0) });
        });

        return Array.from(byJob.entries()).map(([jid, data]) => {
            const job = jobs.find(j => j.id === jid);
            return { jobId: jid, jobName: job?.name || jid, jobCode: job?.jobCode || '', ...data };
        }).sort((a, b) => b.hours - a.hours);
    }, [selectedEmployeeId, selectedMonth, timeEntries, jobs]);

    const displayStats = selectedEmployeeId === 'all' ? stats : stats.filter(e => e.id === selectedEmployeeId);
    const top5 = stats.slice(0, 5);

    const totalHours = displayStats.reduce((s, e) => s + e.totalHours, 0);
    const totalCost = displayStats.reduce((s, e) => s + e.totalCost, 0);
    const avgHours = stats.length ? (stats.reduce((s, e) => s + e.totalHours, 0) / stats.length) : 0;
    const avgCostPerHour = totalHours > 0 ? totalCost / totalHours : 0;

    const chartData = top5.map(e => ({
        name: e.name.split(' ')[0],
        fullName: e.name,
        hours: e.totalHours,
        cost: e.totalCost,
    }));

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
                {/* Month picker */}
                <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <select
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        className="pl-9 pr-8 py-2.5 text-sm font-medium bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-300 appearance-none cursor-pointer">
                        {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                </div>
                {/* Employee picker */}
                <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <select
                        value={selectedEmployeeId}
                        onChange={e => setSelectedEmployeeId(e.target.value)}
                        className="pl-9 pr-8 py-2.5 text-sm font-medium bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-300 appearance-none cursor-pointer min-w-[200px]">
                        <option value="all">— Wszyscy pracownicy —</option>
                        {stats.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                </div>
                <span className="text-sm text-zinc-500">{stats.length} aktywnych pracowników w tym miesiącu</span>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard icon={Clock} label="Łączne godziny" value={`${totalHours.toFixed(0)} h`} sub="w wybranym miesiącu" />
                <KpiCard icon={DollarSign} label="Łączny koszt" value={fmt(totalCost)} sub="robocizna" />
                <KpiCard icon={TrendingUp} label="Śr. godz./os." value={`${avgHours.toFixed(1)} h`} sub="na pracownika" />
                <KpiCard icon={Users} label="Koszt / godz." value={`${avgCostPerHour.toFixed(0)} PLN`} sub="średnia stawka" />
            </div>

            {/* Chart + Table */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* Bar chart */}
                <div className="bg-white rounded-2xl border border-zinc-200/60 p-6">
                    <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-6">
                        Top 5 — Obciążenie pracowników (h)
                    </h3>
                    {chartData.length === 0 ? (
                        <div className="flex items-center justify-center h-48 text-zinc-400 text-sm">
                            Brak danych w wybranym miesiącu
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                                <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 600, fill: '#71717a' }} />
                                <YAxis tick={{ fontSize: 11, fill: '#a1a1aa' }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="hours" radius={[6, 6, 0, 0]} maxBarSize={52}>
                                    {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Bar>
                                <Bar dataKey="cost" radius={[6, 6, 0, 0]} maxBarSize={52} hide />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Table — switches between all-employees view and per-job drill-down */}
                <div className="bg-white rounded-2xl border border-zinc-200/60 overflow-hidden">
                    <div className="px-6 py-4 border-b border-zinc-200/60 flex items-center justify-between">
                        <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400">
                            {selectedEmployeeId === 'all' ? 'Szczegóły pracowników' : `Zlecenia — ${displayStats[0]?.name ?? ''}`}
                        </h3>
                        {selectedEmployeeId !== 'all' && (
                            <button onClick={() => setSelectedEmployeeId('all')}
                                className="text-xs text-zinc-950 hover:text-zinc-600 font-bold">
                                ← Wszyscy
                            </button>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        {selectedEmployeeId === 'all' ? (
                            /* ALL EMPLOYEES TABLE */
                            <table className="w-full text-sm">
                                <thead className="bg-zinc-50/50 border-b border-zinc-200/60">
                                    <tr>
                                        <th className="px-5 py-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-wide">Pracownik</th>
                                        <th className="px-4 py-3 text-right text-xs font-bold text-zinc-500 uppercase tracking-wide">Godziny</th>
                                        <th className="px-4 py-3 text-right text-xs font-bold text-zinc-500 uppercase tracking-wide">Koszt</th>
                                        <th className="px-4 py-3 text-right text-xs font-bold text-zinc-500 uppercase tracking-wide">Zlec.</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                    {stats.length === 0 ? (
                                        <tr><td colSpan={4} className="px-5 py-10 text-center text-zinc-400">Brak danych — wybierz inny miesiąc</td></tr>
                                    ) : stats.map((e, idx) => (
                                        <tr key={e.id}
                                            onClick={() => setSelectedEmployeeId(e.id)}
                                            className="hover:bg-zinc-50/80 cursor-pointer transition-colors">
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-900 flex items-center justify-center text-[11px] font-bold flex-shrink-0 border border-zinc-200/40">
                                                        {idx + 1}
                                                    </div>
                                                    <span className="font-medium text-zinc-900 text-sm">{e.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-zinc-800">{e.totalHours.toFixed(1)} h</td>
                                            <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmt(e.totalCost)}</td>
                                            <td className="px-4 py-3 text-right text-zinc-500">{e.jobCount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                {stats.length > 0 && (
                                    <tfoot className="bg-zinc-50/50 border-t border-zinc-200/60 font-bold">
                                        <tr>
                                            <td className="px-5 py-3 text-zinc-700 text-sm">RAZEM</td>
                                            <td className="px-4 py-3 text-right text-zinc-800">{totalHours.toFixed(1)} h</td>
                                            <td className="px-4 py-3 text-right text-emerald-700">{fmt(totalCost)}</td>
                                            <td className="px-4 py-3 text-right text-zinc-500">—</td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        ) : (
                            /* PER-JOB DRILL-DOWN TABLE */
                            <table className="w-full text-sm">
                                <thead className="bg-zinc-50/50 border-b border-zinc-200/60">
                                    <tr>
                                        <th className="px-5 py-3 text-left text-xs font-bold text-zinc-500 uppercase tracking-wide">Zlecenie</th>
                                        <th className="px-4 py-3 text-right text-xs font-bold text-zinc-500 uppercase tracking-wide">Godziny</th>
                                        <th className="px-4 py-3 text-right text-xs font-bold text-zinc-500 uppercase tracking-wide">Koszt robocizny</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                    {!selectedEmpStats || selectedEmpStats.length === 0 ? (
                                        <tr><td colSpan={3} className="px-5 py-10 text-center text-zinc-400">Brak wpisów godzinowych w tym miesiącu</td></tr>
                                    ) : selectedEmpStats.map(j => (
                                        <tr key={j.jobId} className="hover:bg-zinc-50/50">
                                            <td className="px-5 py-3">
                                                <p className="font-medium text-zinc-900">{j.jobName}</p>
                                                {j.jobCode && <p className="text-[11px] text-zinc-400">{j.jobCode}</p>}
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold text-zinc-800">{j.hours.toFixed(1)} h</td>
                                            <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmt(j.cost)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                {selectedEmpStats && selectedEmpStats.length > 0 && (
                                    <tfoot className="bg-zinc-50/50 border-t border-zinc-200/60 font-bold">
                                        <tr>
                                            <td className="px-5 py-3 text-zinc-700 text-sm">RAZEM</td>
                                            <td className="px-4 py-3 text-right text-zinc-800">
                                                {selectedEmpStats.reduce((s, e) => s + e.hours, 0).toFixed(1)} h
                                            </td>
                                            <td className="px-4 py-3 text-right text-emerald-700">
                                                {fmt(selectedEmpStats.reduce((s, e) => s + e.cost, 0))}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
