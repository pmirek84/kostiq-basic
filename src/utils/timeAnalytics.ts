import type { TimeEntry } from '../models/types';

export interface JobTimeSummary {
    jobCode: string;
    totalWorkHours: number;
    totalDriveHours: number;
    totalHours: number;
    entriesByEmployee: {
        employeeName: string;
        workHours: number;
        driveHours: number;
        totalHours: number;
    }[];
}

export function summarizeTimeForJob(jobCode: string, entries: TimeEntry[]): JobTimeSummary {
    const jobEntries = entries.filter(e => e.jobCode === jobCode && (e.approved ?? true));

    const map = new Map<string, { work: number; drive: number }>();

    for (const e of jobEntries) {
        const name = e.employeeName || 'Nieznany';
        if (!map.has(name)) {
            map.set(name, { work: 0, drive: 0 });
        }
        const rec = map.get(name)!;
        if (e.type === 'work') {
            rec.work += e.hours;
        } else if (e.type === 'drive') {
            rec.drive += e.hours;
        }
    }

    const entriesByEmployee = Array.from(map.entries()).map(([employeeName, v]) => ({
        employeeName,
        workHours: v.work,
        driveHours: v.drive,
        totalHours: v.work + v.drive
    }));

    const totalWorkHours = entriesByEmployee.reduce((s, e) => s + e.workHours, 0);
    const totalDriveHours = entriesByEmployee.reduce((s, e) => s + e.driveHours, 0);
    const totalHours = totalWorkHours + totalDriveHours;

    return {
        jobCode,
        totalWorkHours,
        totalDriveHours,
        totalHours,
        entriesByEmployee
    };
}
