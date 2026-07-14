import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ClientReport, ClientReportEntry, ClientReportStatus } from '../models/types';
import { useJobLog } from './JobLogContext';
import { clientReportStorage } from '../services/storage/clientReportStorage';

interface CreateReportOptions {
    jobId: string;
    periodStart: string;
    periodEnd: string;
    type: 'daily' | 'weekly' | 'monthly' | 'custom';
    title: string;
    includePhotos: boolean;
    includeExtraCosts: boolean;
}

interface ClientReportsContextType {
    reports: ClientReport[];
    loading: boolean;

    // Actions
    getReportsByJob: (jobId: string) => ClientReport[];
    getReport: (id: string) => ClientReport | undefined;

    createReportFromDiary: (options: CreateReportOptions) => Promise<string>;
    updateReport: (id: string, updates: Partial<ClientReport>) => Promise<void>;
    updateReportStatus: (id: string, status: ClientReportStatus) => Promise<void>;
    deleteReport: (id: string) => Promise<void>;
}

const ClientReportsContext = createContext<ClientReportsContextType | undefined>(undefined);

export const ClientReportsProvider = ({ children }: { children: ReactNode }) => {
    const [reports, setReports] = useState<ClientReport[]>([]);
    const [loading, setLoading] = useState(true);

    const { getEntriesByJob } = useJobLog();

    const loadReports = async () => {
        setLoading(true);
        try {
            const data = await clientReportStorage.getAll();
            setReports(data);
        } catch (e) {
            console.error("Failed to load client reports", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReports();
    }, []);

    const getReportsByJob = (jobId: string) => {
        return reports
            .filter(r => r.jobId === jobId)
            .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
    };

    const getReport = (id: string) => reports.find(r => r.id === id);

    const createReportFromDiary = async (options: CreateReportOptions): Promise<string> => {
        const entries = getEntriesByJob(options.jobId, {
            dateFrom: options.periodStart,
            dateTo: options.periodEnd,
            visibleToClient: true
        });

        const reportEntries: ClientReportEntry[] = entries.map((log, index) => ({
            logEntryId: log.id,
            include: true,
            originalText: log.text,
            customTitle: log.title,
            customText: log.text,
            order: index,
            entryDate: log.date,
            entryType: log.type,
            photos: options.includePhotos ? log.photos : []
        }));

        let extraCostsSummary = 0;
        if (options.includeExtraCosts) {
            entries.forEach(e => {
                if (e.extraCosts) {
                    extraCostsSummary += e.extraCosts.reduce((sum, cost) => sum + cost.amount, 0);
                }
            });
        }

        const newReport: ClientReport = {
            id: uuidv4(),
            jobId: options.jobId,
            periodStart: options.periodStart,
            periodEnd: options.periodEnd,
            type: options.type,
            title: options.title,
            generatedBy: 'Admin',
            generatedAt: new Date().toISOString(),
            status: 'draft',
            entries: reportEntries,
            summary: {
                intro: `Raport z okresu ${options.periodStart} - ${options.periodEnd}`,
                issues: '',
                nextSteps: '',
                extraCostsSummary
            }
        };

        await clientReportStorage.save(newReport);
        setReports(prev => [newReport, ...prev]);
        return newReport.id;
    };

    const updateReport = async (id: string, updates: Partial<ClientReport>) => {
        const existing = reports.find(r => r.id === id);
        if (!existing) return;
        const updated = { ...existing, ...updates };
        await clientReportStorage.save(updated);
        setReports(prev => prev.map(r => r.id === id ? updated : r));
    };

    const updateReportStatus = async (id: string, status: ClientReportStatus) => {
        const updates: Partial<ClientReport> = { status };
        if (status === 'sent') {
            updates.sentAt = new Date().toISOString();
        }
        await updateReport(id, updates);
    };

    const deleteReport = async (id: string) => {
        await clientReportStorage.delete(id);
        setReports(prev => prev.filter(r => r.id !== id));
    };

    return (
        <ClientReportsContext.Provider value={{
            reports,
            loading,
            getReportsByJob,
            getReport,
            createReportFromDiary,
            updateReport,
            updateReportStatus,
            deleteReport
        }}>
            {children}
        </ClientReportsContext.Provider>
    );
};

export const useClientReports = () => {
    const context = useContext(ClientReportsContext);
    if (!context) {
        throw new Error('useClientReports must be used within a ClientReportsProvider');
    }
    return context;
};
