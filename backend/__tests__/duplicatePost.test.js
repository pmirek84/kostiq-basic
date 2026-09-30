const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { app, setDb, reconcileDuplicatesAndEnsureIndexes } = require('../server');

test('Backend Atomic Duplicate Prevention & Batch Import', async (t) => {
    const store = new Map();
    const notifications = [];

    const mockCollection = {
        insertOne: async (doc) => {
            if (store.has(doc.id)) {
                const err = new Error('E11000 duplicate key error collection: costframe.clients index: id_1 dup key: { id: "' + doc.id + '" }');
                err.code = 11000;
                throw err;
            }
            store.set(doc.id, { ...doc, _id: 'mongo-' + doc.id });
            return { insertedId: 'mongo-' + doc.id };
        },
        findOne: async (query) => {
            if (query && query.$or) {
                for (const condition of query.$or) {
                    if (condition.id && store.has(condition.id)) return store.get(condition.id);
                }
            }
            return null;
        },
        bulkWrite: async (ops) => {
            let upsertedCount = 0;
            let modifiedCount = 0;
            for (const op of ops) {
                if (op.updateOne) {
                    const id = op.updateOne.filter.id;
                    const exists = store.has(id);
                    const existing = store.get(id) || {};
                    const setOnInsert = op.updateOne.update.$setOnInsert || {};
                    const setFields = op.updateOne.update.$set || {};

                    if (exists) {
                        store.set(id, { ...existing, ...setFields });
                        modifiedCount++;
                    } else {
                        store.set(id, { ...setOnInsert, ...setFields, _id: 'mongo-' + id });
                        upsertedCount++;
                    }
                }
            }
            return { upsertedCount, modifiedCount, matchedCount: modifiedCount };
        }
    };

    const mockDb = {
        collection: (colName) => {
            if (colName === 'notifications') {
                return {
                    insertOne: async (notif) => {
                        notifications.push(notif);
                        return { insertedId: 'notif-' + Date.now() };
                    }
                };
            }
            if (colName === 'employees') {
                return {
                    findOne: async (query) => {
                        return { id: 'emp-101', hourlyRate: 50 };
                    }
                };
            }
            return mockCollection;
        },
    };
    setDb(mockDb, true);

    await t.test('POST /api/clients returns 201 on first creation', async () => {
        const res = await request(app)
            .post('/api/clients')
            .send({ id: 'c-unique-1', name: 'Klient 1' });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.id, 'c-unique-1');
    });

    await t.test('POST /api/clients returns 409 Conflict on duplicate ID insertion (no silent overwrite)', async () => {
        const res = await request(app)
            .post('/api/clients')
            .send({ id: 'c-unique-1', name: 'Klient 1 Bis' });
        assert.strictEqual(res.status, 409);
        assert.match(res.body.error, /już istnieje/);
    });

    await t.test('Concurrent POSTs with same ID: exactly one succeeds with 201, other fails with 409', async () => {
        const targetId = 'c-concurrent-test';
        const [res1, res2] = await Promise.all([
            request(app).post('/api/clients').send({ id: targetId, name: 'First' }),
            request(app).post('/api/clients').send({ id: targetId, name: 'Second' })
        ]);

        const statuses = [res1.status, res2.status].sort();
        assert.deepStrictEqual(statuses, [201, 409]);
    });

    await t.test('POST /api/clients/batch-import atomically upserts, preserves createdAt, returns succeededIds', async () => {
        const originalCreatedAt = '2026-01-01T00:00:00.000Z';
        store.set('existing-c', { id: 'existing-c', name: 'Old Name', createdAt: originalCreatedAt });

        const importPayload = {
            items: [
                { id: 'existing-c', name: 'New Name' }, // update
                { id: 'brand-new-c', name: 'Brand New' } // insert
            ]
        };

        const res = await request(app)
            .post('/api/clients/batch-import')
            .send(importPayload);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.succeeded, 2);
        assert.deepStrictEqual(res.body.succeededIds, ['existing-c', 'brand-new-c']);

        // Verify createdAt was preserved on existing record!
        const updatedDoc = store.get('existing-c');
        assert.strictEqual(updatedDoc.name, 'New Name');
        assert.strictEqual(updatedDoc.createdAt, originalCreatedAt);

        // Verify brand-new record got a valid createdAt
        const newDoc = store.get('brand-new-c');
        assert.strictEqual(newDoc.name, 'Brand New');
        assert.ok(newDoc.createdAt);
    });

    await t.test('POST /api/time-entries/batch-import validates date, calculates cost from employee DB rate', async () => {
        // Use today's UTC date so it passes future and backdate guards
        const todayStr = new Date().toISOString().slice(0, 10);
        const payload = {
            items: [
                { id: 'te-1', employeeId: 'emp-101', jobId: 'job-202', hours: 4, date: todayStr }
            ]
        };

        const res = await request(app)
            .post('/api/time-entries/batch-import')
            .set('x-test-role', 'worker')
            .send(payload);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.succeeded, 1);
        assert.deepStrictEqual(res.body.succeededIds, ['te-1']);

        // Check that item in store had its cost computed from DB rate (4h * 50 = 200)
        const stored = store.get('te-1');
        assert.strictEqual(stored.cost, 200);
        assert.strictEqual(stored.hourlyRate, 50);
    });

    await t.test('POST /api/time-entries/batch-import rejects future dates with 400', async () => {
        const futureDate = '2099-01-01';
        const payload = {
            items: [
                { id: 'te-fut', employeeId: 'emp-101', jobId: 'job-1', hours: 8, date: futureDate }
            ]
        };

        const res = await request(app)
            .post('/api/time-entries/batch-import')
            .send(payload);

        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /przysz/);
    });

    await t.test('POST /api/time-entries/batch-import rejects dates older than 7 days for non-admin', async () => {
        const oldDate = '2020-01-01';
        const payload = {
            items: [
                { id: 'te-old', employeeId: 'emp-101', jobId: 'job-1', hours: 8, date: oldDate }
            ]
        };

        const res = await request(app)
            .post('/api/time-entries/batch-import')
            .set('x-test-role', 'worker')
            .send(payload);

        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /zbyt stara/);
    });

    await t.test('POST /api/extra-works/batch-import is rejected with 405 without triggering fake notifications', async () => {
        const notifCountBefore = notifications.length;

        const res = await request(app)
            .post('/api/extra-works/batch-import')
            .send({ items: [{ id: 'ew-1', name: 'Work', jobId: 'j-1' }] });

        assert.strictEqual(res.status, 405);
        assert.match(res.body.error, /Import wsadowy nie jest dozwolony dla kolekcji 'extra-works'/);

        // Verify NO fake notification was created on 405 response!
        assert.strictEqual(notifications.length, notifCountBefore);
    });

    await t.test('bulkWrite partial failure returns 207 Multi-Status with exact succeededIds and failedIds', async () => {
        const partialError = new Error('BulkWrite partial error');
        partialError.name = 'MongoBulkWriteError';
        partialError.result = { nUpserted: 1, nModified: 0, nMatched: 0 };
        // writeErrors indicates index 1 failed
        partialError.writeErrors = [{ index: 1, errmsg: 'Duplicate key error on item-2' }];

        mockCollection.bulkWrite = async () => { throw partialError; };

        const res = await request(app)
            .post('/api/clients/batch-import')
            .send({ items: [{ id: 'item-1', name: 'A' }, { id: 'item-2', name: 'B' }] });

        assert.strictEqual(res.status, 207);
        assert.strictEqual(res.body.status, 'partial_success');
        assert.strictEqual(res.body.succeeded, 1);
        assert.strictEqual(res.body.failed, 1);
        assert.deepStrictEqual(res.body.succeededIds, ['item-1']);
        assert.deepStrictEqual(res.body.failedIds, ['item-2']);
        assert.strictEqual(res.body.errors.length, 1);
        assert.match(res.body.errors[0], /Duplicate key error/);
    });

    await t.test('dbReady = false returns 503 Service Unavailable, blocking unindexed operation', async () => {
        setDb(mockDb, false);

        const res = await request(app)
            .get('/api/clients');

        assert.strictEqual(res.status, 503);
        assert.match(res.body.error, /Database not ready/);

        // Restore ready state
        setDb(mockDb, true);
    });
});

