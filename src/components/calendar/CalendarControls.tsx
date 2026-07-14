import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '../ui/Button';

export type CalendarView = 'month' | 'week' | 'day';

interface CalendarControlsProps {
    currentDate: Date;
    view: CalendarView;
    onViewChange: (view: CalendarView) => void;
    onDateChange: (date: Date) => void;
    onAddEvent: () => void;
    mode: 'events' | 'capacity' | 'timeline';
    onModeChange: (mode: 'events' | 'capacity' | 'timeline') => void;
}

export default function CalendarControls({
    currentDate,
    view,
    onViewChange,
    onDateChange,
    onAddEvent,
    mode,
    onModeChange
}: CalendarControlsProps) {

    const handlePrev = () => {
        const newDate = new Date(currentDate);
        if (view === 'month') newDate.setMonth(newDate.getMonth() - 1);
        if (view === 'week') newDate.setDate(newDate.getDate() - 7);
        if (view === 'day') newDate.setDate(newDate.getDate() - 1);
        onDateChange(newDate);
    };

    const handleNext = () => {
        const newDate = new Date(currentDate);
        if (view === 'month') newDate.setMonth(newDate.getMonth() + 1);
        if (view === 'week') newDate.setDate(newDate.getDate() + 7);
        if (view === 'day') newDate.setDate(newDate.getDate() + 1);
        onDateChange(newDate);
    };

    const handleToday = () => {
        onDateChange(new Date());
    };

    const getLabel = () => {
        const formatter = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' });
        return formatter.format(currentDate);
    };

    return (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-1">
                    <button onClick={handlePrev} className="p-1 hover:bg-gray-100 rounded-full">
                        <ChevronLeft className="h-5 w-5 text-gray-600" />
                    </button>
                    <button onClick={handleNext} className="p-1 hover:bg-gray-100 rounded-full">
                        <ChevronRight className="h-5 w-5 text-gray-600" />
                    </button>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 capitalize min-w-[200px] text-center">
                    {getLabel()}
                </h2>
                <Button variant="secondary" onClick={handleToday} className="text-sm">
                    Dzisiaj
                </Button>
            </div>

            <div className="flex items-center space-x-4">
                {/* Mode Toggles */}
                <div className="flex bg-gray-100 p-1 rounded-xl mr-2">
                    <button
                        onClick={() => onModeChange('events')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${mode === 'events'
                            ? 'bg-white text-black font-semibold'
                            : 'text-zinc-500 hover:text-zinc-900'
                            }`}
                    >
                        Zdarzenia
                    </button>
                    <button
                        onClick={() => onModeChange('capacity')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${mode === 'capacity'
                            ? 'bg-white text-black font-semibold'
                            : 'text-zinc-500 hover:text-zinc-900'
                            }`}
                    >
                        Moce przerobowe
                    </button>
                    <button
                        onClick={() => onModeChange('timeline')}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${mode === 'timeline'
                            ? 'bg-white text-black font-semibold'
                            : 'text-zinc-500 hover:text-zinc-900'
                            }`}
                    >
                        Oś czasu
                    </button>
                </div>

                <div className="flex bg-gray-100 p-1 rounded-xl">
                    {(['month', 'week', 'day'] as CalendarView[]).map((v) => (
                        <button
                            key={v}
                            onClick={() => onViewChange(v)}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${view === v
                                ? 'bg-white text-black font-semibold'
                                : 'text-zinc-500 hover:text-zinc-900'
                                }`}
                        >
                            {v === 'month' ? 'Miesiąc' : v === 'week' ? 'Tydzień' : 'Dzień'}
                        </button>
                    ))}
                </div>

                <Button onClick={onAddEvent}>
                    <Plus className="h-4 w-4 mr-2" />
                    Dodaj zdarzenie
                </Button>
            </div>
        </div>
    );
}
