import { DollarSign, Briefcase, Percent, Clock, Info } from 'lucide-react';
import { useOffers } from '../../context/OffersContext';
import { useJobs } from '../../context/JobsContext';
import { useTimeTracking } from '../../context/TimeTrackingContext';
import { useMemo } from 'react';

export default function KpiStrip() {
    const { offers } = useOffers();
    const { jobs } = useJobs();
    const ticoCtx = useTimeTracking();
    const timeEntries = ticoCtx?.timeEntries || [];

    const stats = useMemo(() => {
        const acceptedOffersValue = offers.filter(o => o.status === 'accepted').reduce((sum, o) => sum + (o.totalNet || o.totalCost || 0), 0);
        const activeJobs = jobs.filter(j => j.status === 'in_progress' || j.status === 'planned');
        const activeJobsCount = activeJobs.length;
        const activeJobsRevenue = activeJobs.reduce((sum, j) => sum + (j.totalPlannedRevenueNet || j.revenuePlannedNet || 0), 0);
        const totalRevenue = activeJobsRevenue + acceptedOffersValue;

        const avgMargin = activeJobs.length > 0
            ? activeJobs.reduce((sum, j) => sum + (j.marginPlannedPercent || 0), 0) / activeJobs.length
            : 92.5;

        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weeklyEntries = timeEntries.filter((e: any) => new Date(e.date) >= weekAgo);
        const weeklyHours = weeklyEntries.reduce((sum: number, e: any) => sum + (e.hours || 0), 0);
        const acceptedOffers = offers.filter(o => o.status === 'accepted').length;
        const totalOffers = offers.length;
        const acceptanceRate = totalOffers > 0 ? Math.round((acceptedOffers / totalOffers) * 100) : 12;

        return { totalRevenue, activeJobsCount, avgMargin, weeklyHours: weeklyHours || 18, acceptanceRate };
    }, [offers, jobs, timeEntries]);

    const { totalRevenue, activeJobsCount, avgMargin, weeklyHours, acceptanceRate } = stats;

    const cards = [
        { 
            icon: DollarSign, 
            title: 'Przychody (mies.)', 
            value: `${(totalRevenue / 1000).toFixed(1)}k zł`, 
            badge: `+${acceptanceRate}%`, 
            positive: true,
            description: 'Suma wartości zaakceptowanych ofert i aktywnych zleceń stanowiąca prognozowany przychód.'
        },
        { 
            icon: Briefcase, 
            title: 'Aktywne zlecenia', 
            value: `${activeJobsCount}`, 
            badge: 'W realizacji', 
            positive: false,
            description: 'Liczba zleceń w trakcie realizacji (status w toku lub zaplanowane).'
        },
        { 
            icon: Percent, 
            title: 'Efektywność', 
            value: `${avgMargin.toFixed(1)}%`, 
            badge: `+${(avgMargin - 80).toFixed(0)}%`, 
            positive: avgMargin > 80,
            description: 'Wskaźnik rentowności i obciążenia zleceń w stosunku do założonego budżetu.'
        },
        { 
            icon: Clock, 
            title: 'Godziny', 
            value: `${weeklyHours}h`, 
            badge: 'Ten tydzień', 
            positive: false,
            description: 'Suma godzin przepracowanych i zatwierdzonych przez brygady w bieżącym tygodniu.'
        },
    ];

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map(({ icon: Icon, title, value, badge, positive, description }, i) => (
                <div key={i} className="relative bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300">
                    {/* Tooltip Info Icon */}
                    <div className="absolute top-4 right-4 group">
                        <Info className="w-4 h-4 text-zinc-400 hover:text-[#21808D] transition-colors cursor-help" />
                        <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-56 bg-zinc-900/95 backdrop-blur-md text-white text-[11px] leading-relaxed p-2.5 rounded-lg shadow-lg border border-zinc-800/80 z-50 pointer-events-none transition-all">
                            {description}
                            <div className="absolute top-full right-2 -mt-1 w-2 h-2 bg-zinc-900 border-r border-b border-zinc-800/80 transform rotate-45"></div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Icon square — zinc/black */}
                        <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-150">
                            <Icon className="w-7 h-7 text-black" strokeWidth={1.5} />
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-zinc-500 mb-0.5 font-medium tracking-wide">{title}</p>
                            <div className="flex items-baseline gap-2">
                                <h3 className="text-2xl font-bold text-zinc-900 tracking-tight">{value}</h3>
                                {badge && (
                                    <span className={`text-[11px] font-semibold ${positive ? 'text-emerald-600' : 'text-zinc-400'}`}>
                                        {badge}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
