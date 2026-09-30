import type { Job } from '../../models/types';
import { getAdapter } from './adapterFactory';

const jobRepo = getAdapter<Job>('jobs');

export const jobStorage = {
    async getAllJobs(): Promise<Job[]> {
        return jobRepo.getAll();
    },

    async getJob(id: string): Promise<Job | undefined> {
        return jobRepo.getById(id);
    },

    async saveJob(job: Job): Promise<string> {
        return jobRepo.save(job);
    },

    async updateJob(id: string, updates: Partial<Job>): Promise<void> {
        return jobRepo.update(id, updates);
    },

    async deleteJob(id: string): Promise<void> {
        return jobRepo.delete(id);
    }
};
