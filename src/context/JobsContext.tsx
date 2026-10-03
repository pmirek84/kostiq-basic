import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Job, JobStage, JobStageItem, Offer, Construction } from '../models/types';
import type { JobPostPayload } from '../../shared/contracts/job.generated';
import { v4 as uuidv4 } from 'uuid';
import { jobStorage } from '../services/storage/jobStorage';
import { jobStageItemStorage } from '../services/storage/jobStageItemStorage';
import { offerStorage } from '../services/storage/offerStorage';
import { OfferToJobAdapter } from '../services/adapters/OfferToJobAdapter';
import { useClients } from './ClientsContext';
import { toast } from 'sonner';

interface JobsContextType {
    jobs: Job[];
    addJob: (jobData: JobPostPayload, idempotencyKey?: string) => Promise<Job>;
    updateJob: (id: string, updates: Partial<Job>) => Promise<void>;
    deleteJob: (id: string, expectedVersion?: number) => Promise<void>;
    getJob: (id: string) => Job | undefined;
    getJobStages: (jobId: string) => JobStage[];
    createJobWithStages: (jobData: any, stages: any[], allocations: any[], idempotencyKey?: string) => Promise<void>;
    addJobStage: (jobId: string, stageData: any) => Promise<void>;
    updateJobStage: (jobId: string, stageId: string, updates: any) => Promise<void>;
    deleteJobStage: (jobId: string, stageId: string) => Promise<void>;

