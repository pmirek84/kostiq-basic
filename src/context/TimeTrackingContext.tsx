import React, { createContext, useContext, useState, useEffect } from 'react';
import type { TiCoState, TimeEntry, Employee, Project, Note, Payment, Schedule } from '../models/tico';

const STORAGE_KEY = 'tico_state_v2';



// Mock Data
const mockEmployees: Employee[] = [
    { id: 1, name: 'Sasza', daily_rate_pln: 200, hourly_rate_eur: 15 },
    { id: 2, name: 'Lubczyk', daily_rate_pln: 220, hourly_rate_eur: 16 },
    { id: 3, name: 'Kamil', daily_rate_pln: 180, hourly_rate_eur: 14 },
    { id: 4, name: 'Mateusz', daily_rate_pln: 190, hourly_rate_eur: 14.5 },
    { id: 5, name: 'Grzegorz', daily_rate_pln: 250, hourly_rate_eur: 18 },
];

const mockProjects: Project[] = [
    { id: 1, name: 'Montaż Okien - Warszawa', location: 'Warszawa' },
    { id: 2, name: 'Elewacja - Berlin', location: 'Berlin' },
    { id: 3, name: 'Wykończenie - Poznań', location: 'Poznań' },
    { id: 4, name: 'SQ LINE', location: 'Wrocław' },
    { id: 5, name: 'PUF', location: 'Kraków' }
];

const mockNotes: Note[] = [
    {
        note_id: 1,
        author: 'Administrator',
        date: '2024-01-10',
        title: 'Przypomnienie o szkoleniu BHP',
        content: 'Proszę wszystkich o odbycie szkolenia BHP do końca tygodnia.',
        recipients: [1, 2, 3, 4, 5],
        acknowledged_by: [1, 2],
        status: 'active'
    },
    {
        note_id: 2,
        author: 'Administrator',
        date: '2024-01-12',
        title: 'Zmiana lokalizacji pracy w Berlinie',
        content: 'Od poniedziałku pracujemy na nowej budowie przy Alexanderplatz.',
        recipients: [2],
        acknowledged_by: [],
        status: 'active'
    }
];

const initialState: TiCoState & { schedules: Schedule[] } = { // Exteding state locally if needed
    timeEntries: [],
    employees: mockEmployees,
    projects: mockProjects,
    notes: mockNotes,
    payments: [],
    daysOff: [],
    schedules: []
};


interface TimeTrackingContextType extends TiCoState {
    schedules: Schedule[]; // Add schedules to interface
    // Time Entries
    addTimeEntry: (entry: Omit<TimeEntry, 'id' | 'approval_status'>) => void;
    updateTimeEntry: (id: number, updates: Partial<TimeEntry>) => void;
    deleteTimeEntry: (id: number) => void;

    // Employees
    addEmployee: (employee: Omit<Employee, 'id'>) => void;
    updateEmployee: (id: number, updates: Partial<Employee>) => void;
    deleteEmployee: (id: number) => void;

    // Projects
    addProject: (project: Omit<Project, 'id'>) => void;
    updateProject: (id: number, updates: Partial<Project>) => void;
    deleteProject: (id: number) => void;

    // Notes
    addNote: (note: Note) => void;
    deleteNote: (id: number) => void;
    acknowledgeNote: (noteId: number, employeeId: number) => void;

    // Schedules
    addSchedule: (schedule: Omit<Schedule, 'id'>) => void;
    updateSchedule: (id: number, updates: Partial<Schedule>) => void;
    deleteSchedule: (id: number) => void;

    // Payments / Advances
    // Payments / Advances
    addPayment: (payment: Payment) => void;
    advanceRequests: any[];

    // Import/Export (Legacy/Migration Support)
    importTimeEntries: (entries: TimeEntry[]) => void;
    importPerformanceData: (data: any[]) => void;
    clearTimeTrackingData: () => void;
    importedTimeEntries: TimeEntry[]; // Alias for timeEntries
    importedPerformance: any[]; // Placeholder
    lastImportAt: string | null;
}

const TimeTrackingContext = createContext<TimeTrackingContextType | undefined>(undefined);

