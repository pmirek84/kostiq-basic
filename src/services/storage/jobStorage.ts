import type { Job, JobStageItem } from '../../models/types';
import type { JobPostPayload, JobPatchPayload } from '../../../shared/contracts/job.generated';
import { getAdapter } from './adapterFactory';
import { v4 as uuidv4 } from 'uuid';

const jobRepo = getAdapter<Job>('jobs');

export const jobStorage = {
    async getAllJobs(): Promise<Job[]> {
        return jobRepo.getAll();
    },

    async getJob(id: string): Promise<Job | undefined> {
        return jobRepo.getById(id);
    },

    async createJob(job: JobPostPayload, idempotencyKey?: string): Promise<string> {
        const result = await this.createJobAtomic({ job, stageItems: [], idempotencyKey });
        return result.job.id;
    },

    async createJobAtomic(data: { job: JobPostPayload; stageItems?: JobStageItem[]; idempotencyKey?: string }): Promise<{ success: boolean; job: Job; stageItemsCount: number; jobCode: string }> {
        const idempotencyKey = data.idempotencyKey || uuidv4();
        const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';
        const token = localStorage.getItem('kostiq_token');
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${baseUrl}/jobs/create-atomic`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                job: data.job,
                stageItems: data.stageItems || [],
                idempotencyKey
            })
        });

        if (!res.ok) {
            let errorMsg = `Błąd atomowego tworzenia zlecenia: ${res.status} ${res.statusText}`;
            try {
                const errJson = await res.json();
                errorMsg = errJson.error || errorMsg;
            } catch (_) {}
            const err = new Error(errorMsg);
            (err as any).status = res.status;
            throw err;
        }

        return res.json();
    },

    async saveJob(job: Job): Promise<string> {
        return jobRepo.save(job);
    },

    async updateJob(id: string, updates: JobPatchPayload | (Partial<Job> & { expectedVersion?: number })): Promise<void> {
        return jobRepo.update(id, updates as Partial<Job>);
    },

    async deleteJob(id: string, expectedVersion?: number): Promise<void> {
        return jobRepo.delete(id, expectedVersion !== undefined ? { expectedVersion } : undefined);
    }
};
