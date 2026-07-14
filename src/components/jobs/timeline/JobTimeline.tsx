import { useMemo, useState } from 'react';
import { format, differenceInDays, addDays, startOfDay } from 'date-fns';
import { pl } from 'date-fns/locale';
import { ChevronRight, Clock, CheckCircle, AlertCircle, Circle } from 'lucide-react';
import type { Job, JobStage } from '../../../models/types';
import { clsx } from 'clsx';

interface JobTimelineProps {
    job: Job;
    onStageClick?: (stage: JobStage) => void;
}

export const JobTimeline = ({ job, onStageClick }: JobTimelineProps) => {
    const [hoveredStageId, setHoveredStageId] = useState<string | null>(null);

    // Dynamic getters to unify property naming conventions
    // (startPlanned/endPlanned vs plannedStartDate/plannedEndDate from extra works)
    const getStageStartDate = (s: JobStage) => s.startPlanned || (s as any).plannedStartDate || s.startActual || (s as any).actualStartDate;
    const getStageEndDate = (s: JobStage) => s.endPlanned || (s as any).plannedEndDate || s.endActual || (s as any).actualEndDate;

    const stages = useMemo(() => {
        return (job.stages || [])
            .filter(s => getStageStartDate(s) && getStageEndDate(s))
            .sort((a, b) => new Date(getStageStartDate(a)!).getTime() - new Date(getStageStartDate(b)!).getTime());
    }, [job.stages]);

    const timelineRange = useMemo(() => {
        if (stages.length === 0) {
            const now = startOfDay(new Date());
            return { start: now, end: addDays(now, 14), days: 14 };
        }

        const dates = stages.flatMap(s => [new Date(getStageStartDate(s)!), new Date(getStageEndDate(s)!)]);
        const start = addDays(startOfDay(new Date(Math.min(...dates.map(d => d.getTime())))), -2);
        const end = addDays(startOfDay(new Date(Math.max(...dates.map(d => d.getTime())))), 5);
        const days = differenceInDays(end, start) + 1;

        return { start, end, days };
    }, [stages]);

    const days = useMemo(() => {
        return Array.from({ length: timelineRange.days }).map((_, i) => addDays(timelineRange.start, i));
    }, [timelineRange]);

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'zakończony': return 'bg-emerald-500 border-emerald-600 shadow-emerald-200';
            case 'w_toku': return 'bg-blue-500 border-blue-600 shadow-blue-200 animate-pulse-subtle';
            case 'anulowany': return 'bg-slate-400 border-slate-500 shadow-slate-100';
            default: return 'bg-indigo-500 border-indigo-600 shadow-indigo-200';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'zakończony': return <CheckCircle className="w-3 h-3 text-white" />;
            case 'anulowany': return <AlertCircle className="w-3 h-3 text-white" />;
            case 'w_toku': return <Circle className="w-3 h-3 text-white fill-current" />;
            default: return <Clock className="w-3 h-3 text-white" />;
        }
    };

    if (stages.length === 0) {
        return (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center">
                <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Brak etapów z datami do wyświetlenia na osi czasu.</p>
            </div>
        );
    }

    // Solve Date overlap: Ensure each column has at least 60px of spacing
    const containerMinWidth = Math.max(800, timelineRange.days * 60);

    return (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            {/* Timeline Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900">Harmonogram Wizualny</h3>
                    <span className="text-[10px] bg-blue-100 text-blue-700 font-black px-1.5 py-0.5 rounded uppercase tracking-wider">Premium</span>
                </div>
                <div className="text-xs font-bold text-slate-400 flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-indigo-500" /> Planowany
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-blue-500" /> W toku
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" /> Zakończony
                    </div>
                </div>
            </div>

            <div className="p-6 overflow-x-auto custom-scrollbar">
                <div style={{ minWidth: `${containerMinWidth}px` }} className="relative">
                    {/* Date Labels */}
                    <div className="grid h-10 border-b border-slate-100 mb-6 sticky top-0 bg-white z-20"
                        style={{ gridTemplateColumns: `repeat(${timelineRange.days}, 1fr)` }}>
                        {days.map((day, i) => {
                            const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                            return (
                                <div key={i} className={clsx(
                                    "flex flex-col items-center justify-center text-[10px] font-black uppercase tracking-tighter border-r border-slate-50 last:border-r-0",
                                    isToday ? "text-[#21808D] bg-teal-50/20" : "text-slate-400",
                                    isWeekend && "bg-slate-50/50"
                                )}>
                                    <span>{format(day, 'EEE', { locale: pl })}</span>
                                    <span className={clsx("text-[10px] mt-0.5", isToday && "text-[#21808D] font-black")}>{format(day, 'd.MM')}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* Timeline Body */}
                    <div className="relative space-y-4">
                        {/* Grid Vertical Lines */}
                        <div className="absolute inset-x-0 inset-y-0 grid pointer-events-none z-0"
                            style={{ gridTemplateColumns: `repeat(${timelineRange.days}, 1fr)` }}>
                            {days.map((_, i) => (
                                <div key={i} className="border-r border-slate-50 last:border-r-0" />
                            ))}
                        </div>

                        {/* Stage Rows */}
                        {stages.map((stage, idx) => {
                            const startIdx = differenceInDays(new Date(getStageStartDate(stage)!), timelineRange.start);
                            const duration = differenceInDays(new Date(getStageEndDate(stage)!), new Date(getStageStartDate(stage)!)) + 1;
                            const isHovered = hoveredStageId === stage.id;

                            // Actual Hours Performance
                            const isOverBudget = (stage.actualLaborHours || 0) > (stage.plannedLaborHours || 0) && (stage.plannedLaborHours || 0) > 0;

                            return (
                                <div key={stage.id}
                                    className="relative z-10 transition-all duration-300"
                                    onMouseEnter={() => setHoveredStageId(stage.id)}
                                    onMouseLeave={() => setHoveredStageId(null)}
                                >
                                    <div className="grid h-12" style={{ gridTemplateColumns: `repeat(${timelineRange.days}, 1fr)` }}>
                                        <div
                                            className="relative my-auto flex flex-col justify-center"
                                            style={{
                                                gridColumnStart: startIdx + 1,
                                                gridColumnEnd: `span ${duration}`
                                            }}
                                        >
                                            <div
                                                className={clsx(
                                                    "relative h-10 rounded-xl border shadow-lg transition-all duration-500 cursor-pointer group flex items-center px-4 overflow-hidden w-full",
                                                    getStatusStyle(stage.status),
                                                    isHovered ? "scale-[1.01] z-30 ring-4 ring-white shadow-2xl" : "opacity-90 grayscale-[0.15]"
                                                )}
                                                onClick={() => onStageClick?.(stage)}
                                            >
                                                <div className="flex items-center gap-3 text-white truncate w-full">
                                                    <div className="flex-shrink-0 bg-white/20 p-1.5 rounded-lg backdrop-blur-md">
                                                        {getStatusIcon(stage.status)}
                                                    </div>
                                                    <div className="flex flex-col truncate">
                                                        <span className="text-[11px] font-black uppercase tracking-wider truncate">{stage.name}</span>
                                                        <div className="flex items-center gap-2 text-[9px] font-bold opacity-80">
                                                            <span>{format(new Date(getStageStartDate(stage)!), 'd.MM')} - {format(new Date(getStageEndDate(stage)!), 'd.MM')}</span>
                                                            <span className="w-1 h-1 rounded-full bg-white/40" />
                                                            <span>{duration} {duration === 1 ? 'dzień' : 'dni'}</span>
                                                            {isHovered && (
                                                                <>
                                                                    <span className="w-1 h-1 rounded-full bg-white/40" />
                                                                    <span className="text-blue-100">Plan: {stage.plannedLaborHours || 0}h</span>
                                                                    <span className="w-1 h-1 rounded-full bg-white/40" />
                                                                    <span className={clsx(isOverBudget ? "text-red-300 font-extrabold" : "text-emerald-300")}>Rzecz: {stage.actualLaborHours || 0}h</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Glow Effect */}
                                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