    // Stage Items (BOM)
    getJobStageItems: (jobId: string) => Promise<JobStageItem[]>;
    addJobStageItem: (item: Omit<JobStageItem, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
    updateJobStageItem: (id: string, updates: Partial<JobStageItem>) => Promise<void>;
    deleteJobStageItem: (id: string) => Promise<void>;

    refreshJobs: () => Promise<void>;
}

export const JobsContext = createContext<JobsContextType | undefined>(undefined);

export function JobsProvider({ children }: { children: ReactNode }) {
    const [jobs, setJobs] = useState<Job[]>([]);
    const { clients } = useClients();

    const refreshJobs = useCallback(async () => {
        try {
            const data = await jobStorage.getAllJobs();

            // Migration / Data cleanup on load
            const migrated = data.map(job => {
                const needsMigration = !job.stages || job.stages.length === 0;
                let processedJob = job;

                if (needsMigration) {
                    // Ensure at least one stage exists if missing
                    processedJob = {
                        ...job,
                        stages: [{
                            id: uuidv4(),
                            jobId: job.id,
                            name: 'Etap podstawowy',
                            type: 'podstawowy' as const,
                            status: (job.status === 'done' ? 'zakończony' : 'w_toku') as 'zakończony' | 'w_toku',
                            plannedRevenueNet: job.totalPlannedRevenueNet || 0,
                            billingType: 'hourly' as const
                        }]
                    };
                }

                // DYNAMIC CLIENT NAME SYNC:
                // If we have the client in context, use their latest name instead of the denormalized one
                const client = clients.find(c => c.id === job.clientId);
                if (client) {
                    const latestName = client.type === 'company' && client.company
                        ? client.company
                        : `${client.name} ${client.lastName}`.trim();

                    if (processedJob.clientName !== latestName) {
                        processedJob = { ...processedJob, clientName: latestName };
                    }
                }

                return processedJob;
            });

            setJobs(migrated);
        } catch (error) {
            console.error('Failed to load jobs:', error);
            toast.error('Błąd podczas odświeżania zleceń');
        }
    }, [clients]);

    useEffect(() => {
        refreshJobs();
    }, []);



    const addJob = async (jobData: JobPostPayload, idempotencyKey?: string): Promise<Job> => {
        const jobId = jobData.id || uuidv4();

        const postPayload: JobPostPayload = {
            ...jobData,
            id: jobId,
            status: jobData.status || 'planned',
            riskFlag: jobData.riskFlag || 'none',
            stages: (jobData.stages && jobData.stages.length > 0)
                ? jobData.stages.map(s => ({ ...s, jobId: s.jobId || jobId }))
                : [
                    {
                        id: uuidv4(),
                        jobId: jobId,
                        name: 'Etap podstawowy',
                        type: 'podstawowy',
                        status: 'planowany',
                        plannedRevenueNet: jobData.revenuePlannedNet || 0,
                        billingType: 'hourly'
                    }
                ]
        };

        const result = await jobStorage.createJobAtomic({
            job: postPayload,
            stageItems: [],
            idempotencyKey
        });
        await refreshJobs();
        return result.job;
    };

    const createJobWithStages = async (jobData: any, stages: any[], allocations: any[], idempotencyKey?: string) => {
        try {
            let offer: Offer | undefined;
            let constructions: Construction[] = [];

            if (jobData.offerId) {
                offer = await offerStorage.getOffer(jobData.offerId);
                if (offer) {
                    constructions = await offerStorage.getConstructionsForOffer(jobData.offerId);
                }
            }

            // Use Adapter to create robust snapshot (jobCode generated authoritatively by atomic counter in backend)
            const { job, stageItems } = OfferToJobAdapter.prepareSnapshot({
                offer,
                constructions,
                jobData,
                stages,
                allocations,
                jobCode: ''
            });

            // Domain transactional endpoint: counter -> Job -> stageItems -> idempotency key
            // Executed in a single MongoDB ACID transaction session without any frontend compensation!
            await jobStorage.createJobAtomic({ job, stageItems, idempotencyKey });

            await refreshJobs();
        } catch (error) {
            console.error('Failed to create job with stages atomically:', error);
            throw error;
        }
    };

    const updateJob = async (id: string, updates: Partial<Job> & { expectedVersion?: number }) => {
        const job = jobs.find(j => j.id === id);
        if (job) {
            const expectedVersion = (updates as any).expectedVersion ?? job.editVersion;
            if (typeof expectedVersion !== 'number') {
                throw new Error(`[JobsContext] Brak wersji zlecenia (editVersion) dla ${id}. Nie można zaktualizować zlecenia.`);
            }
            const payload: any = {
                ...updates,
                expectedVersion
            };
            delete payload.editVersion;
            await jobStorage.updateJob(id, payload);
            await refreshJobs();
        }
    };

    const deleteJob = async (id: string, expectedVersionParam?: number) => {
        try {
            const job = jobs.find(j => j.id === id);
            const expectedVersion = expectedVersionParam ?? job?.editVersion;
            if (typeof expectedVersion !== 'number') {
                throw new Error(`[JobsContext] Brak wersji zlecenia (editVersion) dla ${id}. Nie można bezpiecznie zarchiwizować zlecenia.`);
            }
            await jobStorage.deleteJob(id, expectedVersion);
            toast.success('Zlecenie zostało zarchiwizowane');
            await refreshJobs();
        } catch (err) {
            console.error('Delete failed:', err);
            throw err;
        }
    };

    const getJob = (id: string) => jobs.find(job => job.id === id);

    // --- Stage Management ---
    const addJobStage = async (jobId: string, stageData: any) => {
        const job = jobs.find(j => j.id === jobId);
        if (job) {
            const newStage = {
                ...stageData,
                id: uuidv4(),
                jobId: jobId,
                status: 'planowany',
                billingType: 'hourly'
            };
            const updatedStages = [...(job.stages || []), newStage];
            await updateJob(jobId, { stages: updatedStages, expectedVersion: job.editVersion });
        }
    };

    const updateJobStage = async (jobId: string, stageId: string, updates: any) => {
        const job = jobs.find(j => j.id === jobId);
        if (job) {
            const updatedStages = (job.stages || []).map(s => s.id === stageId ? { ...s, ...updates } : s);
            await updateJob(jobId, { stages: updatedStages, expectedVersion: job.editVersion });
        }
    };

    const deleteJobStage = async (jobId: string, stageId: string) => {
        const job = jobs.find(j => j.id === jobId);
        if (job) {
            const updatedStages = (job.stages || []).filter(s => s.id !== stageId);
            await updateJob(jobId, { stages: updatedStages, expectedVersion: job.editVersion });
        }
    };

    // --- Job Stage Items (BOM) ---
    const getJobStageItems = async (jobId: string) => {
        return await jobStageItemStorage.getByJob(jobId);
    };

    const addJobStageItem = async (itemData: Omit<JobStageItem, 'id' | 'createdAt' | 'updatedAt'>) => {
        const newItem: JobStageItem = {
            ...itemData,
            id: uuidv4(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await jobStageItemStorage.save(newItem);
        // We don't necessarily need to refreshJobs here unless we start storing totals on the job/stage itself
    };

    const updateJobStageItem = async (id: string, updates: Partial<JobStageItem>) => {
        // We need to fetch the item first to ensure we have it (or just merge if we trust the caller)
        // Since storage is simple KV mostly, we might want to get it first if we want to be safe, but DB.put usually overwrites.
        // However, we only have 'save'.
        // For partial updates, we really should fetch-modify-save.
        // Since we don't have getById exposed in storage public API (only getAll/getByJob), let's assume caller sends what's needed or we fix storage.
        // Wait, jobStageItemStorage doesn't have getById. Let's fix that or use getAll logic.
        // Actually it's IndexedDB, so we can't easily do partial update without fetching.
        // Let's rely on the fact we usually have the item in UI.
        // But for safety:
        const allItems = await jobStageItemStorage.getAll(); // Inefficient but safe for now. optimizing later.
        const existing = allItems.find(i => i.id === id);
        if (existing) {
            const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
            await jobStageItemStorage.save(updated);
        }
    };

    const deleteJobStageItem = async (id: string) => {
        await jobStageItemStorage.delete(id);
    };



    const getJobStages = (jobId: string) => {
        const job = jobs.find(j => j.id === jobId);
        return job?.stages || [];
    };

    return (
        <JobsContext.Provider value={{
            jobs,
            addJob,
            updateJob,
            deleteJob,
            getJob,
            getJobStages,
            createJobWithStages,
            addJobStage,
            updateJobStage,
            deleteJobStage,
            getJobStageItems,
            addJobStageItem,
            updateJobStageItem,
            deleteJobStageItem,
            refreshJobs
        }}>
            {children}
        </JobsContext.Provider>
    );
}

export function useJobs() {
    const context = useContext(JobsContext);
    if (context === undefined) {
        throw new Error('useJobs must be used within a JobsProvider');
    }
    return context;
}
