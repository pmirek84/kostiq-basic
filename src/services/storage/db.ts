import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Client, Offer, Job, Construction, Material, InstallationStandard, CompanySettings, SubcontractorContract, Settlement } from '../../models/types';
import type { CalendarEvent } from '../../models/calendar';

interface CostFrameDB extends DBSchema {
    clients: {
        key: string;
        value: Client;
        indexes: { 'by-name': string };
    };
    jobs: {
        key: string;
        value: Job;
        indexes: { 'by-client': string; 'by-status': string };
    };
    offers: {
        key: string;
        value: Offer;
        indexes: { 'by-client': string; 'by-status': string };
    };
    constructions: {
        key: string;
        value: Construction;
        indexes: { 'by-offer': string };
    };
    materials: {
        key: string;
        value: Material;
        indexes: { 'by-category': string };
    };
    standards: {
        key: string;
        value: InstallationStandard;
    };
    settings: {
        key: string;
        value: CompanySettings;
    };
    jobStageItems: {
        key: string;
        value: any; // JobStageItem type locally or casted
        indexes: { 'by-job': string; 'by-stage': string };
    };
    'custom-events': {
        key: string;
        value: CalendarEvent;
    };
    'subcontractor_contracts': {
        key: string;
        value: SubcontractorContract;
        indexes: { 'by-job': string; 'by-stage': string };
    };
    settlements: {
        key: string;
        value: Settlement;
        indexes: { 'by-worker': string; 'by-job': string; 'by-contract': string };
    };
}

const DB_NAME = 'costframe-db';
const DB_VERSION = 10; // Incremented version for schema update

export const initDB = async (): Promise<IDBPDatabase<CostFrameDB>> => {
    return openDB<CostFrameDB>(DB_NAME, DB_VERSION, {
        upgrade(db, _oldVersion, _newVersion, _transaction) {
            if (!db.objectStoreNames.contains('clients')) {
                const store = db.createObjectStore('clients', { keyPath: 'id' });
                store.createIndex('by-name', 'name');
            }
            if (!db.objectStoreNames.contains('offers')) {
                const store = db.createObjectStore('offers', { keyPath: 'id' });
                store.createIndex('by-client', 'clientId');
                store.createIndex('by-status', 'status');
            }
            if (!db.objectStoreNames.contains('constructions')) {
                const store = db.createObjectStore('constructions', { keyPath: 'id' });
                store.createIndex('by-offer', 'offerId');
            }
            if (!db.objectStoreNames.contains('materials')) {
                const store = db.createObjectStore('materials', { keyPath: 'id' });
                store.createIndex('by-category', 'category');
            }
            if (!db.objectStoreNames.contains('jobs')) {
                const store = db.createObjectStore('jobs', { keyPath: 'id' });
                store.createIndex('by-client', 'clientId');
                store.createIndex('by-status', 'status');
            }
            if (!db.objectStoreNames.contains('standards')) {
                db.createObjectStore('standards', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('jobStageItems')) {
                const store = db.createObjectStore('jobStageItems', { keyPath: 'id' });
                store.createIndex('by-job', 'jobId');
                store.createIndex('by-stage', 'stageId');
            }
            if (!db.objectStoreNames.contains('custom-events')) {
                db.createObjectStore('custom-events', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('subcontractor_contracts')) {
                const store = db.createObjectStore('subcontractor_contracts', { keyPath: 'id' });
                store.createIndex('by-job', 'jobId');
                store.createIndex('by-stage', 'stageId');
            }
            if (!db.objectStoreNames.contains('settlements')) {
                const store = db.createObjectStore('settlements', { keyPath: 'id' });
                store.createIndex('by-worker', 'workerId');
                store.createIndex('by-job', 'jobId');
                store.createIndex('by-contract', 'contractId');
            }
        },
    });
};

export const getDB = async () => {
    return await initDB();
};
