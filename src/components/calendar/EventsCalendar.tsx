import { useState, useRef, useCallback } from 'react';
import type { CalendarEvent } from '../../models/calendar';
import type { CalendarView } from './CalendarControls';
import { getMonthDays } from '../../utils/calendarHelpers';

interface Props {
    events: CalendarEvent[];
    view: CalendarView;
    currentDate: Date;
    onEventClick?: (event: CalendarEvent) => void;
    onDateClick?: (date: Date) => void;
    onEventDrop?: (event: CalendarEvent, newDate: Date) => void;
    onDateChange?: (date: Date) => void;
    onAddEvent?: (event: Partial<CalendarEvent>) => Promise<void>;
}

export default function EventsCalendar({
    events,
    view,
    currentDate,
    onEventClick,
    onDateClick,
    onEventDrop,
    onDateChange,
    onAddEvent
}: Props) {
    const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null);
    const [dropTargetDate, setDropTargetDate] = useState<string | null>(null);
    const dragGhostRef = useRef<HTMLDivElement | null>(null);

    // Form states for side-panel quick add
    const [newTitle, setNewTitle] = useState('');
    const [newTime, setNewTime] = useState('09:00');
    const [newReminder, setNewReminder] = useState('none');

    // Helper to get events for a specific date
    const getEventsForDate = (date: Date) => {
        const dateStr = date.toISOString().slice(0, 10);
        return events.filter(e => {
            const start = e.start.slice(0, 10);
            const end = e.end.slice(0, 10);
            return dateStr >= start && dateStr <= end;
        });
    };

    const getEventColor = (type: string) => {
        switch (type) {
            case 'offer': return 'bg-teal-50/50 text-teal-800 border-teal-100/70';
            case 'job': return 'bg-teal-50 text-teal-900 border-teal-200/50';
            case 'measurement': return 'bg-zinc-50 text-zinc-700 border-black/5';
            case 'custom': return 'bg-zinc-50 text-zinc-650 border-black/5';
            default: return 'bg-zinc-50 text-zinc-600';
        }
    };

    const getEventLabel = (type: string) => {
        switch (type) {
            case 'offer': return 'Oferta';
            case 'job': return 'Zlecenie';
            case 'measurement': return 'Pomiar';
            case 'custom': return 'Inne';
            default: return 'Inne';
        }
    };

    // --- DRAG & DROP ---
    const isDraggable = useCallback((event: CalendarEvent) => {
        return event.type === 'job' && event.id.startsWith('stage-');
    }, []);

    const handleDragStart = useCallback((e: React.DragEvent, event: CalendarEvent) => {
        if (!isDraggable(event)) {
            e.preventDefault();
            return;
        }
        setDraggedEvent(event);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', event.id);

        const ghost = document.createElement('div');
        ghost.className = 'fixed pointer-events-none bg-blue-600 text-white px-3 py-1.5 rounded-md shadow-lg text-xs font-medium z-[9999]';
        ghost.textContent = event.title;
        ghost.style.transform = 'translate(-9999px, -9999px)';
        document.body.appendChild(ghost);
        dragGhostRef.current = ghost;
        e.dataTransfer.setDragImage(ghost, 0, 0);

        setTimeout(() => {
            if (dragGhostRef.current) {
                document.body.removeChild(dragGhostRef.current);
                dragGhostRef.current = null;
            }
        }, 0);
    }, [isDraggable]);

    const handleDragOver = useCallback((e: React.DragEvent, dateStr: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTargetDate(dateStr);
    }, []);

    const handleDragLeave = useCallback(() => {
        setDropTargetDate(null);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, targetDate: Date) => {
        e.preventDefault();
        setDropTargetDate(null);

        if (draggedEvent && onEventDrop) {
            onEventDrop(draggedEvent, targetDate);
        }
        setDraggedEvent(null);
    }, [draggedEvent, onEventDrop]);

    const handleDragEnd = useCallback(() => {
        setDraggedEvent(null);
        setDropTargetDate(null);
        if (dragGhostRef.current) {
            try { document.body.removeChild(dragGhostRef.current); } catch { }
            dragGhostRef.current = null;
        }
    }, []);

    const handlePrevMonth = (e: React.MouseEvent) => {
        e.stopPropagation();
        const prev = new Date(currentDate);
        prev.setMonth(prev.getMonth() - 1);
        onDateChange?.(prev);
    };

    const handleNextMonth = (e: React.MouseEvent) => {
        e.stopPropagation();
        const next = new Date(currentDate);
        next.setMonth(next.getMonth() + 1);
        onDateChange?.(next);
    };

    const handleQuickAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim() || !onAddEvent) return;

        const dateStr = currentDate.toISOString().slice(0, 10);
        const startStr = `${dateStr}T${newTime}:00`;
        const [hours, mins] = newTime.split(':').map(Number);
        const endHours = String(hours + 1).padStart(2, '0');
        const endStr = `${dateStr}T${endHours}:${String(mins).padStart(2, '0')}:00`;

        await onAddEvent({
            title: newTitle,
            start: startStr,
            end: endStr,
            type: 'custom',
            subtitle: 'Wpis z biura',
            location: 'Biuro'
        });

        setNewTitle('');
    };

    // --- EVENT CHIP ---
    const renderEventChip = (event: CalendarEvent, size: 'sm' | 'md' = 'sm') => {
        const draggable = isDraggable(event);
        const isDragging = draggedEvent?.id === event.id;

        if (size === 'sm') {
            return (
                <div
                    key={event.id}
                    draggable={draggable}
                    onDragStart={(e) => handleDragStart(e, event)}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => { e.stopPropagation(); onEventClick?.(event); }}
                    className={`px-1.5 py-0.5 rounded border text-[10px] truncate hover:opacity-80 ${getEventColor(event.type)} ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${isDragging ? 'opacity-30 ring-2 ring-blue-400' : ''}`}
                    title={`${event.title} (${event.subtitle})${draggable ? ' — przeciągnij aby zmienić datę' : ''}`}
                >
                    <span className="font-semibold mr-1">{getEventLabel(event.type)[0]}:</span>
                    {event.title}
                    {draggable && <span className="ml-1 opacity-40">⋮⋮</span>}
                </div>
            );
        }

        return (
            <div
                key={event.id}
                draggable={draggable}
                onDragStart={(e) => handleDragStart(e, event)}
                onDragEnd={handleDragEnd}
                onClick={(e) => { e.stopPropagation(); onEventClick?.(event); }}
                className={`p-2 rounded border text-xs hover:shadow-md transition-shadow ${getEventColor(event.type)} ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${isDragging ? 'opacity-30 ring-2 ring-blue-400' : ''}`}
            >
                <div className="font-semibold flex items-center justify-between">
                    {event.title}
                    {draggable && <span className="text-[10px] opacity-40 ml-1">⋮⋮</span>}
                </div>
                {event.subtitle && <div className="text-[10px] opacity-75 mt-1">{event.subtitle}</div>}
                <div className="text-[10px] mt-1 opacity-75">{event.start.slice(11, 16)}</div>
            </div>
        );
    };

    // --- VIEW RENDERERS ---
    const renderMonthView = () => {
        const days = getMonthDays(currentDate.getMonth(), currentDate.getFullYear());
        const selectedDateStr = currentDate.toISOString().slice(0, 10);
        const selectedDayEvents = getEventsForDate(currentDate);

        const formatter = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' });
        const monthLabel = formatter.format(currentDate);

        const dayName = currentDate.toLocaleDateString('pl-PL', { weekday: 'long' });
        const monthName = currentDate.toLocaleDateString('pl-PL', { month: 'long' });
        const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        const sidePanelDateLabel = `${capitalizedDay}, ${currentDate.getDate()} ${capitalizedMonth}`;

        return (
            <div className="flex flex-col lg:flex-row gap-6 items-start w-full">
                {/* Left Card: Month Grid */}
                <div className="flex-1 bg-white border border-black/10 rounded-2xl p-6 w-full">
                    {/* Header: < Lipiec 2026 > */}
                    <div className="flex justify-between items-center mb-6">
                        <button type="button" onClick={handlePrevMonth} className="p-2 hover:bg-zinc-100 rounded-xl transition-all text-zinc-500 hover:text-black">
                            <span className="text-lg font-medium">&lt;</span>
                        </button>
                        <h2 className="text-xl font-semibold text-zinc-900 capitalize">
                            {monthLabel}
                        </h2>
                        <button type="button" onClick={handleNextMonth} className="p-2 hover:bg-zinc-100 rounded-xl transition-all text-zinc-500 hover:text-black">
                            <span className="text-lg font-medium">&gt;</span>
                        </button>
                    </div>

                    {/* Weekday Names */}
                    <div className="grid grid-cols-7 gap-y-2 mb-4 text-center text-xs font-semibold text-zinc-400">
                        {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map(d => (
                            <div key={d} className="py-1">{d}</div>
                        ))}
                    </div>

                    {/* Day Cells */}
                    <div className="grid grid-cols-7 gap-y-4 gap-x-2 text-sm justify-items-center">
                        {days.map((day, idx) => {
                            const dateStr = day.dateStr;
                            if (!day.isCurrentMonth) {
                                return <div key={dateStr} className="w-12 h-12" />;
                            }
                            const dayEvents = getEventsForDate(new Date(dateStr));
                            const isToday = dateStr === new Date().toISOString().slice(0, 10);
                            const isSelected = dateStr === selectedDateStr;
                            const isDropTarget = dropTargetDate === dateStr;
                            const hasEvents = dayEvents.length > 0;
                            let cellStyles = 'text-zinc-800 hover:bg-zinc-50';

                            if (isSelected) {
                                cellStyles = 'bg-[#21808D] text-white font-semibold scale-105 shadow-sm';
                            } else if (isToday) {
                                cellStyles = 'bg-teal-50 text-teal-800 border border-teal-100/50 font-semibold';
                            } else if (hasEvents) {
                                cellStyles = 'bg-teal-50/50 text-[#21808D] border border-teal-100/30 font-medium hover:bg-teal-50/80';
                            }

                            const isFirstTwoWeeks = idx < 14;
                            const tooltipPlacementClass = isFirstTwoWeeks ? 'top-full mt-2' : 'bottom-full mb-2';
                            const tooltipPosClass = (idx % 7 <= 1)
                                ? (isFirstTwoWeeks ? 'left-0 origin-top-left' : 'left-0 origin-bottom-left')
                                : (idx % 7 >= 5)
                                    ? (isFirstTwoWeeks ? 'right-0 left-auto origin-top-right' : 'right-0 left-auto origin-bottom-right')
                                    : (isFirstTwoWeeks ? 'left-1/2 -translate-x-1/2 origin-top' : 'left-1/2 -translate-x-1/2 origin-bottom');

                            return (
                                <div
                                    key={dateStr}
                                    onClick={() => onDateClick?.(new Date(dateStr))}
                                    onDragOver={(e) => handleDragOver(e, dateStr)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, new Date(dateStr))}
                                    className={`group relative w-12 h-12 flex flex-col items-center justify-center cursor-pointer transition-all rounded-2xl
                                        ${cellStyles}
                                        ${isDropTarget ? 'ring-2 ring-teal-500 bg-teal-50/50 scale-105' : ''}
                                    `}
                                >
                                    <span>{day.dayOfMonth}</span>
                                    {hasEvents && (
                                        <span className={`absolute bottom-1.5 w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-[#21808D]'}`} />
                                    )}

                                    {/* Hover Preview Tooltip */}
                                    {hasEvents && (
                                        <div className={`absolute ${tooltipPlacementClass} hidden group-hover:flex flex-col bg-white border border-black/10 text-[10px] p-3 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] z-30 w-52 pointer-events-none ${tooltipPosClass}`}>
                                            <p className="font-bold text-zinc-800 border-b border-black/5 pb-1.5 mb-1.5 flex justify-between">
                                                <span>Zdarzenia ({dayEvents.length})</span>
                                                <span className="text-zinc-400 font-medium">Podgląd</span>
                                            </p>
                                            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                                                {dayEvents.map(e => (
                                                    <div key={e.id} className="text-zinc-700 leading-normal text-[10px] text-left">
                                                        <div className="font-semibold text-zinc-900 flex justify-between items-center">
                                                            <span className="truncate">{e.title}</span>
                                                            <span className="font-mono text-zinc-400 text-[9px] flex-shrink-0 ml-1.5">{e.start.slice(11, 16)}</span>
                                                        </div>
                                                        {e.subtitle && <p className="text-[9px] text-zinc-400 truncate mt-0.5">{e.subtitle}</p>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right Card: Day Details Side Panel */}
                <div className="w-full lg:w-[350px] bg-white border border-black/10 rounded-2xl p-6 flex flex-col">
                    <div className="mb-4 pb-4 border-b border-black/5">
                        <h3 className="text-lg font-bold text-zinc-900 leading-tight">{sidePanelDateLabel}</h3>
                        <p className="text-xs text-zinc-400 mt-1">
                            {selectedDayEvents.length === 0 ? 'Brak wpisów tego dnia.' : `${selectedDayEvents.length} wpisów`}
                        </p>
                    </div>

                    <div className="flex-1 space-y-3 min-h-[150px] max-h-[300px] overflow-y-auto pr-1 mb-6 custom-scrollbar">
                        {selectedDayEvents.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-sm text-zinc-400 py-10">
                                Brak wpisów tego dnia.
                            </div>
                        ) : (
                            selectedDayEvents.map(event => (
                                <div 
                                    key={event.id} 
                                    onClick={() => onEventClick?.(event)}
                                    className="p-3 rounded-xl border border-black/[0.04] hover:border-black/10 hover:bg-zinc-50 transition-all cursor-pointer"
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <h4 className="text-sm font-semibold text-zinc-900 truncate">{event.title}</h4>
                                        <span className="text-[10px] text-zinc-400 font-mono whitespace-nowrap">{event.start.slice(11, 16)}</span>
                                    </div>
                                    {event.subtitle && <p className="text-xs text-zinc-500 mt-1 truncate">{event.subtitle}</p>}
                                </div>
                            ))
                        )}
                    </div>

                    <form onSubmit={handleQuickAdd} className="space-y-3 border-t border-black/5 pt-4">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Nowy wpis</p>
                        <input
                            type="text"
                            placeholder="Co się dzieje?"
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            className="w-full py-2 px-3 border border-black/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        />
                        <div className="flex gap-2">
                            <select
                                value={newTime}
                                onChange={e => setNewTime(e.target.value)}
                                className="flex-1 py-2 px-3 border border-black/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white cursor-pointer"
                            >
                                {Array.from({ length: 13 }, (_, i) => {
                                    const hour = String(8 + i).padStart(2, '0');
                                    return <option key={hour} value={`${hour}:00`}>{hour}:00</option>;
                                })}
                            </select>
                            <select
                                value={newReminder}
                                onChange={e => setNewReminder(e.target.value)}
                                className="flex-1 py-2 px-3 border border-black/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white cursor-pointer"
                            >
                                <option value="none">Bez przypomnienia</option>
                                <option value="15">15 minut przed</option>
                                <option value="30">30 minut przed</option>
                                <option value="60">1 godzina przed</option>
                            </select>
                        </div>
                        <button
                            type="submit"
                            className="w-full py-2.5 px-4 bg-zinc-400 hover:bg-zinc-500 text-white font-semibold text-sm rounded-xl transition-all shadow-sm active:scale-[0.98]"
                        >
                            Dodaj
                        </button>
                    </form>
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
                    const dateStr = date.toISOString().slice(0, 10);
                    const dayEvents = getEventsForDate(date);
                    const isToday = dateStr === new Date().toISOString().slice(0, 10);
                    const isDropTarget = dropTargetDate === dateStr;

                    return (
                        <div
                            key={i}
                            onClick={() => onDateClick?.(date)}
                            onDragOver={(e) => handleDragOver(e, dateStr)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, date)}
                            className={`flex flex-col border rounded-lg overflow-hidden cursor-pointer transition-all bg-white
                                ${isToday ? 'ring-2 ring-black border-black' : 'border-black/10'}
                                ${isDropTarget ? 'ring-2 ring-blue-500 bg-blue-50/50 scale-[1.01]' : 'hover:bg-zinc-50/40'}
                            `}
                        >
                            <div className={`p-2 text-center text-sm font-medium border-b ${isToday ? 'bg-zinc-100 text-black border-black/10' : 'bg-zinc-50/50 text-zinc-700 border-black/10'}`}>
                                <div>{['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Ndz'][i]}</div>
                                <div className="text-lg">{date.getDate()}</div>
                            </div>
                            <div className="flex-1 p-2 space-y-2 overflow-y-auto bg-transparent">
                                {dayEvents.map(event => renderEventChip(event, 'md'))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderDayView = () => {
        const dayEvents = getEventsForDate(currentDate);
        dayEvents.sort((a, b) => a.start.localeCompare(b.start));

        return (
            <div className="bg-white rounded-2xl border border-black/10 min-h-[500px] flex flex-col">
                <div
                    className="p-4 border-b border-black/10 bg-zinc-50 flex justify-between items-center cursor-pointer hover:bg-zinc-100 transition-colors rounded-t-2xl"
                    onClick={() => onDateClick?.(currentDate)}
                >
                    <h3 className="text-lg font-semibold text-zinc-900">
                        {currentDate.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </h3>
                    <span className="text-xs text-zinc-500 font-medium bg-white px-2 py-1 rounded border border-black/10">
                        + Dodaj zdarzenie
                    </span>
                </div>
                <div className="flex-1 p-4 space-y-4">
                    {dayEvents.length === 0 ? (
                        <div
                            className="text-center text-zinc-400 py-12 cursor-pointer hover:text-zinc-650 border-2 border-dashed border-transparent hover:border-black/10 rounded-lg"
                            onClick={() => onDateClick?.(currentDate)}
                        >
                            Brak zdarzeń tego dnia. Kliknij, aby dodać.
                        </div>
                    ) : (
                        dayEvents.map(event => {
                            const draggable = isDraggable(event);
                            return (
                                <div
                                    key={event.id}
                                    draggable={draggable}
                                    onDragStart={(e) => handleDragStart(e, event)}
                                    onDragEnd={handleDragEnd}
                                    onClick={(e) => { e.stopPropagation(); onEventClick?.(event); }}
                                    className={`flex items-start p-4 rounded-lg border hover:shadow-md transition-shadow ${getEventColor(event.type)} ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                                >
                                    <div className="w-24 flex-shrink-0 font-mono font-medium text-sm">
                                        {event.start.slice(11, 16)} - {event.end.slice(11, 16)}
                                    </div>
                                    <div className="ml-4 flex-1">
                                        <h4 className="font-semibold text-base flex items-center">
                                            {event.title}
                                            {draggable && <span className="ml-2 text-xs opacity-40">⋮⋮ przeciągnij</span>}
                                        </h4>
                                        {event.subtitle && <p className="text-sm opacity-80 mt-1">{event.subtitle}</p>}
                                        <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] bg-white/50 font-bold uppercase tracking-wider">
                                            {getEventLabel(event.type)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="w-full">
            {view === 'month' && renderMonthView()}
            {view === 'week' && <div className="bg-white rounded-2xl p-6 border border-black/10">{renderWeekView()}</div>}
            {view === 'day' && renderDayView()}
        </div>
    );
}
