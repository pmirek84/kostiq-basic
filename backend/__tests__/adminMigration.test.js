process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app, setDb } = require('../server');

const adminToken = jwt.sign(
    { id: 'admin-1', role: 'admin', email: 'admin@kostiq.pl' },
    'test-secret',
    { expiresIn: '1h' }
);

const workerToken = jwt.sign(
    { id: 'worker-1', role: 'worker', email: 'worker@kostiq.pl' },
    'test-secret',
    { expiresIn: '1h' }
);

test('POST /api/migration/admin-record: Administrative migration with full document replacement', async (t) => {
    const store = new Map();

    const mockCollection = {
        findOne: async (filter) => {
            return store.get(filter.id) || null;
        },
        insertOne: async (doc) => {
            if (store.has(doc.id)) {
                const err = new Error('E11000 duplicate key');
                err.code = 11000;
                throw err;
            }
            store.set(doc.id, { ...doc });
            return { insertedId: doc.id };
        },
        replaceOne: async (filter, doc, options) => {
            // Full replacement
            store.set(filter.id, { ...doc });
            return { acknowledged: true, modifiedCount: 1 };
        }
    };

    const mockDb = {
        collection: (name) => {
            if (name === 'employees') {
                return {
                    findOne: async (f) => ({ id: f.id, isActive: true, role: f.id === 'admin-1' ? 'admin' : 'worker' })
                };
            }
            return mockCollection;
        }
    };

    setDb(mockDb, true);

    // Initial item in MongoDB with extra fields that should be removed upon replace
    store.set('client-1', {
        id: 'client-1',
        name: 'Firma ABC',
        obsoleteFieldInMongo: 'SHOULD_BE_REMOVED',
        updatedAt: '2026-09-30T15:00:00Z'
    });

    await t.test('rejects worker token with 403 Forbidden', async () => {
        const res = await request(app)
            .post('/api/migration/admin-record')
            .set('Authorization', `Bearer ${workerToken}`)
            .set('x-test-role', 'worker')
            .send({
                collection: 'clients',
                action: 'replace',
                record: { id: 'client-1', name: 'Firma ABC Nowa' }
            });

        assert.strictEqual(res.status, 403);
    });

    await t.test('action=replace performs full document replacement, clearing obsolete fields', async () => {
        const res = await request(app)
            .post('/api/migration/admin-record')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-test-role', 'admin')
            .send({
                collection: 'clients',
                action: 'replace',
                record: { id: 'client-1', name: 'Firma ABC Po Migracji' }
            });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.action, 'replaced');

        const saved = store.get('client-1');
        assert.strictEqual(saved.name, 'Firma ABC Po Migracji');
        assert.strictEqual(saved.obsoleteFieldInMongo, undefined, 'Obsolete fields must be deleted upon replace');
    });

    await t.test('action=create inserts new document or returns 409 if exists', async () => {
        const resCreate = await request(app)
            .post('/api/migration/admin-record')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-test-role', 'admin')
            .send({
                collection: 'clients',
                action: 'create',
                record: { id: 'client-2', name: 'Klient 2' }
            });

        assert.strictEqual(resCreate.status, 200);
        assert.strictEqual(store.get('client-2').name, 'Klient 2');

        // Duplicate create returns 409
        const resDup = await request(app)
            .post('/api/migration/admin-record')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-test-role', 'admin')
            .send({
                collection: 'clients',
                action: 'create',
                record: { id: 'client-2', name: 'Klient 2 Dup' }
            });

        assert.strictEqual(resDup.status, 409);
    });
});
