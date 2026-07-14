import type { JobStageItem } from '../../models/types';
import { getAdapter } from './adapterFactory';
// TODO: Define proper type for Item
const itemRepo = getAdapter<any>('jobStageItems');

export const jobStageItemStorage = {
    async getAll(): Promise<JobStageItem[]> {
        return itemRepo.getAll();
    },

    async getByJob(jobId: string): Promise<JobStageItem[]> {
        // @ts-ignore - getByIndex exists on implementation
        if (itemRepo.getByIndex) {
            // @ts-ignore
            return itemRepo.getByIndex('by-job', jobId);
        }
        // Fallback for types that lack it if we ever have one
        return (await itemRepo.getAll()).filter((i: any) => i.jobId === jobId);
    },

    async getByStage(stageId: string): Promise<JobStageItem[]> {
        // @ts-ignore - getByIndex exists on implementation
        if (itemRepo.getByIndex) {
            // @ts-ignore
            return itemRepo.getByIndex('by-stage', stageId);
        }
        // Fallback for types that lack it if we ever have one
        return (await itemRepo.getAll()).filter((i: any) => i.stageId === stageId);
    },

    async save(item: JobStageItem): Promise<string> {
        return itemRepo.save(item);
    },

    async delete(id: string): Promise<void> {
        return itemRepo.delete(id);
    },

    async deleteByJob(jobId: string): Promise<void> {
        // This is inefficient on Mongo without a backend bulk delete endpoint found by query.
        // We'll iterate for now.
        const items = await this.getByJob(jobId);
        for (const item of items) {
            await itemRepo.delete(item.id);
        }
    },

    // Batch operations
    async saveBatch(items: JobStageItem[]): Promise<void> {
        // Parallel execution via adapter (each is a transaction, which is acceptable for this scale)
        // Ideally, we'd add 'saveBatch' to IStorageAdapter for optimization, but this works for MVP.
        await Promise.all(items.map(item => itemRepo.save(item)));
    }
};
