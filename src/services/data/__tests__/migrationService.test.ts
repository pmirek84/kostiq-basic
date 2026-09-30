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

    describe('previewMigration & migrateAll flow', () => {
        it('previews items as to_create, identical, or conflict and executes per-record migration report', async () => {
            const mockLocalClients = [
                { id: 'c-new', name: 'Nowy Klient' },
                { id: 'c-same', name: 'Identyczny Klient' },
                { id: 'c-diff', name: 'Zmieniony Klient', phone: '111-222' }
            ];

            const mockRemoteClients = [
                { id: 'c-same', name: 'Identyczny Klient' },
                { id: 'c-diff', name: 'Zmieniony Klient', phone: '999-888' }
            ];

            const mockDB = {
                getAll: vi.fn((storeName: string) => {
                    if (storeName === 'clients') return Promise.resolve(mockLocalClients);
                    return Promise.resolve([]);
                })
            };
            vi.spyOn(dbModule, 'getDB').mockResolvedValue(mockDB as any);

            const mockCreated: any[] = [];
            const mockSaved: any[] = [];

            const mockAdapter = {
                getAll: vi.fn(() => Promise.resolve(mockRemoteClients)),
                create: vi.fn((item) => {
                    mockCreated.push(item);
                    return Promise.resolve(item.id);
                }),
                save: vi.fn((item) => {
                    mockSaved.push(item);
                    return Promise.resolve(item.id);
                })
            };

            vi.spyOn(adapterFactoryModule, 'getAdapter').mockReturnValue(mockAdapter as any);

            // 1. Test preview
            const preview = await migrationService.previewMigration();
            expect(preview.totalLocal).toBe(3);
            expect(preview.toCreateCount).toBe(1);
            expect(preview.identicalCount).toBe(1);
            expect(preview.conflictCount).toBe(1);

            const diffItem = preview.items.find(i => i.id === 'c-diff');
            expect(diffItem?.status).toBe('conflict');
            expect(diffItem?.conflictFields).toEqual(['phone']);

            // 2. Test migrateAll with conflictStrategy: 'skip'
            const reportSkip = await migrationService.migrateAll({ conflictStrategy: 'skip' });
            expect(reportSkip.created).toBe(1);
            expect(reportSkip.skipped).toBe(2); // 1 identical + 1 conflict skipped
            expect(reportSkip.updated).toBe(0);
            expect(mockCreated.length).toBe(1);
            expect(mockCreated[0].id).toBe('c-new');
            expect(mockSaved.length).toBe(0);

            // 3. Test migrateAll with conflictStrategy: 'overwrite'
            mockCreated.length = 0;
            mockSaved.length = 0;
            const reportOverwrite = await migrationService.migrateAll({ conflictStrategy: 'overwrite' });
            expect(reportOverwrite.created).toBe(1);
            expect(reportOverwrite.updated).toBe(1); // conflict overwritten
            expect(reportOverwrite.skipped).toBe(1); // identical skipped
            expect(mockSaved.length).toBe(1);
            expect(mockSaved[0].id).toBe('c-diff');
        });
    });
});
