import { getDB } from '../storage/db';
import { getAdapter } from '../storage/adapterFactory';

export interface MigrationItemPreview {
    id: string;
    entity: string;
    status: 'to_create' | 'identical' | 'conflict';
    summary?: string;
    conflictFields: string[];
    localData?: any;
    remoteData?: any;
}

export interface MigrationPreviewReport {
    timestamp: string;
    totalLocal: number;
    toCreateCount: number;
    identicalCount: number;
    conflictCount: number;
    items: MigrationItemPreview[];
}

export interface MigrationOptions {
    conflictStrategy?: 'skip' | 'overwrite' | 'keep_backend';
    onProgress?: (progress: { current: number; total: number; entity: string; id: string }) => void;
}

export interface MigrationRecordResult {
    id: string;
    entity: string;
    status: 'created' | 'updated' | 'skipped' | 'failed';
    message?: string;
}

export interface MigrationExecutionReport {
    timestamp: string;
    total: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
    results: MigrationRecordResult[];
}

export const MIGRATION_STORES = [
    { name: 'clients', endpoint: 'clients' },
    { name: 'offers', endpoint: 'offers' },
    { name: 'jobs', endpoint: 'jobs' },
    { name: 'constructions', endpoint: 'constructions' },
    { name: 'materials', endpoint: 'materials' },
    { name: 'standards', endpoint: 'standards' },
    { name: 'settings', endpoint: 'settings' },
    { name: 'jobStageItems', endpoint: 'jobStageItems' },
    { name: 'custom-events', endpoint: 'custom-events' },
    { name: 'subcontractor_contracts', endpoint: 'subcontractor_contracts' },
    { name: 'settlements', endpoint: 'settlements' }
] as const;

function cleanForComparison(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    const copy = Array.isArray(obj) ? [...obj] : { ...obj };
    delete copy._id;
    delete copy.__v;
    delete copy._lastUpdatedAt;
    return copy;
}

export function detectConflictFields(local: any, remote: any): string[] {
    const cleanLocal = cleanForComparison(local);
    const cleanRemote = cleanForComparison(remote);

    const keys = new Set([...Object.keys(cleanLocal), ...Object.keys(cleanRemote)]);
    const conflicts: string[] = [];

    for (const key of keys) {
        if (key === 'updatedAt' || key === 'createdAt') continue;
        const valLocal = cleanLocal[key];
        const valRemote = cleanRemote[key];

        const strLocal = JSON.stringify(valLocal === undefined ? null : valLocal);
        const strRemote = JSON.stringify(valRemote === undefined ? null : valRemote);

        if (strLocal !== strRemote) {
            conflicts.push(key);
        }
    }
    return conflicts;
}

export const migrationService = {
    async previewMigration(): Promise<MigrationPreviewReport> {
        console.log('[Migration] Generating migration conflict preview...');
        const db = await getDB();
        const items: MigrationItemPreview[] = [];

        for (const store of MIGRATION_STORES) {
            try {
                // @ts-ignore - store.name is in DB
                const localList = await db.getAll(store.name);
                if (!Array.isArray(localList) || localList.length === 0) continue;

                const adapter = getAdapter<any>(store.name, store.endpoint);
                let remoteList: any[] = [];
                try {
                    remoteList = await adapter.getAll();
                } catch (e) {
                    console.warn(`[Migration] Could not load remote list for store ${store.name}`, e);
                }

                const remoteMap = new Map<string, any>();
                for (const r of remoteList) {
                    if (r && r.id) remoteMap.set(r.id, r);
                }

                for (const localItem of localList) {
                    if (!localItem || !localItem.id) continue;

                    const remoteItem = remoteMap.get(localItem.id);
                    if (!remoteItem) {
                        items.push({
                            id: localItem.id,
                            entity: store.name,
                            status: 'to_create',
                            summary: localItem.name || localItem.title || localItem.number || localItem.id,
                            conflictFields: [],
                            localData: localItem
                        });
                    } else {
                        const conflictFields = detectConflictFields(localItem, remoteItem);
                        if (conflictFields.length > 0) {
                            items.push({
                                id: localItem.id,
                                entity: store.name,
                                status: 'conflict',
                                summary: localItem.name || localItem.title || localItem.number || localItem.id,
                                conflictFields,
                                localData: localItem,
                                remoteData: remoteItem
                            });
                        } else {
                            items.push({
                                id: localItem.id,
                                entity: store.name,
                                status: 'identical',
                                summary: localItem.name || localItem.title || localItem.number || localItem.id,
                                conflictFields: [],
                                localData: localItem,
                                remoteData: remoteItem
                            });
                        }
                    }
                }
            } catch (storeErr) {
                console.error(`[Migration] Error reading store ${store.name}:`, storeErr);
            }
        }

        const report: MigrationPreviewReport = {
            timestamp: new Date().toISOString(),
            totalLocal: items.length,
            toCreateCount: items.filter(i => i.status === 'to_create').length,
            identicalCount: items.filter(i => i.status === 'identical').length,
            conflictCount: items.filter(i => i.status === 'conflict').length,
            items
        };

        return report;
    },

    async migrateAll(options: MigrationOptions = {}): Promise<MigrationExecutionReport> {
        const { conflictStrategy = 'skip', onProgress } = options;
        console.log(`[Migration] Starting migration with strategy: ${conflictStrategy}`);

        const preview = await this.previewMigration();
        const results: MigrationRecordResult[] = [];

        let current = 0;
        const total = preview.items.length;

        for (const item of preview.items) {
            current++;
            if (onProgress) {
                onProgress({ current, total, entity: item.entity, id: item.id });
            }

            const adapter = getAdapter<any>(item.entity);

            if (item.status === 'identical') {
                results.push({
                    id: item.id,
                    entity: item.entity,
                    status: 'skipped',
                    message: 'Identyczny z danymi w MongoDB'
                });
                continue;
            }

            if (item.status === 'conflict' && conflictStrategy !== 'overwrite') {
                results.push({
                    id: item.id,
                    entity: item.entity,
                    status: 'skipped',
                    message: `Zachowano wersję MongoDB (konflikt w polach: ${item.conflictFields.join(', ')})`
                });
                continue;
            }

            try {
                if (item.status === 'to_create') {
                    await adapter.create(item.localData);
                    results.push({
                        id: item.id,
                        entity: item.entity,
                        status: 'created',
                        message: 'Pomyślnie utworzono w MongoDB'
                    });
                } else if (item.status === 'conflict' && conflictStrategy === 'overwrite') {
                    await adapter.save(item.localData);
                    results.push({
                        id: item.id,
                        entity: item.entity,
                        status: 'updated',
                        message: `Nadpisano MongoDB wersją lokalną (rozwiązano konflikt: ${item.conflictFields.join(', ')})`
                    });
                }
            } catch (err: any) {
                console.error(`[Migration] Failed on item ${item.entity}/${item.id}:`, err);
                results.push({
                    id: item.id,
                    entity: item.entity,
                    status: 'failed',
                    message: err.message || 'Nieznany błąd zapisu'
                });
            }
        }

        const executionReport: MigrationExecutionReport = {
            timestamp: new Date().toISOString(),
            total: results.length,
            created: results.filter(r => r.status === 'created').length,
            updated: results.filter(r => r.status === 'updated').length,
            skipped: results.filter(r => r.status === 'skipped').length,
            failed: results.filter(r => r.status === 'failed').length,
            results
        };

        return executionReport;
    }
};
