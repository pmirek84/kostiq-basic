import type { SubcontractorContract } from '../../models/types';
import { getAdapter } from './adapterFactory';

const contractRepo = getAdapter<SubcontractorContract>('subcontractor_contracts');

export const subcontractorContractStorage = {
    async getAll(): Promise<SubcontractorContract[]> {
        return contractRepo.getAll();
    },

    async getById(id: string): Promise<SubcontractorContract | undefined> {
        return contractRepo.getById(id);
    },

    async save(contract: SubcontractorContract): Promise<string> {
        return contractRepo.save(contract);
    },

    async delete(id: string): Promise<void> {
        return contractRepo.delete(id);
    },

    async getByJob(jobId: string): Promise<SubcontractorContract[]> {
        const all = await this.getAll();
        return all.filter(c => c.jobId === jobId);
    }
};
