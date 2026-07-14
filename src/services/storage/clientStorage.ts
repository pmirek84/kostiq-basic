import type { Client } from '../../models/types';
import { getAdapter } from './adapterFactory';

const clientRepo = getAdapter<Client>('clients');

export const clientStorage = {
    async getAllClients(): Promise<Client[]> {
        return clientRepo.getAll();
    },

    async getClient(id: string): Promise<Client | undefined> {
        return clientRepo.getById(id);
    },

    async saveClient(client: Client): Promise<string> {
        return clientRepo.save(client);
    },

    async deleteClient(id: string): Promise<void> {
        return clientRepo.delete(id);
    }
};
