import type { CalendarEventType } from '../../models/calendar';

interface CalendarFiltersProps {
    filters: Record<CalendarEventType, boolean>;
    onChange: (filters: Record<CalendarEventType, boolean>) => void;
}

export default function CalendarFilters({ filters, onChange }: CalendarFiltersProps) {
    const toggleFilter = (type: CalendarEventType) => {
        onChange({
            ...filters,
            [type]: !filters[type]
        });
    };

    const items: { type: CalendarEventType; label: string; color: string }[] = [
        { type: 'job', label: 'Zlecenia', color: 'bg-blue-500' },
        { type: 'offer', label: 'Oferty', color: 'bg-purple-500' },
        { type: 'measurement', label: 'Pomiary', color: 'bg-orange-500' },
        { type: 'custom', label: 'Inne', color: 'bg-gray-500' },
    ];

    return (
        <div className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-lg shadow-sm border border-gray-200">
            <span className="text-sm font-medium text-gray-500">Filtruj:</span>
            {items.map((item) => (
                <button
                    key={item.type}
                    onClick={() => toggleFilter(item.type)}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-sm transition-all ${filters[item.type]
                            ? 'bg-gray-100 text-gray-900 ring-1 ring-gray-200'
                            : 'opacity-50 grayscale'
                        }`}
                >
                    <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                    <span>{item.label}</span>
                </button>
            ))}
        </div>
    );
}
