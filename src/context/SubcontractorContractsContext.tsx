import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { SubcontractorContract } from '../models/types';
import { subcontractorContractStorage } from '../services/storage/subcontractorContractStorage';

interface SubcontractorContractsContextType {
    contracts: SubcontractorContract[];
    createContract: (input: Omit<SubcontractorContract, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
    updateContract: (id: string, patch: Partial<Omit<SubcontractorContract, 'id'>>) => Promise<void>;
    deleteContract: (id: string) => Promise<void>;
    getContractsByJob: (jobId: string) => SubcontractorContract[];
    getContractsByStage: (stageId: string) => SubcontractorContract[];
}

const SubcontractorContractsContext = createContext<SubcontractorContractsContextType | undefined>(undefined);

export const SubcontractorContractsProvider = ({ children }: { children: ReactNode }) => {
    const [contracts, setContracts] = useState<SubcontractorContract[]>([]);

    const refreshContracts = async () => {
        try {
            const data = await subcontractorContractStorage.getAll();
            setContracts(data);
        } catch (error) {
            console.error('Failed to load subcontractor contracts:', error);
        }
    };

    useEffect(() => {
        refreshContracts();
    }, []);

    const createContract = async (input: Omit<SubcontractorContract, 'id' | 'createdAt' | 'updatedAt'>) => {
        const newContract: SubcontractorContract = {
            ...input,
            id: uuidv4(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        await subcontractorContractStorage.save(newContract);
        await refreshContracts();
    };

    const updateContract = async (id: string, patch: Partial<Omit<SubcontractorContract, 'id'>>) => {
        const existing = contracts.find(c => c.id === id);
        if (existing) {
            const updated = {
                ...existing,
                ...patch,
                updatedAt: new Date().toISOString()
            };
            await subcontractorContractStorage.save(updated);
            await refreshContracts();
        }
    };

    const deleteContract = async (id: string) => {
        await subcontractorContractStorage.delete(id);
        await refreshContracts();
    };

    const getContractsByJob = (jobId: string) => {
        return contracts.filter(c => c.jobId === jobId);
    };

    const getContractsByStage = (stageId: string) => {
        return contracts.filter(c => c.stageId === stageId);
    };

    return (
        <SubcontractorContractsContext.Provider value={{
            contracts,
            createContract,
            updateContract,
            deleteContract,
            getContractsByJob,
            getContractsByStage
        }}>
            {children}
        </SubcontractorContractsContext.Provider>
    );
};

export const useSubcontractorContracts = () => {
    const context = useContext(SubcontractorContractsContext);
    if (!context) throw new Error('useSubcontractorContracts must be used within SubcontractorContractsProvider');
    return context;
};
