import type { InstallationStandard } from '../../models/types';
import { getAdapter } from './adapterFactory';

const STANDARDS_STORE = 'standards';
const standardRepo = getAdapter<InstallationStandard>(STANDARDS_STORE);

export const standardsStorage = {
    async getAllStandards(): Promise<InstallationStandard[]> {
        return standardRepo.getAll();
    },

    async getStandard(id: string): Promise<InstallationStandard | undefined> {
        return standardRepo.getById(id);
    },

    async saveStandard(standard: InstallationStandard): Promise<string> {
        return standardRepo.save(standard);
    },

    async deleteStandard(id: string): Promise<void> {
        return standardRepo.delete(id);
    }
};
