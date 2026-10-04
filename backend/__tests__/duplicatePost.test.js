const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { app, setDb, reconcileDuplicatesAndEnsureIndexes, VALID_TIME_ENTRY_STATUSES } = require('../server');

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
            if (query && query.id) return store.get(query.id) || null;
            if (query && query.$or) {
                for (const condition of query.$or) {
                    if (condition.id && store.has(condition.id)) return store.get(condition.id);
                }
            }
            return null;
        },
        find: (query) => ({
            toArray: async () => {
                if (query && query.id && query.id.$in) {
                    return query.id.$in.map(id => store.get(id)).filter(Boolean);
                }
                return Array.from(store.values());
            }
        }),
        updateOne: async (filter, update) => {
            const id = filter.id;
            const doc = store.get(id);
            if (!doc) return { matchedCount: 0, modifiedCount: 0 };
            const updated = { ...doc, ...update.$set };
            store.set(id, updated);
            return { matchedCount: 1, modifiedCount: 1 };
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
            if (colName === 'jobs') {
                return {
                    findOne: async (query) => {
                        const id = query.$or ? query.$or[0].id : query.id;
                        return { id: id || 'job-202', status: 'in_progress' };
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

    await t.test('PATCH /api/time-entries/:id accepts partial update without demanding employeeId/jobId', async () => {
        store.set('te-patch-1', {
            id: 'te-patch-1',
            employeeId: 'emp-1',
            jobId: 'job-1',
            status: 'submitted',
            hours: 6
        });

        const res = await request(app)
            .patch('/api/time-entries/te-patch-1')
            .send({ status: 'approved' });

        assert.strictEqual(res.status, 200);
        const updated = store.get('te-patch-1');
        assert.strictEqual(updated.status, 'approved');
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

    await t.test('POST /api/time-entries/batch-import validates date, calculates cost for hourly billing', async () => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const payload = {
            items: [
                { id: 'te-hourly', employeeId: 'emp-101', jobId: 'job-202', hours: 4, date: todayStr, billingType: 'hourly' }
            ]
        };

        const res = await request(app)
            .post('/api/time-entries/batch-import')
            .send(payload);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.succeeded, 1);
        assert.deepStrictEqual(res.body.succeededIds, ['te-hourly']);

        const stored = store.get('te-hourly');
        assert.strictEqual(stored.cost, 200);
        assert.strictEqual(stored.hourlyRate, 50);
    });

    await t.test('POST /api/time-entries/batch-import preserves cost for non-hourly (fixed, m2)', async () => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const payload = {
            items: [
                { id: 'te-fixed', employeeId: 'emp-101', jobId: 'job-1', hours: 8, date: todayStr, billingType: 'fixed', cost: 1500 },
                { id: 'te-m2', employeeId: 'emp-101', jobId: 'job-1', hours: 8, date: todayStr, billingType: 'm2', quantity: 20, rate: 30 }
            ]
        };

        const res = await request(app)
            .post('/api/time-entries/batch-import')
            .send(payload);

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.succeeded, 2);

        // Fixed cost was NOT overwritten by hours * rate (8 * 50 = 400)
        const storedFixed = store.get('te-fixed');
        assert.strictEqual(storedFixed.cost, 1500);

        // m2 cost was computed from quantity * rate (20 * 30 = 600)
        const storedM2 = store.get('te-m2');
        assert.strictEqual(storedM2.cost, 600);
    });

    await t.test('POST /api/time-entries/batch-import rejects worker importing for other employees with 403', async () => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const payload = {
            items: [
                { id: 'te-other', employeeId: 'other-emp-99', jobId: 'job-1', hours: 4, date: todayStr }
            ]
        };

        const res = await request(app)
            .post('/api/time-entries/batch-import')
            .set('x-test-role', 'worker')
            .send(payload);

        assert.strictEqual(res.status, 403);
        assert.match(res.body.error, /Brak uprawnień/);
    });

    await t.test('POST /api/time-entries/batch-import rejects invalid date string with 400', async () => {
        const payload = {
            items: [
                { id: 'te-inv-date', employeeId: 'emp-101', jobId: 'job-1', hours: 4, date: 'not-a-valid-date' }
            ]
        };

        const res = await request(app)
            .post('/api/time-entries/batch-import')
            .send(payload);

        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /Nieprawidłowy format daty/);
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
                { id: 'te-old', employeeId: 'test-user', jobId: 'job-1', hours: 8, date: oldDate }
            ]
        };

        const res = await request(app)
            .post('/api/time-entries/batch-import')
            .set('x-test-role', 'worker')
            .send(payload);

        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /zbyt stara/);
    });

    await t.test('POST /api/clients/batch-import rejects duplicate IDs within a single batch with 400', async () => {
        const payload = {
            items: [
                { id: 'dup-batch-item', name: 'Version A' },
                { id: 'dup-batch-item', name: 'Version B' }
            ]
        };

        const res = await request(app)
            .post('/api/clients/batch-import')
            .send(payload);

        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /Wykryto zduplikowane identyfikatory w paczce importowej/);
    });

    await t.test('POST /api/time-entries/batch-import rejects worker attempting to hijack existing entry of another employee with 403', async () => {
        const todayStr = new Date().toISOString().slice(0, 10);
        // Seed existing entry owned by another employee
        store.set('te-owned-by-other', {
            id: 'te-owned-by-other',
            employeeId: 'other-emp-99',
            jobId: 'job-1',
            hours: 4,
            date: todayStr,
            status: 'submitted'
        });

        // Worker attempts to overwrite with its own employeeId
        const payload = {
            items: [
                { id: 'te-owned-by-other', employeeId: 'test-user', jobId: 'job-1', hours: 8, date: todayStr }
            ]
        };

        const res = await request(app)
            .post('/api/time-entries/batch-import')
            .set('x-test-role', 'worker')
            .send(payload);

        assert.strictEqual(res.status, 403);
        assert.match(res.body.error, /Nie można zmodyfikować ani przejąć istniejącego wpisu innego pracownika/);
    });

    await t.test('POST /api/time-entries/batch-import resets worker status admin_approved to submitted', async () => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const payload = {
            items: [
                { id: 'te-worker-admin-app', employeeId: 'test-user', jobId: 'job-1', hours: 6, date: todayStr, status: 'admin_approved' }
            ]
        };

        const res = await request(app)
            .post('/api/time-entries/batch-import')
            .set('x-test-role', 'worker')
            .send(payload);

        assert.strictEqual(res.status, 200);
        const stored = store.get('te-worker-admin-app');
        assert.strictEqual(stored.status, 'submitted');
    });

    await t.test('POST /api/time-entries/batch-import rejects invalid calendar date (e.g. 2026-02-31) with 400', async () => {
        const payload = {
            items: [
                { id: 'te-cal-inv', employeeId: 'test-user', jobId: 'job-1', hours: 4, date: '2026-02-31' }
            ]
        };

        const res = await request(app)
            .post('/api/time-entries/batch-import')
            .send(payload);

        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /Nieprawidłowa data kalendarzowa/);
    });

    await t.test('POST /api/time-entries/batch-import resets worker self-approved status to submitted', async () => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const payload = {
            items: [
                { id: 'te-worker-self', employeeId: 'test-user', jobId: 'job-1', hours: 6, date: todayStr, status: 'approved' }
            ]
        };

        const res = await request(app)
            .post('/api/time-entries/batch-import')
            .set('x-test-role', 'worker')
            .send(payload);

        assert.strictEqual(res.status, 200);
        const stored = store.get('te-worker-self');
        assert.strictEqual(stored.status, 'submitted');
    });

    await t.test('PATCH /api/time-entries/:id accepts partial payload (status and cost) without employeeId/jobId', async () => {
        const todayStr = new Date().toISOString().slice(0, 10);
        store.set('te-patch-1', {
            id: 'te-patch-1',
            employeeId: 'emp-101',
            jobId: 'job-1',
            hours: 4,
            date: todayStr,
            status: 'submitted',
            cost: 200,
            updatedAt: '2026-09-01T10:00:00Z'
        });

        const patchPayload = {
            status: 'approved',
            cost: 250
        };

        const res = await request(app)
            .patch('/api/time-entries/te-patch-1')
            .send(patchPayload);

        assert.strictEqual(res.status, 200);
        const updated = store.get('te-patch-1');
        assert.strictEqual(updated.status, 'approved');
        assert.strictEqual(updated.cost, 200, 'Authoritative cost calculation must override client cost (4h * 50 = 200)');
        assert.strictEqual(updated.employeeId, 'emp-101');
        assert.strictEqual(updated.jobId, 'job-1');
    });

    await t.test('PATCH /api/time-entries/:id rejects invalid date format with 400', async () => {
        const patchPayload = {
            date: 'not-a-valid-date'
        };

        const res = await request(app)
            .patch('/api/time-entries/te-patch-1')
            .send(patchPayload);

        assert.strictEqual(res.status, 400);
        assert.match(res.body.error, /Nieprawidłowy format daty/);
    });

    await t.test('POST /api/time-entries rejects worker attempting to create entry for another employee with 403', async () => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const payload = {
            id: 'te-worker-post-other',
            employeeId: 'other-emp-99',
            jobId: 'job-1',
            hours: 4,
            date: todayStr
        };

        const res = await request(app)
            .post('/api/time-entries')
            .set('x-test-role', 'worker')
            .send(payload);

        assert.strictEqual(res.status, 403);
        assert.match(res.body.error, /Pracownik może tworzyć wpisy wyłącznie dla własnego identyfikatora/);
    });

    await t.test('PATCH /api/time-entries/:id rejects worker attempting to reassign entry to another employee with 403', async () => {
        const todayStr = new Date().toISOString().slice(0, 10);
        store.set('te-worker-own', {
            id: 'te-worker-own',
            employeeId: 'test-user',
            jobId: 'job-1',
            hours: 4,
            date: todayStr,
            status: 'submitted'
        });

        const patchPayload = {
            employeeId: 'other-emp-99'
        };

        const res = await request(app)
            .patch('/api/time-entries/te-worker-own')
            .set('x-test-role', 'worker')
            .send(patchPayload);

        assert.strictEqual(res.status, 403);
        assert.match(res.body.error, /Pracownik nie może zmieniać przypisania wpisu/);
    });

    await t.test('Worker ownership check fails closed with 503 if database errors out', async () => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const originalFindOne = mockCollection.findOne;
        mockCollection.findOne = async () => { throw new Error('DB connection dropped'); };

        try {
            const res = await request(app)
                .patch('/api/time-entries/te-worker-own')
                .set('x-test-role', 'worker')
                .send({ status: 'submitted' });

            assert.strictEqual(res.status, 503);
            assert.match(res.body.error, /Nie można zweryfikować uprawnień własności rekordu/);
        } finally {
            mockCollection.findOne = originalFindOne;
        }
    });

    await t.test('POST /api/time-entries defaults status to submitted and rejects invalid statuses with 400', async () => {
        const todayStr = new Date().toISOString().slice(0, 10);

        // 1. Invalid status rejected (bogus_status_xyz)
        const invalidRes = await request(app)
            .post('/api/time-entries')
            .send({
                id: 'te-inv-status',
                employeeId: 'emp-101',
                jobId: 'job-1',
                hours: 4,
                date: todayStr,
                status: 'bogus_status_xyz'
            });

        assert.strictEqual(invalidRes.status, 400);
        assert.match(invalidRes.body.error, /Nieprawidłowy status wpisu czasu/);

        // 2. Legacy 'settled' status is NOT part of TimeEntry contract and MUST be rejected with 400
        const settledRes = await request(app)
            .post('/api/time-entries')
            .send({
                id: 'te-settled-invalid',
                employeeId: 'emp-101',
                jobId: 'job-1',
                hours: 4,
                date: todayStr,
                status: 'settled'
            });

        assert.strictEqual(settledRes.status, 400);
        assert.match(settledRes.body.error, /Nieprawidłowy status wpisu czasu/);

        // 3. Missing status defaults to submitted
        const validRes = await request(app)
            .post('/api/time-entries')
            .send({
                id: 'te-default-status',
                employeeId: 'emp-101',
                jobId: 'job-1',
                hours: 4,
                date: todayStr
            });

        assert.strictEqual(validRes.status, 201);
        const stored = store.get('te-default-status');
        assert.strictEqual(stored.status, 'submitted');
    });

    await t.test('Table-driven test: all 9 domain statuses from src/models/types.ts are accepted on POST and PATCH', async () => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const expectedStatuses = [
            'draft',
            'pending',
            'submitted',
            'approved',
            'rejected',
            'foreman_approved',
            'foreman_rejected',
            'admin_approved',
            'admin_rejected'
        ];

        assert.deepStrictEqual(VALID_TIME_ENTRY_STATUSES, expectedStatuses);

        for (const status of expectedStatuses) {
            const entryId = 'te-status-' + status;

            // 1. Create with status via POST
            const postRes = await request(app)
                .post('/api/time-entries')
                .send({
                    id: entryId,
                    employeeId: 'emp-admin',
                    jobId: 'job-1',
                    hours: 2,
                    date: todayStr,
                    status
                });

            assert.strictEqual(postRes.status, 201, `Failed on POST for status ${status}`);
            assert.strictEqual(postRes.body.status, status);

            // 2. Update status via PATCH (e.g. ApprovalsView admin_rejected / foreman_rejected flows)
            const patchRes = await request(app)
                .patch('/api/time-entries/' + entryId)
                .send({
                    status
                });

            assert.strictEqual(patchRes.status, 200, `Failed on PATCH for status ${status}`);
            const stored = store.get(entryId);
            assert.strictEqual(stored.status, status);
        }
    });

    await t.test('Foreman role can approve or reject as foreman, but admin approvals are downgraded', async () => {
        const todayStr = new Date().toISOString().slice(0, 10);

        // Foreman sending foreman_rejected is accepted
        const frRes = await request(app)
            .post('/api/time-entries/batch-import')
            .set('x-test-role', 'foreman')
            .send({
                items: [
                    { id: 'te-foreman-rej', employeeId: 'test-user', jobId: 'job-1', hours: 4, date: todayStr, status: 'foreman_rejected' }
                ]
            });
        assert.strictEqual(frRes.status, 200);
        assert.strictEqual(store.get('te-foreman-rej').status, 'foreman_rejected');

        // Foreman sending admin_rejected or admin_approved is downgraded to submitted
        const faRes = await request(app)
            .post('/api/time-entries/batch-import')
            .set('x-test-role', 'foreman')
            .send({
                items: [
                    { id: 'te-foreman-admin-rej', employeeId: 'test-user', jobId: 'job-1', hours: 4, date: todayStr, status: 'admin_rejected' }
                ]
            });
        assert.strictEqual(faRes.status, 200);
        assert.strictEqual(store.get('te-foreman-admin-rej').status, 'submitted');
    });

    await t.test('POST /api/extra-works/batch-import is rejected with 405 without triggering fake notifications', async () => {
        const notifCountBefore = notifications.length;

        const res = await request(app)
            .post('/api/extra-works/batch-import')
            .send({ items: [{ id: 'ew-1', name: 'Work', jobId: 'j-1' }] });

        assert.strictEqual(res.status, 405);
        assert.match(res.body.error, /Import wsadowy nie jest dozwolony dla kolekcji 'extra-works'/);

        assert.strictEqual(notifications.length, notifCountBefore);
    });

    await t.test('bulkWrite partial failure returns 207 Multi-Status with exact succeededIds and failedIds', async () => {
        const partialError = new Error('BulkWrite partial error');
        partialError.name = 'MongoBulkWriteError';
        partialError.result = { nUpserted: 1, nModified: 0, nMatched: 0 };
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

        setDb(mockDb, true);
    });
});

