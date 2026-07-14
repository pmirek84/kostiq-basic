// src/models/calendar.ts
export type CalendarEventType = 'offer' | 'job' | 'measurement' | 'custom';

export interface CalendarEvent {
    id: string;
    type: CalendarEventType;
    relatedId: string;        // id oferty / zlecenia / pomiaru
    title: string;
    subtitle?: string;
    location?: string;

    // ISO daty
    start: string;            // 2026-01-11T08:00:00
    end: string;              // 2026-01-11T12:00:00

    team?: string[];          // nazwy pracowników / ekipy
    status?: 'planned' | 'in_progress' | 'done' | 'cancelled';
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    client?: string;
    description?: string;
    stageId?: string;         // Opcjonalne: ID etapu dla zdarzeń typu 'job'
}
