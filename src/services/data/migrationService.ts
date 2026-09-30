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
    remoteFingerprint?: string;
}

export interface MigrationPreviewReport {
    snapshotId: string;
    snapshotHash: string;
    timestamp: string;
    totalLocal: number;
    toCreateCount: number;
    identicalCount: number;
    conflictCount: number;
    items: MigrationItemPreview[];
    storeFingerprints: Record<string, string>;
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
    snapshotId: string;
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

export function toCanonicalJson(obj: any): any {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        return obj.map(toCanonicalJson);
    }
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, any> = {};
    for (const key of sortedKeys) {
        if (key === '_id' || key === '__v' || key === '_lastUpdatedAt') continue;
        result[key] = toCanonicalJson(obj[key]);
    }
    return result;
}

export function computeCanonicalDocHash(doc: any): string {
    if (!doc || typeof doc !== 'object') return 'empty';
    const canonical = toCanonicalJson(doc);
    const str = JSON.stringify(canonical);
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export function computeStoreFingerprint(remoteItems: any[]): string {
    if (!Array.isArray(remoteItems) || remoteItems.length === 0) return 'empty';
    const sorted = [...remoteItems].sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
    let hash = 0;
    for (const item of sorted) {
        const docHash = computeCanonicalDocHash(item);
        const str = `${item?.id || ''}:${docHash}`;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        }
    }
    return Math.abs(hash).toString(36);
}

