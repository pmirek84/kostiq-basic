import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { JobLogEntry, JobLogEntryType } from '../models/types';
import { getAdapter } from '../services/storage/adapterFactory';

const jobLogRepo = getAdapter<JobLogEntry>('site-logs');

export const jobLogStorage = {
    async getAll(): Promise<JobLogEntry[]> {
        return jobLogRepo.getAll();
    },
    async getByJob(jobId: string): Promise<JobLogEntry[]> {
        return jobLogRepo.getByIndex('jobId', jobId);
    },
    async save(entry: JobLogEntry): Promise<string> {
        return jobLogRepo.save(entry);
    },
    async delete(id: string): Promise<void> {
        return jobLogRepo.delete(id);
    }
};

interface JobLogFilters {
    jobId?: string;
    dateFrom?: string;
    dateTo?: string;
    type?: JobLogEntryType;
    visibleToClient?: boolean;
    jobStageId?: string;
}

interface JobLogContextType {
    entries: JobLogEntry[];
    loading: boolean;

    // Actions
    loadEntries: (jobId: string) => Promise<void>;
    addEntry: (entry: Omit<JobLogEntry, 'id' | 'createdAt' | 'updatedAt'>) => Promise<string>;
    updateEntry: (id: string, updates: Partial<JobLogEntry>) => Promise<void>;
    deleteEntry: (id: string) => Promise<void>;

    // Selectors
    getEntriesByJob: (jobId: string, filters?: JobLogFilters) => JobLogEntry[];
    getEntry: (id: string) => JobLogEntry | undefined;
}

const JobLogContext = createContext<JobLogContextType | undefined>(undefined);

export const JobLogProvider = ({ children }: { children: ReactNode }) => {
    const [entries, setEntries] = useState<JobLogEntry[]>([]);
    const [loading, setLoading] = useState(true);

    const loadEntries = async (jobId: string) => {
        setLoading(true);
        try {
            const data = jobId
                ? await jobLogStorage.getByJob(jobId)
                : await jobLogStorage.getAll();
            setEntries(data);
        } catch (e) {
            console.error("Failed to load job logs", e);
        } finally {
            setLoading(false);
        }
    };

    // Load on mount
    useEffect(() => {
        loadEntries('');
    }, []);

    const addEntry = async (entryInput: Omit<JobLogEntry, 'id' | 'createdAt' | 'updatedAt'>) => {
        const id = crypto.randomUUID();
        const newEntry: JobLogEntry = {
            ...entryInput,
            id,
            source: (entryInput as any).source ?? 'internal', // Mark as web-created (not PWA)
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await jobLogStorage.save(newEntry);
        setEntries(prev => [...prev, newEntry]);
        return id;
    };

    const updateEntry = async (id: string, updates: Partial<JobLogEntry>) => {
        const existing = entries.find(e => e.id === id);
        if (!existing) return;

        const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
        await jobLogStorage.save(updated);
        setEntries(prev => prev.map(e => e.id === id ? updated : e));
    };

    const deleteEntry = async (id: string) => {
        await jobLogStorage.delete(id);
        setEntries(prev => prev.filter(e => e.id !== id));
    };

    const getEntriesByJob = (jobId: string, filters?: JobLogFilters) => {
        return entries
            .filter(e => String(e.jobId) === String(jobId))
            .filter(e => {
                if (filters?.dateFrom && e.date < filters.dateFrom) return false;
                if (filters?.dateTo && e.date > filters.dateTo) return false;
                if (filters?.type && e.type !== filters.type) return false;
                if (filters?.visibleToClient !== undefined && e.visibleToClient !== filters.visibleToClient) return false;
                if (filters?.jobStageId && e.jobStageId !== filters.jobStageId) return false;
                return true;
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Newest first
    };

    const getEntry = (id: string) => entries.find(e => e.id === id);

    return (
        <JobLogContext.Provider value={{
            entries,
            loading,
            loadEntries,
            addEntry,
            updateEntry,
            deleteEntry,
            getEntriesByJob,
            getEntry
        }}>
            {children}
        </JobLogContext.Provider>
    );
};

export const useJobLog = () => {
    const context = useContext(JobLogContext);
    if (!context) {
        throw new Error('useJobLog must be used within a JobLogProvider');
    }
    return context;
};
