import { useMemo } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useJobs } from '../../context/JobsContext';
import { useTiCo } from '../../context/TiCoContext';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

const MONTH_LABELS = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];

export function FinancialChart() {
    const { jobs } = useJobs();
    const { timeEntries } = useTiCo();

    // Aggregate real financial data per month for current year
    const { monthlyRevenue, monthlyExpenses, totalRevenue, totalExpenses, prevMonthRevenue, prevMonthExpenses } = useMemo(() => {
        const year = new Date().getFullYear();
        const revenue = new Array(12).fill(0);
        const expenses = new Array(12).fill(0);

        for (const job of jobs) {
            // Revenue: use actualRevenue if available, else revenuePlannedNet for done jobs
            const jobRevenue = job.actualRevenue || (job.status === 'done' ? (job.revenuePlannedNet || 0) : 0);

            // Determine the month from actualStartDate or plannedStartDate
            const dateStr = job.actualStartDate || job.plannedStartDate || job.createdAt;
            if (!dateStr) continue;
            const date = new Date(dateStr);
            if (date.getFullYear() !== year) continue;
            const month = date.getMonth();

            // Add revenue
            revenue[month] += jobRevenue;

            // Expenses: sum from expenses array + labor costs from time entries
            const jobExpenses = (job.expenses || []).reduce((sum, e) => sum + (e.amountNet || 0), 0);

            // Labor costs from approved time entries
            const laborCost = timeEntries
                .filter(te => te.jobId === job.id && (te.status === 'approved' || te.status === 'admin_approved'))
                .reduce((sum, te) => sum + (te.cost || 0), 0);

            expenses[month] += jobExpenses + laborCost;
        }

        // Calculate cumulative sums
        const currentMonth = new Date().getMonth();
        const totalRev = revenue.slice(0, currentMonth + 1).reduce((s, v) => s + v, 0);
        const totalExp = expenses.slice(0, currentMonth + 1).reduce((s, v) => s + v, 0);
        const prevRev = currentMonth > 0 ? revenue[currentMonth - 1] : 0;
        const prevExp = currentMonth > 0 ? expenses[currentMonth - 1] : 0;

        return {
            monthlyRevenue: revenue,
            monthlyExpenses: expenses,
            totalRevenue: totalRev,
            totalExpenses: totalExp,
            prevMonthRevenue: prevRev,
            prevMonthExpenses: prevExp
        };
    }, [jobs, timeEntries]);

    // Show only months up to current + 1
    const currentMonth = new Date().getMonth();
    const visibleMonths = Math.min(currentMonth + 2, 12);
    const labels = MONTH_LABELS.slice(0, visibleMonths);
    const revData = monthlyRevenue.slice(0, visibleMonths);
    const expData = monthlyExpenses.slice(0, visibleMonths);

    // Calculate current month change %
    const currentRev = monthlyRevenue[currentMonth] || 0;
    const currentExp = monthlyExpenses[currentMonth] || 0;
    const revChange = prevMonthRevenue > 0 ? ((currentRev - prevMonthRevenue) / prevMonthRevenue) * 100 : 0;
    const expChange = prevMonthExpenses > 0 ? ((currentExp - prevMonthExpenses) / prevMonthExpenses) * 100 : 0;

    const fmt = (val: number) => {
        if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M zł`;
        if (val >= 1000) return `${(val / 1000).toFixed(0)}k zł`;
        return `${val.toFixed(0)} zł`;
    };

    const data = {
        labels,
        datasets: [
            {
                label: 'Przychody',
                data: revData,
                fill: true,
                backgroundColor: (context: any) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.15)');
                    gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.05)');
                    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    return gradient;
                },
                borderColor: '#3B82F6',
                borderWidth: 2.5,
                tension: 0.4,
                pointBackgroundColor: '#3B82F6',
                pointBorderColor: '#FFFFFF',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
            },
            {
                label: 'Koszty',
                data: expData,
                fill: true,
                backgroundColor: (context: any) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                    gradient.addColorStop(0, 'rgba(168, 85, 247, 0.12)');
                    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    return gradient;
                },
                borderColor: '#A855F7',
                borderWidth: 2,
                tension: 0.4,
                pointBackgroundColor: '#A855F7',
                pointBorderColor: '#FFFFFF',
                pointBorderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
            },
            {
                label: 'Marża',
                data: revData.map((rev, i) => rev - expData[i]),
                fill: true,
                backgroundColor: (context: any) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.12)');
                    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    return gradient;
                },
                borderColor: '#10B981',
                borderWidth: 2,
                tension: 0.4,
                pointBackgroundColor: '#10B981',
                pointBorderColor: '#FFFFFF',
                pointBorderWidth: 2,
                pointRadius: 3,
                pointHoverRadius: 5,
            },
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top' as const,
                align: 'end' as const,
                labels: {
                    color: '#6B7280',
                    font: { family: 'Inter, sans-serif', size: 12, weight: '500' as any },
                    usePointStyle: true,
                    pointStyle: 'circle',
                    pointStyleWidth: 10,
                    padding: 24,
                    boxWidth: 10,
                    boxHeight: 10,
                }
            },
            title: { display: false },
            tooltip: {
                backgroundColor: '#FFFFFF',
                titleColor: '#111827',
                bodyColor: '#4B5563',
                borderColor: '#E5E7EB',
                borderWidth: 1,
                cornerRadius: 8,
                padding: 12,
                callbacks: {
                    label: (ctx: any) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`
                }
            }
        },
        scales: {
            y: {
                grid: { color: 'rgba(229, 231, 235, 0.8)' },
                ticks: {
                    color: '#9CA3AF',
                    font: { family: 'Inter, sans-serif', size: 11 },
                    callback: (value: any) => fmt(value)
                },
                border: { display: false },
            },
            x: {
                grid: { display: false },
                ticks: {
                    color: '#9CA3AF',
                    font: { family: 'Inter, sans-serif', size: 11 },
                },
                border: { display: false },
            }
        },
        interaction: {
            mode: 'index' as const,
            intersect: false,
        },
    };

    return (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 h-full flex flex-col shadow-sm">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-zinc-900 font-semibold text-base">Finanse</h3>
                <span className="text-xs text-zinc-400 font-medium">Dane z bazy (live)</span>
            </div>

            {/* Revenue / Expenses summary — REAL DATA */}
            <div className="flex gap-8 mb-4">
                <div>
                    <span className="text-xs text-zinc-500 block">Przychody (ten rok)</span>
                    <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-zinc-900">{fmt(totalRevenue)}</span>
                        {revChange !== 0 && (
                            <span className={`text-xs flex items-center font-medium ${revChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {revChange >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                {Math.abs(revChange).toFixed(0)}%
                            </span>
                        )}
                    </div>
                </div>
                <div>
                    <span className="text-xs text-zinc-500 block">Koszty (ten rok)</span>
                    <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-zinc-900">{fmt(totalExpenses)}</span>
                        {expChange !== 0 && (
                            <span className={`text-xs flex items-center font-medium ${expChange <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {expChange <= 0 ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                                {Math.abs(expChange).toFixed(0)}%
                            </span>
                        )}
                    </div>
                </div>
                <div>
                    <span className="text-xs text-zinc-500 block">Marża brutto</span>
                    <div className="flex items-center gap-2">
                        <span className={`text-xl font-bold ${totalRevenue - totalExpenses >= 0 ? 'text-emerald-600' : 'text-red-650'}`}>
                            {fmt(totalRevenue - totalExpenses)}
                        </span>
                        {totalRevenue > 0 && (
                            <span className={`text-xs font-medium ${((totalRevenue - totalExpenses) / totalRevenue * 100) >= 18 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {((totalRevenue - totalExpenses) / totalRevenue * 100).toFixed(1)}%
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0">
                <Line options={options} data={data} />
            </div>
        </div>
    );
}