test('Database Indexing & Migration: Reconciling Duplicates & Verification', async (t) => {
    await t.test('reconcileDuplicatesAndEnsureIndexes snapshots to quarantine, merges fields, reports complex conflicts', async () => {
        const docs = [
            {
                _id: 'doc-old',
                id: 'dup-id-1',
                name: 'Old Name',
                notes: 'Preserved Note',
                stages: [{ id: 's1', name: 'Stage 1' }],
                updatedAt: '2026-01-01T00:00:00Z'
            },
            {
                _id: 'doc-new',
                id: 'dup-id-1',
                name: 'Newest Name',
                notes: null,
                stages: [{ id: 's2', name: 'Stage 2 Different' }],
                updatedAt: '2026-09-01T00:00:00Z',
                creationDate: new Date('2026-01-15T12:00:00Z')
            },
            {
                _id: 'doc-mid',
                id: 'dup-id-1',
                name: 'Mid Name',
                extraTag: 'TagX',
                stages: [],
                updatedAt: '2026-05-01T00:00:00Z'
            }
        ];

        const deletedIds = [];
        const quarantinedDocs = [];
        const migrationLogs = [];
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
                        insertOne: async (log) => {
                            migrationLogs.push(log);
                            return { insertedId: 'log-' + migrationLogs.length };
                        }
                    };
                }
                if (colName === 'clients') return fakeCollection;
                return {
                    aggregate: () => ({ toArray: async () => [] }),
                    createIndex: async () => 'id_1',
                    indexes: async () => [{ key: { id: 1 }, unique: true }, { key: { jobCode: 1 }, unique: true }, { key: { number: 1 }, unique: true }, { key: { invoiceNumber: 1 }, unique: true }, { key: { invoiceId: 1, sequence: 1 }, unique: true }]
                };
            }
        };

        await reconcileDuplicatesAndEnsureIndexes(testDb);

        // 1. Verify all versions (primary snapshot + duplicates) were backed up to quarantine with BSON types intact
        assert.strictEqual(quarantinedDocs.length, 3);
        assert.strictEqual(quarantinedDocs[0].documentId, 'dup-id-1');
        const primarySnapshot = quarantinedDocs.find(d => d.reason === 'pre_merge_primary_snapshot');
        assert.ok(primarySnapshot);
        assert.ok(primarySnapshot.duplicateDoc.creationDate instanceof Date);
        assert.ok(quarantinedDocs.some(d => d.reason === 'duplicate_key_reconciliation'));

        // 2. Verify non-destructive field merge
        assert.ok(updatedFields);
        assert.strictEqual(updatedFields.notes, 'Preserved Note');
        assert.strictEqual(updatedFields.extraTag, 'TagX');

        // 3. Verify complex conflict detection in _migration_logs
        assert.strictEqual(migrationLogs.length, 1);
        assert.strictEqual(migrationLogs[0].hasConflicts, true);
        assert.ok(migrationLogs[0].conflictingFields.includes('stages'));

        // 4. Verify that doc-old and doc-mid were deleted, keeping doc-new
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
