import type { ClientReport } from '../../models/types';
import { getAdapter } from './adapterFactory';

const reportRepo = getAdapter<ClientReport>('client-reports');

export const clientReportStorage = {
    async getAll(): Promise<ClientReport[]> {
        return reportRepo.getAll();
    },
    async save(report: ClientReport): Promise<string> {
        return reportRepo.save(report);
    },
    async delete(id: string): Promise<void> {
        return reportRepo.delete(id);
    }
};
