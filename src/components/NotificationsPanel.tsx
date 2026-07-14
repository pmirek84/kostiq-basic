import { useState, useEffect } from 'react';
import { Calendar, CheckSquare, Clock, Edit2, Save, X } from 'lucide-react';
import { useCalendar } from '../context/CalendarContext';
import type { CalendarEvent } from '../models/calendar';

export default function NotificationsPanel() {
    const { events, refreshEvents, updateEvent } = useCalendar();
    const [groupedEvents, setGroupedEvents] = useState<Record<string, CalendarEvent[]>>({});
    const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
    const [editForm, setEditForm] = useState<Partial<CalendarEvent>>({});
    const [error, setError] = useState<string | null>(null);

    // Load events only once when component mounts
    useEffect(() => {
        refreshEvents();
    }, []); // Empty dependency array to run only once

    // Update grouped events when events change
    useEffect(() => {
        const now = new Date();
        const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const upcomingEvents = events
            .filter(event => {
                const eventDate = new Date(event.start);
                return eventDate >= now && eventDate <= nextMonth;
            })
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

        const grouped = upcomingEvents.reduce((acc, event) => {
            if (!acc[event.type]) {
                acc[event.type] = [];
            }
            acc[event.type].push(event);
            return acc;
        }, {} as Record<string, CalendarEvent[]>);

        setGroupedEvents(grouped);
    }, [events]); // Only re-run when events change

    const handleStartEdit = (event: CalendarEvent) => {
        setEditingEvent(event);
        setEditForm({
            ...event,
            start: event.start,
            end: event.end || event.start
        });
        setError(null);
    };

    const handleCancelEdit = () => {
        setEditingEvent(null);
        setEditForm({});
        setError(null);
    };

    const handleSaveEdit = async () => {
        if (!editingEvent || !editForm.title || !editForm.start) {
            setError('Brakuje wymaganych pól');
            return;
        }

        try {
            const updatedEvent: CalendarEvent = {
                ...editingEvent,
                ...editForm,
                id: editingEvent.id,
                type: editForm.type || editingEvent.type,
                start: editForm.start,
                end: editForm.end || editForm.start
            };

            await updateEvent(updatedEvent);
            setEditingEvent(null);
            setEditForm({});
            setError(null);
            await refreshEvents();
        } catch (error) {
            console.error('Error updating event:', error);
            setError(error instanceof Error ? error.message : 'Nie udało się zaktualizować wydarzenia');
        }
    };

    const formatEventTime = (date: string) => {
        const eventDate = new Date(date);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (eventDate.toDateString() === today.toDateString()) {
            return `Dziś, ${eventDate.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
        } else if (eventDate.toDateString() === tomorrow.toDateString()) {
            return `Jutro, ${eventDate.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            return eventDate.toLocaleString('pl-PL', {
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
    };

    const getEventTypeColor = (type: string) => {
        switch (type) {
            case 'Oferta':
                return 'bg-[#21808D] text-white';
            case 'Zlecenie':
                return 'bg-[#27AE60] text-white';
            case 'Spotkanie':
                return 'bg-[#FFC185] text-gray-900';
            case 'Montaż':
                return 'bg-[#8E44AD] text-white';
            default:
                return 'bg-[#95A5A6] text-white';
        }
    };

    const eventTypes = Object.keys(groupedEvents).sort((a, b) => {
        const order = ['Oferta', 'Zlecenie', 'Montaż', 'Spotkanie', 'Inne'];
        return order.indexOf(a) - order.indexOf(b);
    });

    return (
        <div className="h-full overflow-y-auto">
            <div className="p-4 border-b border-gray-700">
                <h2 className="text-lg font-semibold text-gray-200">Nadchodzące wydarzenia</h2>
            </div>

            <div className="divide-y divide-gray-700">
                {eventTypes.length > 0 ? (
                    eventTypes.map(type => (
                        <div key={type} className="p-4">
                            <div className={`inline-flex items-center px-3 py-1 rounded-full mb-4 ${getEventTypeColor(type)}`}>
                                <span className="text-sm font-medium">{type}</span>
                            </div>

                            <div className="space-y-3">
                                {groupedEvents[type].map(event => (
                                    <div
                                        key={event.id}
                                        className={`p-3 rounded-lg border-l-4 bg-gray-800 ${event.priority === 'urgent' ? 'border-l-red-500' :
                                            event.priority === 'high' ? 'border-l-orange-500' :
                                                event.priority === 'normal' ? 'border-l-[#21808D]' :
                                                    'border-l-gray-500'
                                            }`}
                                    >
                                        {editingEvent?.id === event.id ? (
                                            <div className="space-y-3">
                                                {error && (
                                                    <div className="text-sm text-red-400 bg-red-900 p-2 rounded">
                                                        {error}
                                                    </div>
                                                )}

                                                <input
                                                    type="text"
                                                    value={editForm.title || ''}
                                                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                                    className="form-input text-sm"
                                                    placeholder="Tytuł"
                                                />

                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="block text-xs text-gray-400 mb-1">Data</label>
                                                        <input
                                                            type="date"
                                                            value={new Date(editForm.start || '').toISOString().split('T')[0]}
                                                            onChange={(e) => {
                                                                const date = e.target.value;
                                                                const currentStart = new Date(editForm.start || '');
                                                                const currentEnd = new Date(editForm.end || editForm.start || '');

                                                                const newStart = new Date(date);
                                                                newStart.setHours(currentStart.getHours(), currentStart.getMinutes());

                                                                const newEnd = new Date(date);
                                                                newEnd.setHours(currentEnd.getHours(), currentEnd.getMinutes());

                                                                setEditForm({
                                                                    ...editForm,
                                                                    start: newStart.toISOString(),
                                                                    end: newEnd.toISOString()
                                                                });
                                                            }}
                                                            className="form-input text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-gray-400 mb-1">Godzina</label>
                                                        <input
                                                            type="time"
                                                            value={new Date(editForm.start || '').toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                                            onChange={(e) => {
                                                                const time = e.target.value;
                                                                const [hours, minutes] = time.split(':');
                                                                const currentStart = new Date(editForm.start || '');
                                                                currentStart.setHours(parseInt(hours), parseInt(minutes));

                                                                const currentEnd = new Date(currentStart);
                                                                currentEnd.setHours(currentStart.getHours() + 1);

                                                                setEditForm({
                                                                    ...editForm,
                                                                    start: currentStart.toISOString(),
                                                                    end: currentEnd.toISOString()
                                                                });
                                                            }}
                                                            className="form-input text-sm"
                                                        />
                                                    </div>
                                                </div>

                                                <input
                                                    type="text"
                                                    value={editForm.client || ''}
                                                    onChange={(e) => setEditForm({ ...editForm, client: e.target.value })}
                                                    className="form-input text-sm"
                                                    placeholder="Klient"
                                                />
                                                <input
                                                    type="text"
                                                    value={editForm.location || ''}
                                                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                                                    className="form-input text-sm"
                                                    placeholder="Lokalizacja"
                                                />
                                                <textarea
                                                    value={editForm.description || ''}
                                                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                                    className="form-textarea text-sm"
                                                    placeholder="Opis"
                                                    rows={2}
                                                />
                                                <div className="flex space-x-2">
                                                    <select
                                                        value={editForm.status || 'planned'}
                                                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value as CalendarEvent['status'] })}
                                                        className="form-select text-sm flex-1"
                                                    >
                                                        <option value="planned">Zaplanowane</option>
                                                        <option value="in_progress">W trakcie</option>
                                                        <option value="done">Zakończone</option>
                                                        <option value="cancelled">Anulowane</option>
                                                    </select>
                                                    <select
                                                        value={editForm.priority || 'normal'}
                                                        onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as CalendarEvent['priority'] })}
                                                        className="form-select text-sm flex-1"
                                                    >
                                                        <option value="low">Niski</option>
                                                        <option value="normal">Normalny</option>
                                                        <option value="high">Wysoki</option>
                                                        <option value="urgent">Pilny</option>
                                                    </select>
                                                </div>
                                                <div className="flex justify-end space-x-2 pt-2">
                                                    <button
                                                        onClick={handleCancelEdit}
                                                        className="btn-secondary text-sm py-1"
                                                    >
                                                        <X className="h-4 w-4 mr-1" />
                                                        Anuluj
                                                    </button>
                                                    <button
                                                        onClick={handleSaveEdit}
                                                        className="btn-primary text-sm py-1"
                                                    >
                                                        <Save className="h-4 w-4 mr-1" />
                                                        Zapisz
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="relative group">
                                                <button
                                                    onClick={() => handleStartEdit(event)}
                                                    className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>

                                                <h3 className="font-medium text-gray-200 pr-8">{event.title}</h3>
                                                <p className="text-sm text-gray-400 mt-1">
                                                    <Clock className="inline-block h-4 w-4 mr-1" />
                                                    {formatEventTime(event.start)}
                                                </p>

                                                {event.client && (
                                                    <p className="text-sm text-gray-400 mt-1">
                                                        Klient: {event.client}
                                                    </p>
                                                )}

                                                {event.location && (
                                                    <p className="text-sm text-gray-400">
                                                        Miejsce: {event.location}
                                                    </p>
                                                )}

                                                {event.status && (
                                                    <div className="mt-2">
                                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${event.status === 'done' ? 'bg-green-900 text-green-200' :
                                                            event.status === 'in_progress' ? 'bg-blue-900 text-blue-200' :
                                                                event.status === 'cancelled' ? 'bg-red-900 text-red-200' :
                                                                    'bg-gray-700 text-gray-300'
                                                            }`}>
                                                            <CheckSquare className="h-3 w-3 mr-1" />
                                                            {event.status === 'done' ? 'Zakończone' :
                                                                event.status === 'in_progress' ? 'W trakcie' :
                                                                    event.status === 'cancelled' ? 'Anulowane' :
                                                                        'Zaplanowane'}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="p-8 text-center text-gray-400">
                        <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-500" />
                        <p className="text-lg font-medium text-gray-300 mb-1">
                            Brak nadchodzących wydarzeń
                        </p>
                        <p>Dodaj nowe wydarzenia do kalendarza</p>
                    </div>
                )}
            </div>
        </div>
    );
}
