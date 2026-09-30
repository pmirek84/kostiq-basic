const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { app, setDb } = require('../server');

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
});
