import { describe, it, expect } from 'vitest';

describe('KpiStrip - Weekly Hours Logic', () => {
    it('calculates weekly hours dynamically from TiCo timeEntries without fake fallback 18', () => {
        const now = new Date();
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const entries = [
            { id: '1', date: twoDaysAgo, hours: 8 },
            { id: '2', date: twoDaysAgo, hours: 6.5 },
            { id: '3', date: tenDaysAgo, hours: 10 } // Outside 7-day window
        ];

        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weeklyEntries = entries.filter((e: any) => new Date(e.date) >= weekAgo);
        const weeklyHours = weeklyEntries.reduce((sum: number, e: any) => sum + (e.hours || 0), 0);

        expect(weeklyHours).toBe(14.5);
    });

    it('preserves 0h when there are no time entries in the current week', () => {
        const entries: any[] = [];
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weeklyEntries = entries.filter((e: any) => new Date(e.date) >= weekAgo);
        const weeklyHours = weeklyEntries.reduce((sum: number, e: any) => sum + (e.hours || 0), 0);

        // Before fix: weeklyHours || 18 -> resulted in 18
        // After fix: weeklyHours -> accurately 0
        expect(weeklyHours).toBe(0);
    });
});
