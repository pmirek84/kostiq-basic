import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Client } from '../models/types';
import { catalogFetch } from '../hooks/catalogApi';

interface ClientsContextType {
    clients: Client[];
    addClient: (client: Client) => Promise<void>;
    updateClient: (id: string, updates: Partial<Client>) => Promise<void>;
    deleteClient: (id: string) => Promise<void>;
    getClient: (id: string) => Client | undefined;
    refreshClients: () => Promise<void>;
}

export const ClientsContext = createContext<ClientsContextType | undefined>(undefined);

export function ClientsProvider({ children }: { children: ReactNode }) {
    const [clients, setClients] = useState<Client[]>([]);

    const refreshClients = useCallback(async () => {
        try {
            console.log('[ClientsContext] Fetching clients from API...');
            const data = await catalogFetch<Client[]>('/clients');
            console.log(`[ClientsContext] Loaded ${data.length} clients from API`);
            setClients(data);
        } catch (error) {
            console.error('[ClientsContext] Failed to load clients from API:', error);
        }
    }, []);

    useEffect(() => {
        refreshClients();
    }, [refreshClients]);

    const addClient = async (client: Client) => {
        await catalogFetch('/clients', {
            method: 'POST',
            body: JSON.stringify(client)
        });
        await refreshClients();
    };

    const updateClient = async (id: string, updates: Partial<Client>) => {
        await catalogFetch(`/clients/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates)
        });
        await refreshClients();
    };

    const deleteClient = async (id: string) => {
        // Soft delete — mark as inactive instead of removing
        await updateClient(id, { isActive: false } as Partial<Client>);
    };

    const getClient = (id: string) => {
        return clients.find(c => c.id === id);
    };

    return (
        <ClientsContext.Provider value={{ clients, addClient, updateClient, deleteClient, getClient, refreshClients }}>
            {children}
        </ClientsContext.Provider>
    );
}

export function useClients() {
    const context = useContext(ClientsContext);
    if (context === undefined) {
        throw new Error('useClients must be used within a ClientsProvider');
    }
    return context;
}
