import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectConflictFields, migrationService } from '../migrationService';
import * as dbModule from '../../storage/db';
import * as adapterFactoryModule from '../../storage/adapterFactory';

describe('migrationService - Conflict Detection and Per-Record Audited Migration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('detectConflictFields', () => {
        it('ignores internal Mongo fields (_id, __v, _lastUpdatedAt) and metadata timestamps', () => {
            const local = {
                id: 'item-1',
                name: 'Okno PVC',
                price: 1500,
                updatedAt: '2026-09-30T10:00:00Z',
                createdAt: '2026-09-30T09:00:00Z'
            };
            const remote = {
                _id: 'mongo-object-id',
                id: 'item-1',
                name: 'Okno PVC',
                price: 1500,
                _lastUpdatedAt: '2026-09-30T12:00:00Z',
                updatedAt: '2026-09-30T12:00:00Z',
                createdAt: '2026-09-30T09:00:00Z'
            };

            const conflicts = detectConflictFields(local, remote);
            expect(conflicts).toEqual([]);
        });

        it('identifies exact conflicting fields when values differ', () => {
            const local = {
                id: 'item-1',
                name: 'Okno PVC v1',
                price: 1500,
                status: 'draft'
            };
            const remote = {
                id: 'item-1',
                name: 'Okno PVC v2',
                price: 1500,
                status: 'approved'
            };

            const conflicts = detectConflictFields(local, remote);
            expect(conflicts.sort()).toEqual(['name', 'status'].sort());
        });
    });

    describe('MongoDB Read Failure Safety', () => {
        it('aborts and throws explicit error when adapter.getAll() fails, NEVER faking to_create', async () => {
            const mockLocalClients = [{ id: 'c-1', name: 'Klient 1' }];
            const mockDB = {
                getAll: vi.fn((storeName: string) => {
                    if (storeName === 'clients') return Promise.resolve(mockLocalClients);
                    return Promise.resolve([]);
                })
            };
            vi.spyOn(dbModule, 'getDB').mockResolvedValue(mockDB as any);

            const mockAdapter = {
                getAll: vi.fn(() => Promise.reject(new Error('Network connection refused (simulated)')))
            };
            vi.spyOn(adapterFactoryModule, 'getAdapter').mockReturnValue(mockAdapter as any);

            await expect(migrationService.previewMigration()).rejects.toThrow(
                /Nie można odczytać danych MongoDB dla kolekcji 'clients'/
            );
        });
    });

    describe('Snapshot Validation & Data Drift Guard', () => {
        it('rejects execution when MongoDB state drifts after snapshot preview was approved', async () => {
            const mockLocalClients = [{ id: 'c-1', name: 'Klient 1' }];
            const mockDB = {
                getAll: vi.fn(() => Promise.resolve(mockLocalClients))
            };
            vi.spyOn(dbModule, 'getDB').mockResolvedValue(mockDB as any);

            let remoteVersion = 'v1';
            const mockAdapter = {
                getAll: vi.fn(() => Promise.resolve([{ id: 'c-1', name: 'Klient 1', updatedAt: remoteVersion }]))
            };
            vi.spyOn(adapterFactoryModule, 'getAdapter').mockReturnValue(mockAdapter as any);

            // 1. Generate preview at remoteVersion 'v1'
            const preview = await migrationService.previewMigration();
            expect(preview.totalLocal).toBe(10); // 1 per store in mock (10 stores, settlements excluded)

            // 2. Simulate concurrent modification in MongoDB
            remoteVersion = 'v2_concurrent_change';

            // 3. Attempt migration with stale snapshot
            await expect(migrationService.migrateAll(preview, { conflictStrategy: 'skip' })).rejects.toThrow(
                /Snapshot migracji unieważniony: Stan kolekcji 'clients' w MongoDB uległ zmianie/
            );
        });

        it('detects business field change even when updatedAt is untouched (canonical document hashing)', async () => {
            const mockLocalClients = [{ id: 'c-1', name: 'Klient 1', phone: '111-222' }];
            const mockDB = {
                getAll: vi.fn((storeName: string) => {
                    if (storeName === 'clients') return Promise.resolve(mockLocalClients);
                    return Promise.resolve([]);
                })
            };
            vi.spyOn(dbModule, 'getDB').mockResolvedValue(mockDB as any);

            const remoteDoc = { id: 'c-1', name: 'Klient 1', phone: '111-222', vatRate: 23, updatedAt: '2026-09-30T10:00:00Z' };
            const mockAdapter = {
                getAll: vi.fn(() => Promise.resolve([{ ...remoteDoc }]))
            };
            vi.spyOn(adapterFactoryModule, 'getAdapter').mockReturnValue(mockAdapter as any);

            // 1. Generate preview
            const preview = await migrationService.previewMigration();

            // 2. Business field mutated in MongoDB without touching updatedAt
            remoteDoc.vatRate = 8; // changed business field

            // 3. Verify snapshot drift detects change
            const drift = await migrationService.verifySnapshotDrift(preview);
            expect(drift.valid).toBe(false);
            expect(drift.driftedStore).toBe('clients');

            // 4. migrateAll rejects with drift reason
            await expect(migrationService.migrateAll(preview, { conflictStrategy: 'overwrite' })).rejects.toThrow(
                /Snapshot migracji unieważniony: Stan kolekcji 'clients' w MongoDB uległ zmianie/
            );
        });
    });

    describe('Admin Migration API & Strategy Flow', () => {
        it('previews items and executes migration via administrative endpoint with replace action', async () => {
            const mockLocalClients = [
                { id: 'c-new', name: 'Nowy Klient' },
                { id: 'c-same', name: 'Identyczny Klient' },
                { id: 'c-diff', name: 'Zmieniony Klient', phone: '111-222' }
            ];

            const mockRemoteClients = [
                { id: 'c-same', name: 'Identyczny Klient' },
                { id: 'c-diff', name: 'Zmieniony Klient', phone: '999-888', obsoleteFieldInMongo: 'should_be_cleared' }
            ];

            const mockDB = {
                getAll: vi.fn((storeName: string) => {
                    if (storeName === 'clients') return Promise.resolve(mockLocalClients);
                    return Promise.resolve([]);
                })
            };
            vi.spyOn(dbModule, 'getDB').mockResolvedValue(mockDB as any);

            const mockAdapter = {
                getAll: vi.fn((storeName) => {
                    return Promise.resolve(mockRemoteClients);
                })
            };
            vi.spyOn(adapterFactoryModule, 'getAdapter').mockReturnValue(mockAdapter as any);

            // Mock fetch for adminMigrateRecord
            const adminCalls: any[] = [];
            globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
                if (url.includes('/api/migration/admin-record')) {
                    const body = JSON.parse(init?.body as string);
                    adminCalls.push(body);
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({ success: true, action: body.action, id: body.record.id })
                    } as Response);
                }
                return Promise.reject(new Error('Unexpected fetch ' + url));
            }) as any;

            // 1. Preview
            const preview = await migrationService.previewMigration();
            expect(preview.items.find(i => i.id === 'c-new')?.status).toBe('to_create');
            expect(preview.items.find(i => i.id === 'c-diff')?.status).toBe('conflict');

            // 2. Migrate with 'overwrite'
            const report = await migrationService.migrateAll(preview, { conflictStrategy: 'overwrite' });

            expect(report.created).toBeGreaterThanOrEqual(1);
            expect(report.updated).toBeGreaterThanOrEqual(1);

            // Verify admin endpoint calls
            const createCall = adminCalls.find(c => c.action === 'create' && c.record.id === 'c-new');
            expect(createCall).toBeDefined();

            const replaceCall = adminCalls.find(c => c.action === 'replace' && c.record.id === 'c-diff');
            expect(replaceCall).toBeDefined();
            expect(replaceCall.record.phone).toBe('111-222');
            expect(replaceCall.expectedFingerprint).toBeDefined();
        });
    });
});