export function TimeTrackingProvider({ children }: { children: React.ReactNode }) {
    // We extend the base state with schedules dynamically
    const [state, setState] = useState<TiCoState & { schedules: Schedule[], advanceRequests: any[], lastImportAt: string | null }>({
        ...initialState,
        schedules: [],
        advanceRequests: [],
        lastImportAt: null
    });

    // ... (rest of useEffects) ...
    // Note: You need to keep the existing useEffects here, check lines below.

    // Load from storage
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setState((prev: any) => ({ ...prev, ...parsed }));
            } catch (e) {
                console.error('Failed to parse tico state', e);
            }
        }
    }, []);

    // Save to storage
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, [state]);

    // ... (CRUD functions) ...

    const importTimeEntries = (entries: TimeEntry[]) => {
        setState((prev: any) => ({
            ...prev,
            timeEntries: [...prev.timeEntries, ...entries],
            lastImportAt: new Date().toISOString()
        }));
    };

    const importPerformanceData = (data: any[]) => {
        console.log('Import performance not fully implemented on v2 context', data);
    };

    const clearTimeTrackingData = () => {
        setState(prev => ({ ...prev, timeEntries: [], lastImportAt: null }));
    };

    // ... (Rest of return) ...

    // --- Time Entries ---
    const addTimeEntry = (entryInput: Omit<TimeEntry, 'id' | 'approval_status'>) => {
        const newEntry: TimeEntry = {
            ...entryInput,
            id: Date.now(),
            approval_status: 'Oczekujące'
        };
        setState(prev => ({ ...prev, timeEntries: [...prev.timeEntries, newEntry] }));
    };

    const updateTimeEntry = (id: number, updates: Partial<TimeEntry>) => {
        setState(prev => ({
            ...prev,
            timeEntries: prev.timeEntries.map((e: TimeEntry) => e.id === id ? { ...e, ...updates, updated_at: new Date().toISOString().split('T')[0] } : e)
        }));
    };

    const deleteTimeEntry = (id: number) => {
        setState(prev => ({ ...prev, timeEntries: prev.timeEntries.filter((e: TimeEntry) => e.id !== id) }));
    };

    // --- Employees ---
    const addEmployee = (employeeData: Omit<Employee, 'id'>) => {
        const newEmployee: Employee = { ...employeeData, id: Date.now() };
        setState(prev => ({ ...prev, employees: [...prev.employees, newEmployee] }));
    };

    const updateEmployee = (id: number, updates: Partial<Employee>) => {
        setState(prev => ({
            ...prev,
            employees: prev.employees.map((e: Employee) => e.id === id ? { ...e, ...updates } : e)
        }));
    };

    const deleteEmployee = (id: number) => {
        setState(prev => ({ ...prev, employees: prev.employees.filter((e: Employee) => e.id !== id) }));
    };

    // --- Projects ---
    const addProject = (projectData: Omit<Project, 'id'>) => {
        const newProject: Project = { ...projectData, id: Date.now() };
        setState(prev => ({ ...prev, projects: [...prev.projects, newProject] }));
    };

    const updateProject = (id: number, updates: Partial<Project>) => {
        setState(prev => ({
            ...prev,
            projects: prev.projects.map((p: Project) => p.id === id ? { ...p, ...updates } : p)
        }));
    };

    const deleteProject = (id: number) => {
        setState(prev => ({ ...prev, projects: prev.projects.filter((p: Project) => p.id !== id) }));
    };

    // --- Notes ---
    const addNote = (note: Note) => {
        // Ensure note has an ID if not provided (though interface says it has one)
        const newNote = { ...note, note_id: note.note_id || Date.now() };
        setState(prev => ({ ...prev, notes: [...prev.notes, newNote] }));
    };

    const deleteNote = (id: number) => {
        setState(prev => ({ ...prev, notes: prev.notes.filter((n: Note) => n.note_id !== id) }));
    };

    const acknowledgeNote = (noteId: number, employeeId: number) => {
        setState(prev => ({
            ...prev,
            notes: prev.notes.map((n: Note) =>
                n.note_id === noteId && !n.acknowledged_by.includes(employeeId)
                    ? { ...n, acknowledged_by: [...n.acknowledged_by, employeeId] }
                    : n
            )
        }));
    };

    // --- Schedules ---
    const addSchedule = (scheduleData: Omit<Schedule, 'id'>) => {
        const newSchedule: Schedule = { ...scheduleData, id: Date.now() };
        setState(prev => ({ ...prev, schedules: [...prev.schedules, newSchedule] }));
    };

    const updateSchedule = (id: number, updates: Partial<Schedule>) => {
        setState(prev => ({
            ...prev,
            schedules: prev.schedules.map((s: Schedule) => s.id === id ? { ...s, ...updates } : s)
        }));
    };

    const deleteSchedule = (id: number) => {
        setState(prev => ({ ...prev, schedules: prev.schedules.filter((s: Schedule) => s.id !== id) }));
    };

    // --- Payments ---
    const addPayment = (payment: Payment) => {
        setState(prev => ({ ...prev, payments: [...prev.payments, payment] }));
    };

    return (
        <TimeTrackingContext.Provider value={{
            ...state,
            addTimeEntry,
            updateTimeEntry,
            deleteTimeEntry,
            addEmployee,
            updateEmployee,
            deleteEmployee,
            addProject,
            updateProject,
            deleteProject,
            addNote,
            deleteNote,
            acknowledgeNote,
            addSchedule,
            updateSchedule,
            deleteSchedule,
            addPayment,
            importTimeEntries,
            importPerformanceData,
            clearTimeTrackingData,
            importedTimeEntries: state.timeEntries,
            importedPerformance: [],
            lastImportAt: state.lastImportAt
        }}>
            {children}
        </TimeTrackingContext.Provider>
    );
}

export function useTimeTracking() {
    const context = useContext(TimeTrackingContext);
    if (context === undefined) {
        throw new Error('useTimeTracking must be used within a TimeTrackingProvider');
    }
    return context;
}
