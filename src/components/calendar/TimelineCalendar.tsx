import React, { useMemo } from 'react';
import type { Job, JobStage } from '../../models/types';
import { AlertTriangle, Users, Calendar, ArrowRight } from 'lucide-react';
import { 
    format, 
    startOfMonth, 
    endOfMonth, 
    eachDayOfInterval, 
    isWithinInterval, 
    parseISO, 
    startOfDay, 
    endOfDay 
} from 'date-fns';
import { pl } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

interface TimelineCalendarProps {
    currentDate: Date;
    jobs: Job[];
    crews: any[];
}

interface ActiveStage {
    jobId: string;
    jobCode: string;
    jobName: string;
    stage: JobStage;
}

export default function TimelineCalendar({ currentDate, jobs, crews }: TimelineCalendarProps) {
    const navigate = useNavigate();

    // Generate days in the current month
    const daysInMonth = useMemo(() => {
        const start = startOfMonth(currentDate);
        const end = endOfMonth(currentDate);
        return eachDayOfInterval({ start, end });
    }, [currentDate]);

    // Map stages to crews for each day of the month
    const timelineData = useMemo(() => {
        // Collect all active stages with their jobs
        const allActiveStages: ActiveStage[] = [];
        jobs.forEach(job => {
            if (job.stages && Array.isArray(job.stages)) {
                job.stages.forEach(stage => {
                    // Check if stage is not cancelled/finished
                    if (stage.status !== 'anulowany' && stage.status !== 'zakończony') {
                        allActiveStages.push({
                            jobId: job.id,
                            jobCode: job.jobCode || '',
                            jobName: job.name,
                            stage
                        });
                    }
                });
            }
        });

        // Map for each crew
        const crewRows = crews.map(crew => {
            const days = daysInMonth.map(day => {
                const activeOnDay: ActiveStage[] = [];

                allActiveStages.forEach(item => {
                    const startStr = (item.stage as any).plannedStartDate || item.stage.startPlanned;
                    const endStr = (item.stage as any).plannedEndDate || item.stage.endPlanned;

                    if (startStr && endStr) {
                        try {
                            const start = startOfDay(parseISO(startStr));
                            const end = endOfDay(parseISO(endStr));
                            const current = startOfDay(day);

                            // Check if this day is within the stage scheduled interval
                            if (current >= start && current <= end) {
                                // Check if assigned to this crew
                                const assignedTeams = item.stage.assignedTeams || [];
                                const isAssigned = assignedTeams.some(team => 
                                    team === crew.name || 
                                    team === crew.id || 
                                    team === crew._id?.toString()
                                );

                                if (isAssigned) {
                                    activeOnDay.push(item);
                                }
                            }
                        } catch (err) {
                            console.error('Invalid dates on stage:', item.stage, err);
                        }
                    }
                });

                return {
                    day,
                    stages: activeOnDay,
                    hasConflict: activeOnDay.length > 1
                };
            });

            return {
                crew,
                days
            };
        });

        // Add an "Nieprzypisane" (Unassigned) row for stages without any crew
        const unassignedDays = daysInMonth.map(day => {
            const activeOnDay: ActiveStage[] = [];

            allActiveStages.forEach(item => {
                const startStr = (item.stage as any).plannedStartDate || item.stage.startPlanned;
                const endStr = (item.stage as any).plannedEndDate || item.stage.endPlanned;

                if (startStr && endStr) {
                    try {
                        const start = startOfDay(parseISO(startStr));
                        const end = endOfDay(parseISO(endStr));
                        const current = startOfDay(day);

                        if (current >= start && current <= end) {
                            const assignedTeams = item.stage.assignedTeams || [];
                            if (assignedTeams.length === 0) {
                                activeOnDay.push(item);
                            }
                        }
                    } catch (err) {
                        // ignore
                    }
                }
            });

            return {
                day,
                stages: activeOnDay,
                hasConflict: false // Conflicts not tracked for unassigned
            };
        });

        return {
            crewRows,
            unassignedRow: {
                crew: { id: 'unassigned', name: 'Nieprzypisane etapy' },
                days: unassignedDays
            }
        };
    }, [jobs, crews, daysInMonth]);

    const getDayName = (day: Date) => {
        return format(day, 'eee', { locale: pl });
    };

    const isWeekend = (day: Date) => {
        const d = day.getDay();
        return d === 0 || d === 6; // Sunday or Saturday
    };

    const isToday = (day: Date) => {
        const today = new Date();
        return today.getDate() === day.getDate() &&
               today.getMonth() === day.getMonth() &&
               today.getFullYear() === day.getFullYear();
    };
    return (
        <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
            <div className="p-4 bg-zinc-50/50 border-b border-black/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-black" />
                    <h3 className="text-sm font-bold text-zinc-800">Miesięczny harmonogram obciążenia ekip</h3>
                </div>
                <div className="flex items-center gap-4 text-xs font-semibold text-zinc-500">
                    <span className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 rounded bg-zinc-50 border border-black/10"></span>
                        Normalny etap
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-3.5 h-3.5 rounded bg-red-50 border border-red-200 flex items-center justify-center text-red-650">
                            <AlertTriangle className="w-2.5 h-2.5" />
                        </span>
                        Konflikt terminów (Nakładanie)
                    </span>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full border-collapse table-fixed min-w-[1200px]">
                    <thead>
                        <tr className="border-b border-black/10 bg-zinc-50/50 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                            <th className="w-48 px-4 py-3 text-left border-r border-black/10 sticky left-0 bg-zinc-50/90 z-20">
                                Ekipa Monterska
                            </th>
                            {daysInMonth.map((day, idx) => (
                                <th 
                                    key={idx} 
                                    className={`px-1 py-2 text-center border-r border-black/10 w-12 ${
                                        isToday(day) 
                                            ? 'bg-zinc-100 text-black font-bold' 
                                            : isWeekend(day) 
                                                ? 'bg-zinc-50 text-zinc-400' 
                                                : ''
                                    }`}
                                >
                                    <div>{format(day, 'd')}</div>
                                    <div className="text-[8px] font-medium opacity-80">{getDayName(day)}</div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5 text-xs">
                        {/* Render active crew rows */}
                        {timelineData.crewRows.map(({ crew, days }) => (
                            <tr key={crew.id} className="hover:bg-zinc-50/40 transition-colors">
                                <td className="px-4 py-3 font-semibold text-zinc-800 border-r border-black/10 sticky left-0 bg-white z-10 flex items-center gap-2">
                                    <Users className="w-4 h-4 text-zinc-400 shrink-0" />
                                    <span className="truncate">{crew.name}</span>
                                </td>
                                {days.map((dayData, idx) => {
                                    const tooltipText = dayData.stages.map(item => 
                                        `[${item.jobCode}] ${item.jobName} — ${item.stage.name}`
                                    ).join('\n');

                                    return (
                                        <td 
                                            key={idx} 
                                            className={`px-1 py-2 text-center border-r border-black/10 align-middle relative w-12 ${
                                                dayData.hasConflict 
                                                    ? 'bg-red-50/50' 
                                                    : isToday(dayData.day) 
                                                        ? 'bg-zinc-50/20' 
                                                        : isWeekend(dayData.day) 
                                                            ? 'bg-zinc-50/50' 
                                                            : ''
                                            }`}
                                            title={dayData.stages.length > 0 ? tooltipText : undefined}
                                        >
                                            {dayData.stages.length > 0 ? (
                                                <div 
                                                    onClick={() => {
                                                        if (dayData.stages[0]) {
                                                            navigate(`/jobs/${dayData.stages[0].jobId}?tab=stages`);
                                                        }
                                                    }}
                                                    className="cursor-pointer transition-transform hover:scale-105"
                                                >
                                                    {dayData.hasConflict ? (
                                                        <div className="w-7 h-7 rounded-full bg-red-50 text-red-700 border border-red-200/50 flex items-center justify-center font-bold text-[10px] mx-auto" title="Konflikt: Przypisano wiele etapów!">
                                                            {dayData.stages.length}
                                                        </div>
                                                    ) : (
                                                        <div className="w-7 h-7 rounded-full bg-teal-50 text-[#21808D] border border-teal-150/40 flex items-center justify-center font-bold text-[10px] mx-auto">
                                                            1
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-zinc-300 font-medium">-</span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}

                        {/* Unassigned row */}
                        <tr className="bg-zinc-50/20 hover:bg-zinc-50/40 transition-colors">
                            <td className="px-4 py-3 font-semibold text-zinc-500 border-r border-black/10 sticky left-0 bg-zinc-50/90 z-10 flex items-center gap-2">
                                <Users className="w-4 h-4 text-zinc-400 shrink-0" />
                                <span className="truncate">{timelineData.unassignedRow.crew.name}</span>
                            </td>
                            {timelineData.unassignedRow.days.map((dayData, idx) => {
                                const tooltipText = dayData.stages.map(item => 
                                    `[${item.jobCode}] ${item.jobName} — ${item.stage.name}`
                                ).join('\n');

                                return (
                                    <td 
                                        key={idx} 
                                        className={`px-1 py-2 text-center border-r border-black/10 align-middle relative w-12 ${
                                            isToday(dayData.day) 
                                                ? 'bg-zinc-55/20' 
                                                : isWeekend(dayData.day) 
                                                    ? 'bg-zinc-100/30' 
                                                    : ''
                                        }`}
                                        title={dayData.stages.length > 0 ? tooltipText : undefined}
                                    >
                                        {dayData.stages.length > 0 ? (
                                            <div 
                                                onClick={() => {
                                                    if (dayData.stages[0]) {
                                                        navigate(`/jobs/${dayData.stages[0].jobId}?tab=stages`);
                                                    }
                                                }}
                                                className="cursor-pointer transition-transform hover:scale-105"
                                            >
                                                <div className="w-7 h-7 rounded-full bg-zinc-150 text-zinc-650 border border-black/10 flex items-center justify-center font-bold text-[10px] mx-auto">
                                                    {dayData.stages.length}
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] text-zinc-300 font-medium">-</span>
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
