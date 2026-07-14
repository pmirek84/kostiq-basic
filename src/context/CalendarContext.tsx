import React, { createContext, useContext, useState, useEffect } from 'react';
import type { CalendarEvent } from '../models/calendar';
import { calendarStorage } from '../services/storage/calendarStorage';

interface CalendarContextType {
    events: CalendarEvent[];
    error: string | null;
    isLoading: boolean;
    addEvent: (event: Omit<CalendarEvent, 'id'>) => Promise<void>;
    updateEvent: (event: CalendarEvent) => Promise<void>;
    deleteEvent: (id: string) => Promise<void>;
    refreshEvents: () => Promise<void>;
}

const CalendarContext = createContext<CalendarContextType | null>(null);

export function CalendarProvider({ children }: { children: React.ReactNode }) {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const loadEvents = async () => {
        try {
            setError(null);
            setIsLoading(true);
            const data = await calendarStorage.getEvents();
            setEvents(data);
        } catch (err) {
            console.error('Error loading events:', err);
            setError('Nie udało się załadować wydarzeń');
        } finally {
            setIsLoading(false);
        }
    };

    // Load events on mount
    useEffect(() => {
        loadEvents();
    }, []);

    const addEvent = async (event: Omit<CalendarEvent, 'id'>) => {
        try {
            setError(null);
            const id = crypto.randomUUID();
            const newEvent: CalendarEvent = { ...event, id };
            await calendarStorage.addEvent(newEvent);
            setEvents(prev => [...prev, newEvent]);
        } catch (err) {
            console.error('Error adding event:', err);
            throw err instanceof Error ? err : new Error('Wystąpił błąd podczas dodawania wydarzenia');
        }
    };

    const updateEvent = async (event: CalendarEvent) => {
        try {
            setError(null);
            await calendarStorage.updateEvent(event);
            setEvents(prev => prev.map(e => e.id === event.id ? event : e));
        } catch (err) {
            console.error('Error updating event:', err);
            throw err instanceof Error ? err : new Error('Wystąpił błąd podczas aktualizacji wydarzenia');
        }
    };

    const deleteEvent = async (id: string) => {
        try {
            setError(null);
            await calendarStorage.deleteEvent(id);
            setEvents(prev => prev.filter(e => e.id !== id));
        } catch (err) {
            console.error('Error deleting event:', err);
            throw err instanceof Error ? err : new Error('Wystąpił błąd podczas usuwania wydarzenia');
        }
    };

    return (
        <CalendarContext.Provider value={{
            events,
            error,
            isLoading,
            addEvent,
            updateEvent,
            deleteEvent,
            refreshEvents: loadEvents
        }}>
            {children}
        </CalendarContext.Provider>
    );
}

export function useCalendar() {
    const context = useContext(CalendarContext);
    if (!context) {
        throw new Error('useCalendar must be used within a CalendarProvider');
    }
    return context;
}
