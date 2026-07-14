import type { Settlement } from '../../models/types';
import { getAdapter } from './adapterFactory';

const settlementRepo = getAdapter<Settlement>('settlements');

export const settlementStorage = {
    async getAll(): Promise<Settlement[]> {
        return settlementRepo.getAll();
    },

    async getById(id: string): Promise<Settlement | undefined> {
        return settlementRepo.getById(id);
    },

    async save(settlement: Settlement): Promise<string> {
        return settlementRepo.save(settlement);
    },

    async delete(id: string): Promise<void> {
        return settlementRepo.delete(id);
    },

    async getByContract(contractId: string): Promise<Settlement[]> {
        return settlementRepo.getByIndex('by-contract', contractId);
    },

    async getByJob(jobId: string): Promise<Settlement[]> {
        return settlementRepo.getByIndex('by-job', jobId);
    },

    async getByWorker(workerId: string): Promise<Settlement[]> {
        return settlementRepo.getByIndex('by-worker', workerId);
    }
};
