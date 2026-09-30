/**
 * @deprecated Legacy TimeTrackingContext has been replaced by TiCoContext.
 * This shim is maintained solely for backward compatibility and delegates
 * directly to TiCoContext without any localStorage state or mock pollution.
 */
import React from 'react';
import { useTiCo } from './TiCoContext';
export interface Schedule {
    id: string | number;
    [key: string]: any;
}

export interface TimeTrackingContextType {
    timeEntries: any[];
    employees: any[];
    schedules: Schedule[];
    projects: any[];
    notes: any[];
    payments: any[];
    daysOff: any[];
    importTimeEntries: (entries: any[]) => Promise<any>;
    importPerformanceData: (data: any[]) => Promise<void>;
    clearTimeTrackingData: () => Promise<any>;
    importedTimeEntries: any[];
    importedPerformance: any[];
    lastImportAt: string | null;
    [key: string]: any;
}

export function TimeTrackingProvider({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}

export function useTimeTracking(): TimeTrackingContextType {
    const tico = useTiCo();
    return {
        ...tico,
        timeEntries: tico.timeEntries,
        employees: tico.employees,
        schedules: [],
        projects: [],
        notes: [],
        payments: [],
        daysOff: [],
        importTimeEntries: tico.importTimeEntries,
        importPerformanceData: async () => {},
        clearTimeTrackingData: tico.clearTimeEntries,
        importedTimeEntries: [],
        importedPerformance: [],
        lastImportAt: null,
    };
}
