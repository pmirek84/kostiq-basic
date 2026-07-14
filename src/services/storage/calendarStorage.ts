import type { CalendarEvent } from '../../models/calendar';
import { getAdapter } from './adapterFactory';

const repo = getAdapter<CalendarEvent>('custom-events');

export const calendarStorage = {
    async getEvents(): Promise<CalendarEvent[]> {
        return repo.getAll();
    },

    async addEvent(event: CalendarEvent): Promise<string> {
        return repo.save(event);
    },

    async updateEvent(event: CalendarEvent): Promise<void> {
        await repo.save(event);
    },

    async deleteEvent(id: string): Promise<void> {
        await repo.delete(id);
    }
};
