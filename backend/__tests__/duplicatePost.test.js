const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { app, setDb, reconcileDuplicatesAndEnsureIndexes } = require('../server');

test('Backend Atomic Duplicate Prevention & Batch Import', async (t) => {
    const store = new Map();

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
        collection: () => mockCollection,
    };
    setDb(mockDb);

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

    await t.test('POST /api/clients/batch-import atomically upserts and preserves createdAt on existing records', async () => {
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

        // Verify createdAt was preserved on existing record!
        const updatedDoc = store.get('existing-c');
        assert.strictEqual(updatedDoc.name, 'New Name');
        assert.strictEqual(updatedDoc.createdAt, originalCreatedAt);

        // Verify brand-new record got a valid createdAt
        const newDoc = store.get('brand-new-c');
        assert.strictEqual(newDoc.name, 'Brand New');
        assert.ok(newDoc.createdAt);
    });

    await t.test('POST /api/time-entries/batch-import is accepted by validateTimeEntry middleware and validated', async () => {
        const payload = {
            items: [
                { id: 'te-1', employeeId: 'emp-101', jobId: 'job-202', hours: 7.5, date: '2026-09-10' },
                { id: 'te-2', employeeId: 'emp-102', jobId: 'job-202', hours: 8, date: '2026-09-10' }
            ]
        };

        const res = await request(app)
            .post('/api/time-entries/batch-import')
            .send(payload);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.succeeded, 2);
        assert.strictEqual(res.body.failed, 0);
    });

    await t.test('POST /api/time-entries/batch-import rejects invalid item data (missing employeeId / negative hours)', async () => {
        const invalidPayload = {
            items: [
                { id: 'te-bad-1', jobId: 'job-202', hours: 8 } // missing employeeId
            ]
        };

        const res = await request(app)
            .post('/api/time-entries/batch-import')
            .send(invalidPayload);

        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /employeeId jest wymagane/);

        const negativeHoursPayload = {
            items: [
                { id: 'te-bad-2', employeeId: 'emp-1', jobId: 'job-1', hours: -2 }
            ]
        };

        const resNeg = await request(app)
            .post('/api/time-entries/batch-import')
            .send(negativeHoursPayload);

        assert.strictEqual(resNeg.status, 400);
        assert.match(resNeg.body.error, /ujemne/);
    });

    await t.test('POST /api/extra-works/batch-import is rejected with 405 (not whitelisted, protects domain rules)', async () => {
        const res = await request(app)
            .post('/api/extra-works/batch-import')
            .send({ items: [{ id: 'ew-1', name: 'Work' }] });

        assert.strictEqual(res.status, 405);
        assert.match(res.body.error, /Import wsadowy nie jest dozwolony dla kolekcji 'extra-works'/);
    });

    await t.test('bulkWrite partial failure returns 207 Multi-Status with granular error counts, not 500', async () => {
        const partialError = new Error('BulkWrite partial error');
        partialError.name = 'MongoBulkWriteError';
        partialError.result = { nUpserted: 1, nModified: 0, nMatched: 0 };
        partialError.writeErrors = [{ index: 1, errmsg: 'Duplicate key error on item 2' }];

        mockCollection.bulkWrite = async () => { throw partialError; };

        const res = await request(app)
            .post('/api/clients/batch-import')
            .send({ items: [{ id: 'item-1', name: 'A' }, { id: 'item-2', name: 'B' }] });

        assert.strictEqual(res.status, 207);
        assert.strictEqual(res.body.status, 'partial_success');
        assert.strictEqual(res.body.succeeded, 1);
        assert.strictEqual(res.body.failed, 1);
        assert.strictEqual(res.body.errors.length, 1);
        assert.match(res.body.errors[0], /Duplicate key error/);
    });
});

test('Database Indexing & Migration: Reconciling Duplicates & Verification', async (t) => {
    await t.test('reconcileDuplicatesAndEnsureIndexes deduplicates keeping the newest record and builds index', async () => {
        const docs = [
            { _id: 'doc-old', id: 'dup-id-1', name: 'Old', updatedAt: '2026-01-01T00:00:00Z' },
            { _id: 'doc-new', id: 'dup-id-1', name: 'Newest', updatedAt: '2026-09-01T00:00:00Z' },
            { _id: 'doc-mid', id: 'dup-id-1', name: 'Mid', updatedAt: '2026-05-01T00:00:00Z' }
        ];

        const deletedIds = [];
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
                if (colName === 'clients') return fakeCollection;
                return {
                    aggregate: () => ({ toArray: async () => [] }),
                    createIndex: async () => 'id_1',
                    indexes: async () => [{ key: { id: 1 }, unique: true }]
                };
            }
        };

        await reconcileDuplicatesAndEnsureIndexes(testDb);

        // Verify that doc-old and doc-mid were deleted, keeping doc-new (newest updatedAt)
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