function computeSnapshotHash(storeFingerprints: Record<string, string>, items: MigrationItemPreview[]): string {
    const baseStr = Object.entries(storeFingerprints).sort().map(([k, v]) => `${k}=${v}`).join(';') +
        '|' + items.map(i => `${i.entity}:${i.id}:${i.status}:${i.conflictFields.join(',')}`).join(';');
    let hash = 0;
    for (let i = 0; i < baseStr.length; i++) {
        hash = ((hash << 5) - hash + baseStr.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Administrative Migration API Client
 * Uses POST /api/migration/admin-record with full document replacement (replaceOne)
 * and bypasses optimistic locking constraints.
 */
export async function adminMigrateRecord(payload: { 
    collection: string; 
    action: 'create' | 'replace'; 
    record: any;
    expectedUpdatedAt?: string;
    expectedFingerprint?: string;
}): Promise<any> {
    const token = localStorage.getItem('kostiq_token');
    const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';
    const res = await fetch(`${baseUrl}/migration/admin-record`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
    });
    if (!res.ok) {
        let errorMsg = `Błąd API migracji: HTTP ${res.status}`;
        try {
            const errJson = await res.json();
            errorMsg = errJson.error || errorMsg;
        } catch (_) {}
        const err: any = new Error(errorMsg);
        err.status = res.status;
        throw err;
    }
    return res.json();
}

export const migrationService = {
    async previewMigration(): Promise<MigrationPreviewReport> {
        console.log('[Migration] Generating migration conflict preview...');
        const db = await getDB();
        const items: MigrationItemPreview[] = [];
        const storeFingerprints: Record<string, string> = {};

        for (const store of MIGRATION_STORES) {
            // 1. Read local items from IndexedDB
            // @ts-ignore - store.name is in DB
            const localList = await db.getAll(store.name);

            // 2. Read remote items from MongoDB
            const adapter = getAdapter<any>(store.name, store.endpoint);
            let remoteList: any[];
            try {
                remoteList = await adapter.getAll();
            } catch (err: any) {
                // P1 FIX: If reading MongoDB fails, abort immediately!
                // NEVER swallow errors and pretend MongoDB is empty.
                console.error(`[Migration] Błąd odczytu MongoDB dla kolekcji '${store.name}':`, err);
                throw new Error(`Nie można odczytać danych MongoDB dla kolekcji '${store.name}': ${err?.message || 'Brak odpowiedzi'}. Podgląd migracji przerwany w celu ochrony integralności danych.`);
            }

            storeFingerprints[store.name] = computeStoreFingerprint(remoteList);

            if (!Array.isArray(localList) || localList.length === 0) continue;

            const remoteMap = new Map<string, any>();
            for (const r of remoteList) {
                if (r && r.id) remoteMap.set(r.id, r);
            }

            for (const localItem of localList) {
                if (!localItem || !localItem.id) continue;

                const remoteItem = remoteMap.get(localItem.id);
                const remoteFingerprint = remoteItem ? computeCanonicalDocHash(remoteItem) : undefined;
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
                            remoteData: remoteItem,
                            remoteFingerprint
                        });
                    } else {
                        items.push({
                            id: localItem.id,
                            entity: store.name,
                            status: 'identical',
                            summary: localItem.name || localItem.title || localItem.number || localItem.id,
                            conflictFields: [],
                            localData: localItem,
                            remoteData: remoteItem,
                            remoteFingerprint
                        });
                    }
                }
            }
        }

        const snapshotHash = computeSnapshotHash(storeFingerprints, items);
        const snapshotId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'snap-' + Date.now();

        const report: MigrationPreviewReport = {
            snapshotId,
            snapshotHash,
            timestamp: new Date().toISOString(),
            totalLocal: items.length,
            toCreateCount: items.filter(i => i.status === 'to_create').length,
            identicalCount: items.filter(i => i.status === 'identical').length,
            conflictCount: items.filter(i => i.status === 'conflict').length,
            items,
            storeFingerprints
        };

        return report;
    },

    /**
     * Verifies that MongoDB state has not drifted since the approved snapshot was created.
     */
    async verifySnapshotDrift(preview: MigrationPreviewReport): Promise<{ valid: boolean; driftedStore?: string; reason?: string }> {
        if (!preview || !preview.storeFingerprints) {
            return { valid: false, reason: 'Brak sygnatury snapshotu w podglądzie.' };
        }

        for (const store of MIGRATION_STORES) {
            const expectedFingerprint = preview.storeFingerprints[store.name];
            if (expectedFingerprint === undefined) continue;

            const adapter = getAdapter<any>(store.name, store.endpoint);
            let currentRemote: any[];
            try {
                currentRemote = await adapter.getAll();
            } catch (err: any) {
                return {
                    valid: false,
                    driftedStore: store.name,
                    reason: `Błąd weryfikacji MongoDB dla '${store.name}': ${err.message}`
                };
            }

            const currentFingerprint = computeStoreFingerprint(currentRemote);
            if (currentFingerprint !== expectedFingerprint) {
                return {
                    valid: false,
                    driftedStore: store.name,
                    reason: `Stan kolekcji '${store.name}' w MongoDB uległ zmianie od momentu podglądu (drift danych).`
                };
            }
        }

        return { valid: true };
    },

    /**
     * Executes migration tied directly to an approved preview snapshot.
     */
    async migrateAll(approvedPreview: MigrationPreviewReport, options: MigrationOptions = {}): Promise<MigrationExecutionReport> {
        const { conflictStrategy = 'skip', onProgress } = options;

        if (!approvedPreview || !approvedPreview.snapshotHash) {
            throw new Error('Wymagany jest zatwierdzony podgląd migracji ze snapshotem. Uruchom najpierw podgląd spójności.');
        }

        console.log(`[Migration] Verifying snapshot ${approvedPreview.snapshotId} before execution...`);
        const driftCheck = await this.verifySnapshotDrift(approvedPreview);
        if (!driftCheck.valid) {
            throw new Error(`Snapshot migracji unieważniony: ${driftCheck.reason} Wygeneruj nowy podgląd przed wykonaniem migracji.`);
        }

        console.log(`[Migration] Snapshot verified. Executing migration with strategy: ${conflictStrategy}`);
        const results: MigrationRecordResult[] = [];

        let current = 0;
        const total = approvedPreview.items.length;

        for (const item of approvedPreview.items) {
            current++;
            if (onProgress) {
                onProgress({ current, total, entity: item.entity, id: item.id });
            }

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
                    await adminMigrateRecord({
                        collection: item.entity,
                        action: 'create',
                        record: item.localData
                    });
                    results.push({
                        id: item.id,
                        entity: item.entity,
                        status: 'created',
                        message: 'Pomyślnie utworzono w MongoDB (admin-record)'
                    });
                } else if (item.status === 'conflict' && conflictStrategy === 'overwrite') {
                    // Full document replacement via admin endpoint (replaces document, removes MongoDB-only fields, atomic conditional replacement)
                    await adminMigrateRecord({
                        collection: item.entity,
                        action: 'replace',
                        record: item.localData,
                        expectedUpdatedAt: item.remoteData?.updatedAt,
                        expectedFingerprint: item.remoteFingerprint
                    });
                    results.push({
                        id: item.id,
                        entity: item.entity,
                        status: 'updated',
                        message: `Nadpisano pełną wersją z IndexedDB (usunięto nieistniejące pola z MongoDB; rozwiązano: ${item.conflictFields.join(', ')})`
                    });
                }
            } catch (err: any) {
                console.error(`[Migration] Failed on item ${item.entity}/${item.id}:`, err);
                results.push({
                    id: item.id,
                    entity: item.entity,
                    status: 'failed',
                    message: err.message || 'Nieznany błąd zapisu administracyjnego'
                });
            }
        }

        const executionReport: MigrationExecutionReport = {
            snapshotId: approvedPreview.snapshotId,
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
