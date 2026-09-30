process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app, setDb, computeCanonicalDocHash } = require('../server');

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
            const existing = store.get(filter.id);
            if (!existing) {
                return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
            }
            if (filter.updatedAt !== undefined && existing.updatedAt !== filter.updatedAt) {
                return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
            }
            store.set(filter.id, { ...doc });
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
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

    await t.test('rejects collections not in ALLOWED_MIGRATION_COLLECTIONS (e.g. time-entries, employees, invoices) with 400', async () => {
        const sensitiveCollections = ['time-entries', 'employees', 'invoices', 'extra-works'];
        for (const col of sensitiveCollections) {
            const res = await request(app)
                .post('/api/migration/admin-record')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-test-role', 'admin')
                .send({
                    collection: col,
                    action: 'replace',
                    record: { id: 'test-1', name: 'Test' }
                });

            assert.strictEqual(res.status, 400, `Collection '${col}' must be rejected`);
            assert.match(res.body.error, /Niedozwolona lub nieobsługiwana kolekcja migracji/);
        }
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

    await t.test('action=replace detects concurrent modification (race condition) and returns 409', async () => {
        store.set('client-race', {
            id: 'client-race',
            name: 'Klient Race Oryginalny',
            updatedAt: '2026-09-30T10:00:00Z'
        });

        // 1. Concurrent modification bumped updatedAt
        store.get('client-race').updatedAt = '2026-09-30T10:05:00Z';

        // 2. Migration client attempts replace with stale expectedUpdatedAt
        const res = await request(app)
            .post('/api/migration/admin-record')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-test-role', 'admin')
            .send({
                collection: 'clients',
                action: 'replace',
                record: { id: 'client-race', name: 'Zastąpiony Klient' },
                expectedUpdatedAt: '2026-09-30T10:00:00Z'
            });

        assert.strictEqual(res.status, 409);
        assert.strictEqual(res.body.code, 'CONCURRENT_MODIFICATION');
        assert.match(res.body.error, /konflikt wersji/i);
    });

    await t.test('action=replace detects business field change even when updatedAt is untouched (canonical fingerprint mismatch) and returns 409', async () => {
        const originalDoc = {
            id: 'client-biz',
            name: 'Klient Biznesowy',
            phone: '123-456-789',
            updatedAt: '2026-09-30T10:00:00Z'
        };
        store.set('client-biz', { ...originalDoc });

        // Preview took canonical fingerprint of original document
        const previewFingerprint = computeCanonicalDocHash(originalDoc);

        // A concurrent edit mutated 'phone' without touching 'updatedAt'
        store.get('client-biz').phone = '999-999-999';

        // Migration client attempts replacement with approved preview fingerprint
        const res = await request(app)
            .post('/api/migration/admin-record')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-test-role', 'admin')
            .send({
                collection: 'clients',
                action: 'replace',
                record: { id: 'client-biz', name: 'Klient Po Migracji', phone: '123-456-789' },
                expectedUpdatedAt: '2026-09-30T10:00:00Z',
                expectedFingerprint: previewFingerprint
            });

        assert.strictEqual(res.status, 409);
        assert.strictEqual(res.body.code, 'CONCURRENT_MODIFICATION');
        assert.match(res.body.error, /fingerprint mismatch/i);
    });

    await t.test('action=replace succeeds when expectedUpdatedAt and expectedFingerprint match', async () => {
        const freshDoc = {
            id: 'client-match',
            name: 'Klient Match',
            phone: '555-555',
            updatedAt: '2026-09-30T12:00:00Z'
        };
        store.set('client-match', { ...freshDoc });

        const fingerprint = computeCanonicalDocHash(freshDoc);

        const res = await request(app)
            .post('/api/migration/admin-record')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-test-role', 'admin')
            .send({
                collection: 'clients',
                action: 'replace',
                record: { id: 'client-match', name: 'Klient Match Nowy', phone: '555-555', updatedAt: '2026-09-30T12:01:00Z' },
                expectedUpdatedAt: '2026-09-30T12:00:00Z',
                expectedFingerprint: fingerprint
            });

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(store.get('client-match').name, 'Klient Match Nowy');
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