test('Database Indexing & Migration: Reconciling Duplicates & Verification', async (t) => {
    await t.test('reconcileDuplicatesAndEnsureIndexes snapshots to quarantine, merges non-empty fields, then deletes', async () => {
        const docs = [
            { _id: 'doc-old', id: 'dup-id-1', name: 'Old Name', notes: 'Preserved Note', updatedAt: '2026-01-01T00:00:00Z' },
            { _id: 'doc-new', id: 'dup-id-1', name: 'Newest Name', notes: null, updatedAt: '2026-09-01T00:00:00Z' },
            { _id: 'doc-mid', id: 'dup-id-1', name: 'Mid Name', extraTag: 'TagX', updatedAt: '2026-05-01T00:00:00Z' }
        ];

        const deletedIds = [];
        const quarantinedDocs = [];
        let updatedFields = null;
        let indexCreated = false;

        const fakeCollection = {
            aggregate: () => ({
                toArray: async () => [
                    {
                        _id: 'dup-id-1',
                        count: 3,
                        docs: docs.map(d => ({ _id: d._id, updatedAt: d.updatedAt, createdAt: d.createdAt }))
                    }
                ]
            }),
            find: (filter) => ({
                toArray: async () => docs.filter(d => filter._id.$in.includes(d._id))
            }),
            updateOne: async (filter, update) => {
                updatedFields = update.$set;
                return { modifiedCount: 1 };
            },
            deleteMany: async (filter) => {
                deletedIds.push(...filter._id.$in);
                return { deletedCount: filter._id.$in.length };
            },
            createIndex: async (spec, opts) => {
                indexCreated = true;
                return 'id_1';
            },
            indexes: async () => [
                { key: { id: 1 }, unique: true }
            ]
        };

        const testDb = {
            collection: (colName) => {
                if (colName === '_migration_quarantine') {
                    return {
                        insertMany: async (items) => {
                            quarantinedDocs.push(...items);
                            return { insertedCount: items.length };
                        }
                    };
                }
                if (colName === '_migration_logs') {
                    return {
                        insertOne: async () => ({ insertedId: 'log-1' })
                    };
                }
                if (colName === 'clients') return fakeCollection;
                return {
                    aggregate: () => ({ toArray: async () => [] }),
                    createIndex: async () => 'id_1',
                    indexes: async () => [{ key: { id: 1 }, unique: true }]
                };
            }
        };

        await reconcileDuplicatesAndEnsureIndexes(testDb);

        // 1. Verify duplicates were backed up to quarantine
        assert.strictEqual(quarantinedDocs.length, 2);
        assert.strictEqual(quarantinedDocs[0].documentId, 'dup-id-1');

        // 2. Verify non-destructive field merge: doc-old had notes, doc-mid had extraTag
        assert.ok(updatedFields);
        assert.strictEqual(updatedFields.notes, 'Preserved Note');
        assert.strictEqual(updatedFields.extraTag, 'TagX');

        // 3. Verify that doc-old and doc-mid were deleted, keeping doc-new
        assert.strictEqual(deletedIds.length, 2);
        assert.ok(deletedIds.includes('doc-old'));
        assert.ok(deletedIds.includes('doc-mid'));
        assert.ok(!deletedIds.includes('doc-new'));
        assert.strictEqual(indexCreated, true);
    });

    await t.test('reconcileDuplicatesAndEnsureIndexes throws error and does not swallow failures if index verification fails', async () => {
        const fakeFailingCollection = {
            aggregate: () => ({ toArray: async () => [] }),
            createIndex: async () => { throw new Error('Simulated index conflict'); },
            indexes: async () => []
        };

        const testDb = {
            collection: () => fakeFailingCollection
        };

        await assert.rejects(async () => {
            await reconcileDuplicatesAndEnsureIndexes(testDb);
        }, /Krytyczny błąd: Nie udało się zagwarantować integralności indeksów/);
    });
});
