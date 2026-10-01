import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Job, JobStage, JobStageItem, Offer, Construction } from '../models/types';
import { v4 as uuidv4 } from 'uuid';
import { jobStorage } from '../services/storage/jobStorage';
import { jobStageItemStorage } from '../services/storage/jobStageItemStorage';
import { offerStorage } from '../services/storage/offerStorage';
import { OfferToJobAdapter } from '../services/adapters/OfferToJobAdapter';
import { useClients } from './ClientsContext';
import { toast } from 'sonner';

interface JobsContextType {
    jobs: Job[];
    addJob: (jobData: Omit<Job, 'id' | 'createdAt' | 'updatedAt' | 'jobCode'>) => Promise<void>;
    updateJob: (id: string, updates: Partial<Job>) => Promise<void>;
    deleteJob: (id: string) => Promise<void>;
    getJob: (id: string) => Job | undefined;
    getJobStages: (jobId: string) => JobStage[];
    createJobWithStages: (jobData: any, stages: any[], allocations: any[]) => Promise<void>;
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

    // Seeding Logic for Jobs
    useEffect(() => {
        const seedDefaultJob = async () => {
            // Dynamic import to avoid circular dependency issues if any, or just import USE_MONGO
            // Since we act on !USE_MONGO.
            // We can check local storage key to avoid re-running if jobs exist but checking job count is safer for empty state.
            const { USE_MONGO } = await import('../services/storage/adapterFactory');
            if (USE_MONGO) return;

            const allJobs = await jobStorage.getAllJobs();
            // Check for the specific "Current" demo job, not just any job
            const demoJobNowExists = allJobs.some(j => j.jobCode === 'CF-DEMO-NOW');

            if (!demoJobNowExists) {
                console.log("[JobsContext] Seeding CURRENT demo job...");

                const jobId = uuidv4();
                const date = new Date(); // Today
                const jobCode = 'CF-DEMO-NOW';

                // Try to link to the default seeded offer if exists
                const offers = await offerStorage.getAllOffers();
                const templateOffer = offers.find(o => o.number === 'WZÓR-STD-01');

                const newJob: Job = {
                    id: jobId,
                    jobCode,
                    name: templateOffer ? `Zlecenie: ${templateOffer.title} (TERAZ)` : 'Przykładowe Zlecenie (TERAZ)',
                    status: 'in_progress',
                    offerId: templateOffer?.id,
                    clientId: templateOffer?.clientId || 'client-1', // simplified
                    clientName: 'Jan Kowalski (Klient)',
                    location: 'Koszalin',
                    createdAt: date.toISOString(),
                    updatedAt: date.toISOString(),
                    plannedStartDate: date.toISOString(), // Start today
                    plannedEndDate: new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), // End in 7 days
                    totalPlannedRevenueNet: 15000,
                    stages: [
                        {
                            id: uuidv4(),
                            jobId: jobId,
                            name: 'Montaż Konstrukcji (Etap 1)',
                            type: 'podstawowy',
                            status: 'planowany',
                            startPlanned: date.toISOString(),
                            endPlanned: new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                            plannedRevenueNet: 15000,
                            billingType: 'hourly',
                            // Assign the seeded crew automatically
                            assignedTeams: ['Ekipa 1 (Jan)'],
                            assignedStartTime: '08:00',
                            assignedLocation: 'Koszalin',
                            plannedLaborHours: 120 // Explicitly set hours to ensure capacity calculation
                        }
                    ],
                    riskFlag: 'none'
                };
                // Ensure link
                newJob.stages![0].jobId = newJob.id;

                await jobStorage.saveJob(newJob);
                await refreshJobs();
            }
        };
        seedDefaultJob();
    }, []);

    const addJob = async (jobData: Omit<Job, 'id' | 'createdAt' | 'updatedAt' | 'jobCode'>) => {
        const allJobs = await jobStorage.getAllJobs();
        const date = new Date();
        const year = date.getFullYear();
        const count = allJobs.filter(j => new Date(j.createdAt).getFullYear() === year).length + 1;
        const jobCode = `CF-${year}-${String(count).padStart(3, '0')}`;

        const newJob: Job = {
            ...jobData,
            id: uuidv4(),
            jobCode,
            createdAt: date.toISOString(),
            updatedAt: date.toISOString(),
            riskFlag: jobData.riskFlag || 'none',
            stages: [
                {
                    id: uuidv4(),
                    jobId: '', // Set below
                    name: 'Etap podstawowy',
                    type: 'podstawowy',
                    status: 'planowany',
                    plannedRevenueNet: jobData.totalPlannedRevenueNet || 0,
                    billingType: 'hourly'
                } as any
            ]
        };
        newJob.stages![0].jobId = newJob.id;

        await jobStorage.saveJob(newJob);
        await refreshJobs();
    };

    const createJobWithStages = async (jobData: any, stages: any[], allocations: any[]) => {
        try {
            // We need latest jobs to generate code
            const allJobs = await jobStorage.getAllJobs();
            const date = new Date();
            const year = date.getFullYear();
            const count = allJobs.filter(j => new Date(j.createdAt).getFullYear() === year).length + 1;
            const jobCode = `CF-${year}-${String(count).padStart(3, '0')}`;

            let offer: Offer | undefined;
            let constructions: Construction[] = [];

            if (jobData.offerId) {
                offer = await offerStorage.getOffer(jobData.offerId);
                if (offer) {
                    constructions = await offerStorage.getConstructionsForOffer(jobData.offerId);
                }
            }

            // Use Adapter to create robustness Snapshot
            const { job, stageItems } = OfferToJobAdapter.prepareSnapshot({
                offer,
                constructions,
                jobData,
                stages,
                allocations,
                jobCode
            });

            await jobStorage.saveJob(job);

            if (stageItems.length > 0) {
                await jobStageItemStorage.saveBatch(stageItems);
            }

            await refreshJobs();
        } catch (error) {
            console.error('Failed to create job with stages:', error);
            throw error;
        }
    };

    const updateJob = async (id: string, updates: Partial<Job>) => {
        const job = jobs.find(j => j.id === id);
        if (job) {
            await jobStorage.updateJob(id, updates);
            await refreshJobs();
        }
    };

    const deleteJob = async (id: string) => {
        try {
            await jobStorage.deleteJob(id);
            toast.success('Zlecenie zostało zarchiwizowane');
            await refreshJobs();
        } catch (err) {
            console.error('Delete failed:', err);
            // Error toast handled by MongoAdapter
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
            const updatedJob = {
                ...job,
                stages: [...(job.stages || []), newStage],
                updatedAt: new Date().toISOString()
            };
            await jobStorage.saveJob(updatedJob);
            await refreshJobs();
        }
    };

    const updateJobStage = async (jobId: string, stageId: string, updates: any) => {
        const job = jobs.find(j => j.id === jobId);
        if (job) {
            const updatedJob = {
                ...job,
                stages: (job.stages || []).map(s => s.id === stageId ? { ...s, ...updates } : s),
                updatedAt: new Date().toISOString()
            };
            await jobStorage.saveJob(updatedJob);
            await refreshJobs();
        }
    };

    const deleteJobStage = async (jobId: string, stageId: string) => {
        const job = jobs.find(j => j.id === jobId);
        if (job) {
            const updatedJob = {
                ...job,
                stages: (job.stages || []).filter(s => s.id !== stageId),
                updatedAt: new Date().toISOString()
            };
            await jobStorage.saveJob(updatedJob);
            await refreshJobs();
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
