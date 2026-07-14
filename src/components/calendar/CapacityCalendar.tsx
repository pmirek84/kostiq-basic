import { useState } from 'react';
import type { DayCapacitySummary } from '../../models/capacity';
import type { CalendarView } from './CalendarControls';
import { getMonthDays } from '../../utils/calendarHelpers';
import { Modal } from '../ui/Modal';
import { format, isWeekend } from 'date-fns';
import { pl } from 'date-fns/locale';

interface Props {
    capacitySummaries: DayCapacitySummary[];
    hoursPerDay: number;
    view: CalendarView;
    currentDate: Date;
    totalEmployees: number;
    onUpdateStageTeam?: (jobId: string, stageId: string, currentTeam: string[]) => void;
    onQuickAssign?: (dateStr: string) => void;  // New: called when user clicks "Add work" on a free day
}

export default function CapacityCalendar({ capacitySummaries, view, currentDate, totalEmployees, onUpdateStageTeam, onQuickAssign }: Props) {
    const [selectedDay, setSelectedDay] = useState<DayCapacitySummary | null>(null);
    const byDate = new Map(capacitySummaries.map(d => [d.date, d]));

    const dailyCapacity = totalEmployees * 8; // Global daily capacity

    // Helper to get unique team for a stage/job in the selected day for the "Edit" pre-fill
    // Ideally we should get this from the job/stage data itself, but here we only have flattened capacity.
    // We'll pass empty or rely on parent to fetch current. Parent has the real data (jobs).

    const getDayStats = (dateStr: string) => {
        const summary = byDate.get(dateStr);
        const planned = summary?.totalPlannedHours || 0;
        const utilization = dailyCapacity > 0 ? (planned / dailyCapacity) * 100 : 0;
        return { summary, planned, utilization };
    };

    const getColor = (util: number) => {
        if (util === 0) return 'bg-emerald-50 text-emerald-800 border-emerald-100';

        // Gradation requested: 10% Rose -> 100% Red (Desaturated/premium)
        if (util <= 20) return 'bg-rose-50/40 text-rose-800 border-rose-100/30';
        if (util <= 40) return 'bg-rose-50 text-rose-800 border-rose-100';
        if (util <= 60) return 'bg-red-50 text-red-900 border-red-100';
        if (util <= 80) return 'bg-red-100 text-red-950 border-red-200';
        // High utilization - strong red
        return 'bg-red-600 text-white border-red-700';
    };

    const renderMonthView = () => {
        const days = getMonthDays(currentDate.getMonth(), currentDate.getFullYear());

        return (
            <div className="bg-white border border-black/10 rounded-2xl p-6 w-full">
                <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-semibold text-zinc-400">
                    {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map(d => <div key={d}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-2 text-xs">
                    {days.map(day => {
                        const dateStr = day.dateStr;
                        const dateObj = new Date(dateStr);
                        const isDayWeekend = isWeekend(dateObj);

                        const { summary, utilization } = getDayStats(dateStr);
                        const isToday = dateStr === new Date().toISOString().slice(0, 10);

                        // Logic for styling
                        let subLabel = '';

                        if (!isDayWeekend) {
                            if (utilization === 0) {
                                subLabel = 'Moc przerobowa';
                            } else {
                                const assignedCount = summary?.uniqueEmployeesCount || 0;
                                const unassignedCount = summary?.allocations.filter(a => a.employeeName === 'Nieprzypisane').length || 0;
                                const realAssignedCount = Math.max(0, assignedCount - unassignedCount);

                                const availableCount = totalEmployees - realAssignedCount;
                                subLabel = `${availableCount} os. dostępnych`;
                                if (unassignedCount > 0) {
                                    subLabel += ` (${unassignedCount} nieprzyp.)`;
                                }
                            }
                        }

                        const assignedList = summary?.assignedEmployeeNames?.join(', ') || '-';
                        const freeList = summary?.freeEmployeeNames?.join(', ') || '-';
                        const tooltip = `Zajęci: ${assignedList}\nWolni: ${freeList}`;

                        return (
                            <div
                                key={dateStr}
                                onClick={() => !isDayWeekend && summary && setSelectedDay(summary)}
                                title={!isDayWeekend ? tooltip : undefined}
                                className={`border border-black/5 rounded-xl p-2 h-20 flex flex-col justify-between group ${isToday ? 'ring-1 ring-black' : ''} ${(!isDayWeekend && summary) ? 'cursor-pointer hover:border-black/20 hover:bg-zinc-50/20 transition-all bg-white shadow-sm' : 'bg-zinc-50/50'}`}
                            >
                                <div className="flex justify-between items-center w-full">
                                    <span className={`text-xs ${isToday ? 'font-bold text-zinc-950' : 'text-zinc-500'}`}>
                                        {day.dayOfMonth}
                                    </span>
                                    {/* Small plus icon for free days if hovered */}
                                    {utilization === 0 && !isDayWeekend && onQuickAssign && (
                                        <span 
                                            onClick={(e) => { e.stopPropagation(); onQuickAssign(dateStr); }}
                                            className="text-[10px] text-zinc-400 hover:text-black font-semibold cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Dodaj zapotrzebowanie"
                                        >
                                            +
                                        </span>
                                    )}
                                </div>
                                {!isDayWeekend ? (
                                    <div className="flex flex-col items-start gap-1">
                                        {/* Utilization Pill Badge */}
                                        <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${
                                            utilization === 0 
                                                ? 'bg-green-50 text-green-700 border border-green-100/30' 
                                                : utilization > 100 
                                                    ? 'bg-red-50 text-red-700 border border-red-150/30 font-semibold' 
                                                    : 'bg-amber-50 text-amber-700 border border-amber-150/30'
                                        }`}>
                                            {utilization === 0 ? 'Wolne' : `${utilization.toFixed(0)}%`}
                                        </span>
                                        {/* Available staff count */}
                                        <span className="text-[9px] text-zinc-400 truncate w-full">
                                            {utilization === 0 
                                                ? `${totalEmployees} wolnych` 
                                                : `${totalEmployees - (summary?.uniqueEmployeesCount || 0)} wolnych`}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="text-[9px] text-zinc-400 italic">Weekend</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderWeekView = () => {
        const startOfWeek = new Date(currentDate);
        const day = startOfWeek.getDay() || 7;
        if (day !== 1) startOfWeek.setHours(-24 * (day - 1));

        const weekDays = Array.from({ length: 7 }, (_, i) => {
            const d = new Date(startOfWeek);
            d.setDate(startOfWeek.getDate() + i);
            return d;
        });

        return (
            <div className="grid grid-cols-7 gap-4 min-h-[500px]">
                {weekDays.map((date, i) => {
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const isDayWeekend = isWeekend(date);
                    const { summary, utilization } = getDayStats(dateStr);
                    const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');

                    let colorClasses = 'bg-gray-50';

                    if (!isDayWeekend) {
                        colorClasses = getColor(utilization);
                    }

                    return (
                        <div
                            key={i}
                            onClick={() => !isDayWeekend && summary && setSelectedDay(summary)}
                            className={`flex flex-col border rounded-2xl overflow-hidden ${isToday ? 'ring-1 ring-black border-black/10' : 'border-black/10'} ${(!isDayWeekend && summary) ? 'cursor-pointer hover:ring-1 hover:ring-black/10 transition-all bg-white' : 'bg-zinc-50/50'}`}
                        >
                            <div className={`p-2 text-center text-sm font-medium border-b border-black/5 ${isToday ? 'bg-zinc-100 text-black' : 'bg-zinc-50/50 text-zinc-700'}`}>
                                <div>{['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'][i]}</div>
                                <div className="text-lg">{date.getDate()}</div>
                            </div>
                            <div className={`flex-1 flex flex-col items-center justify-center p-4 ${colorClasses}`}>
                                {!isDayWeekend ? (
                                    <>
                                        {utilization === 0 ? (
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-full px-3 py-1 font-bold text-sm">
                                                    Wolne
                                                </div>
                                                <span className="text-xs text-emerald-700/80 font-medium">100% dostępności</span>
                                                {/* QUICK-ASSIGN button for totally free days */}
                                                {onQuickAssign && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onQuickAssign(dateStr); }}
                                                        className="mt-2 flex items-center gap-1.5 bg-black hover:bg-zinc-800 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition-all"
                                                    >
                                                        <span>+</span> Zaangażuj pracownika
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center">
                                                <div className={`rounded-full px-3 py-1 font-bold text-xl mb-1 ${utilization > 100 ? 'bg-red-50 text-red-800 border border-red-100' : 'bg-white/50 text-slate-800'}`}>
                                                    {utilization.toFixed(0)}%
                                                </div>
                                                <span className="text-[10px] uppercase tracking-wider opacity-90 font-medium">obłożenia</span>
                                                {/* QUICK-ASSIGN for days with free capacity */}
                                                {utilization < 80 && totalEmployees - (summary?.uniqueEmployeesCount || 0) > 0 && onQuickAssign && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); onQuickAssign(dateStr); }}
                                                        className="mt-2 flex items-center gap-1 bg-black hover:bg-zinc-800 text-white text-[10px] font-semibold px-2 py-1 rounded-xl transition-all"
                                                    >
                                                        + Dołącz do zlecenia
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        <div className="mt-3 w-full border-t border-black/5 pt-2 flex justify-between text-[10px] font-medium px-2 opacity-80">
                                            <span>Zajęci: {summary?.uniqueEmployeesCount || 0}</span>
                                            <span>Wolni: {totalEmployees - (summary?.uniqueEmployeesCount || 0)}</span>
                                        </div>
                                    </>
                                ) : (
                                    <span className="text-zinc-400 text-xs font-medium uppercase tracking-widest opacity-50">Weekend</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderDayView = () => {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const { summary, utilization, planned } = getDayStats(dateStr);
        const colorClasses = getColor(utilization);
        const isDayWeekend = isWeekend(currentDate);

        return (
            <div className="bg-white rounded-2xl border border-black/10 min-h-[500px] flex flex-col p-8">
                <h3 className="text-2xl font-semibold mb-8 text-gray-900 text-center">
                    {currentDate.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </h3>

                <div className="flex flex-col md:flex-row gap-8 justify-center items-center md:items-start">
                    {/* Left stats circle */}
                    <div className="flex-shrink-0">
                        {!isDayWeekend ? (
                            <div
                                onClick={() => summary && setSelectedDay(summary)}
                                className={`w-64 h-64 rounded-full flex flex-col items-center justify-center border-4 shadow-lg ${summary ? 'cursor-pointer hover:scale-105 transition-transform' : ''} ${colorClasses}`}
                            >
                                {utilization === 0 ? (
                                    <>
                                        <span className="text-4xl font-bold text-green-600">100% Wolne</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-6xl font-bold">{utilization.toFixed(0)}%</span>
                                        <span className="text-lg mt-2 font-medium">Obłożenia</span>
                                    </>
                                )}
                                {summary && <span className="text-xs text-gray-400 mt-2">(Kliknij po szczegóły)</span>}
                            </div>
                        ) : (
                            <div className="w-64 h-64 rounded-full flex items-center justify-center border-4 border-gray-100 bg-gray-50 text-gray-400 text-lg">
                                Weekend
                            </div>
                        )}

                        {!isDayWeekend && (
                            <div className="mt-8 grid grid-cols-2 gap-4 text-center">
                                <div>
                                    <div className="text-2xl font-bold text-gray-900">{dailyCapacity}h</div>
                                    <div className="text-xs text-gray-500 uppercase tracking-wide">Dostępność</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-gray-900">{planned.toFixed(1)}h</div>
                                    <div className="text-xs text-gray-500 uppercase tracking-wide">Plan</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right side: Crew Breakdown List */}
                    {!isDayWeekend && summary?.crewBreakdown && (
                        <div className="flex-1 w-full max-w-lg space-y-4">
                            <h4 className="font-medium text-gray-900 border-b pb-2">Status Ekip</h4>
                            <div className="space-y-3">
                                {summary.crewBreakdown.map(crew => (
                                    <div key={crew.crewId} className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-medium text-sm text-gray-700">{crew.crewName}</span>
                                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${crew.isOverbooked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                {crew.utilizationPercent.toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                                            <div
                                                className={`h-1.5 rounded-full ${crew.isOverbooked ? 'bg-red-500' : (crew.utilizationPercent > 80 ? 'bg-orange-400' : 'bg-green-500')}`}
                                                style={{ width: `${Math.min(100, crew.utilizationPercent)}%` }}
                                            ></div>
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-500">
                                            <span>Członkowie: {crew.assignedMembers}/{crew.totalMembers}</span>
                                            {crew.assignedMembers > 0 && (
                                                <span className="truncate max-w-[150px]">{crew.assignedNames.join(', ')}</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {summary.crewBreakdown.length === 0 && (
                                    <p className="text-sm text-gray-400 italic">Brak zdefiniowanych ekip.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <>
            {/* ... (Calendar Views Render) ... */}
            <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200">
                {view === 'month' && renderMonthView()}
                {view === 'week' && renderWeekView()}
                {view === 'day' && renderDayView()}
            </div>

            <Modal
                isOpen={!!selectedDay}
                onClose={() => setSelectedDay(null)}
                title={selectedDay ? `Szczegóły obłożenia: ${format(new Date(selectedDay.date), 'dd MMMM yyyy', { locale: pl })}` : ''}
            >
                {selectedDay && (
                    <div className="space-y-6">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-3 gap-4">
                            <div className="bg-blue-50 p-3 rounded-lg text-center">
                                <div className="text-xs text-blue-600 font-medium">Planowane</div>
                                <div className="text-xl font-bold text-blue-900">{selectedDay.totalPlannedHours.toFixed(1)}h</div>
                            </div>
                            <div className="bg-green-50 p-3 rounded-lg text-center">
                                <div className="text-xs text-green-600 font-medium">Dostępne</div>
                                <div className="text-xl font-bold text-green-900">{selectedDay.totalAvailableHours.toFixed(1)}h</div>
                            </div>
                            <div className={`p-3 rounded-lg text-center ${selectedDay.totalPlannedHours > selectedDay.totalAvailableHours ? 'bg-red-50' : 'bg-gray-50'}`}>
                                <div className={`text-xs font-medium ${selectedDay.totalPlannedHours > selectedDay.totalAvailableHours ? 'text-red-600' : 'text-gray-600'}`}>Obłożenie</div>
                                <div className={`text-xl font-bold ${selectedDay.totalPlannedHours > selectedDay.totalAvailableHours ? 'text-red-900' : 'text-gray-900'}`}>{selectedDay.avgUtilizationPercent.toFixed(0)}%</div>
                            </div>
                        </div>

                        {/* Crew Breakdown Section in Modal */}
                        {selectedDay.crewBreakdown && selectedDay.crewBreakdown.length > 0 && (
                            <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-3">Podsumowanie Ekip</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {selectedDay.crewBreakdown.map(crew => (
                                        <div key={crew.crewId} className={`p-2 rounded border ${crew.isOverbooked ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
                                            <div className="flex justify-between items-start">
                                                <div className="font-medium text-sm">{crew.crewName}</div>
                                                <div className={`text-xs font-bold px-1.5 rounded ${crew.isOverbooked ? 'text-red-700' : 'text-green-700'}`}>
                                                    {crew.utilizationPercent.toFixed(0)}%
                                                </div>
                                            </div>
                                            <div className="mt-1 text-xs text-gray-500">
                                                Pracuje: <span className="font-medium">{crew.assignedNames.length > 0 ? crew.assignedNames.join(', ') : 'Brak'}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Individual Allocations Table */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-900 mb-3">Szczegóły Alokacji</h4>
                            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
                                <table className="min-w-full divide-y divide-gray-300">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Pracownik</th>
                                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Zlecenie / Etap</th>
                                            <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Godziny</th>
                                            <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 bg-white">
                                        {selectedDay.allocations?.map((alloc, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                                                            {alloc.employeeName.split(' ').map(n => n[0]).join('')}
                                                        </div>
                                                        {alloc.employeeName}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-4 text-sm text-gray-500">
                                                    <div className="font-medium text-gray-900 mb-0.5">{alloc.jobName?.split(':')[0]}</div>
                                                    {alloc.jobName?.includes(':') && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                                            {alloc.jobName.split(':')[1]?.trim()}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 text-right font-mono">
                                                    {alloc.plannedHours.toFixed(1)}h
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-right">
                                                    {alloc.jobId && alloc.stageId && onUpdateStageTeam && (
                                                        <button
                                                            onClick={() => onUpdateStageTeam(alloc.jobId!, alloc.stageId!, [])}
                                                            className="text-blue-600 hover:text-blue-800 text-xs font-semibold hover:underline"
                                                        >
                                                            Zmień
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                        {(!selectedDay.allocations || selectedDay.allocations.length === 0) && (
                                            <tr>
                                                <td colSpan={4} className="py-8 text-center text-gray-500 italic">
                                                    Brak szczegółowych alokacji dla tego dnia.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
}
