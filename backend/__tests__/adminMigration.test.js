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

test('POST /api/migration/admin-record: Administrative migration with mandatory CAS and atomic replacement', async (t) => {
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
        updateOne: async (filter, update) => {
            const existing = store.get(filter.id);
            if (!existing) {
                return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
            }
            if (update.$set) {
                Object.assign(existing, update.$set);
            }
            return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
        },
        replaceOne: async (filter, doc, options) => {
            const existing = store.get(filter.id);
            if (!existing) {
                return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
            }
            // Check all filter conditions atomically (matches id, updatedAt, _fingerprint, or field matches)
            for (const [k, v] of Object.entries(filter)) {
                if (existing[k] !== v) {
                    return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
                }
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
                record: { id: 'client-1', name: 'Firma ABC Nowa' },
                expectedUpdatedAt: '2026-09-30T15:00:00Z'
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
                    record: { id: 'test-1', name: 'Test' },
                    expectedUpdatedAt: '2026-09-30T15:00:00Z'
                });

            assert.strictEqual(res.status, 400, `Collection '${col}' must be rejected`);
            assert.match(res.body.error, /Niedozwolona lub nieobsługiwana kolekcja migracji/);
        }
    });

    await t.test('action=replace rejects requests without CAS parameters with 400 Bad Request', async () => {
        const res = await request(app)
            .post('/api/migration/admin-record')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-test-role', 'admin')
            .send({
                collection: 'clients',
                action: 'replace',
                record: { id: 'client-1', name: 'Firma ABC Bez CAS' }
                // Omitting expectedFingerprint and expectedUpdatedAt
            });

        assert.strictEqual(res.status, 400);
        assert.strictEqual(res.body.code, 'CAS_PARAMETERS_REQUIRED');
        assert.match(res.body.error, /parametrów kontroli wersji CAS/);
    });

    await t.test('action=replace detects race condition for document WITHOUT updatedAt and returns 409', async () => {
        // Document without updatedAt (legacy document)
        const legacyDoc = {
            id: 'client-no-updated-at',
            name: 'Klient Bez Daty',
            phone: '111-222-333'
        };
        store.set('client-no-updated-at', { ...legacyDoc });

        // Preview took fingerprint of the original document
        const previewFingerprint = computeCanonicalDocHash(legacyDoc);

        // Concurrent modification mutated phone before replace executes
        store.get('client-no-updated-at').phone = '999-888-777';

        // Client attempts replace with approved fingerprint
        const res = await request(app)
            .post('/api/migration/admin-record')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-test-role', 'admin')
            .send({
                collection: 'clients',
                action: 'replace',
                record: { id: 'client-no-updated-at', name: 'Klient Zastąpiony', phone: '111-222-333' },
                expectedFingerprint: previewFingerprint
            });

        assert.strictEqual(res.status, 409);
        assert.strictEqual(res.body.code, 'CONCURRENT_MODIFICATION');
        assert.match(res.body.error, /Wykryto zmianę dokumentu|Współbieżna modyfikacja/);
    });

    await t.test('action=replace detects concurrent modification (race condition) for document WITH updatedAt and returns 409', async () => {
        store.set('client-race', {
            id: 'client-race',
            name: 'Klient Race Oryginalny',
            updatedAt: '2026-09-30T10:00:00Z'
        });

        // Concurrent modification bumped updatedAt
        store.get('client-race').updatedAt = '2026-09-30T10:05:00Z';

        // Migration client attempts replace with stale expectedUpdatedAt
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

    await t.test('action=replace allows multiple consecutive valid preview -> replace cycles for the same document without false 409', async () => {
        // Initial state of document
        const initialDoc = {
            id: 'client-multi-cycle',
            name: 'Wersja 1',
            phone: '111-111',
            updatedAt: '2026-09-30T10:00:00Z'
        };
        store.set('client-multi-cycle', { ...initialDoc });

        // --- Cycle 1: preview -> replace ---
        const fp1 = computeCanonicalDocHash(store.get('client-multi-cycle'));
        const res1 = await request(app)
            .post('/api/migration/admin-record')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-test-role', 'admin')
            .send({
                collection: 'clients',
                action: 'replace',
                record: { id: 'client-multi-cycle', name: 'Wersja 2', phone: '222-222', updatedAt: '2026-09-30T10:01:00Z' },
                expectedUpdatedAt: '2026-09-30T10:00:00Z',
                expectedFingerprint: fp1
            });

        assert.strictEqual(res1.status, 200);
        assert.strictEqual(res1.body.success, true);
        const saved1 = store.get('client-multi-cycle');
        assert.strictEqual(saved1.name, 'Wersja 2');
        assert.strictEqual(saved1._fingerprint, undefined, 'Document in MongoDB should NOT persist _fingerprint');

        // --- Cycle 2: next preview -> replace on the document ---
        // Preview computes canonical hash of the current document in DB
        const fp2 = computeCanonicalDocHash(saved1);

        const res2 = await request(app)
            .post('/api/migration/admin-record')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-test-role', 'admin')
            .send({
                collection: 'clients',
                action: 'replace',
                record: { id: 'client-multi-cycle', name: 'Wersja 3', phone: '333-333', updatedAt: '2026-09-30T10:02:00Z' },
                expectedUpdatedAt: '2026-09-30T10:01:00Z',
                expectedFingerprint: fp2
            });

        assert.strictEqual(res2.status, 200, 'Subsequent CAS cycle must NOT fail with false 409');
        assert.strictEqual(res2.body.success, true);
        const saved2 = store.get('client-multi-cycle');
        assert.strictEqual(saved2.name, 'Wersja 3');
        assert.strictEqual(saved2.phone, '333-333');

        // --- Cycle 3: another consecutive replace ---
        const fp3 = computeCanonicalDocHash(saved2);
        const res3 = await request(app)
            .post('/api/migration/admin-record')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-test-role', 'admin')
            .send({
                collection: 'clients',
                action: 'replace',
                record: { id: 'client-multi-cycle', name: 'Wersja 4 (Final)', phone: '444-444', updatedAt: '2026-09-30T10:03:00Z' },
                expectedUpdatedAt: '2026-09-30T10:02:00Z',
                expectedFingerprint: fp3
            });

        assert.strictEqual(res3.status, 200, 'Cycle 3 must succeed smoothly');
        assert.strictEqual(store.get('client-multi-cycle').name, 'Wersja 4 (Final)');
    });

    
    await t.test('migracja -> zwykly PATCH rekordu -> nowy podglad -> kolejna migracja succeeds without false 409', async () => {
        // Initial state of document
        const initialDoc = {
            id: 'client-patch-cycle',
            name: 'Klient v1',
            phone: '111-111-111',
            updatedAt: '2026-09-30T10:00:00Z'
        };
        store.set('client-patch-cycle', { ...initialDoc });

        // 1. Migracja (replace)
        const fp1 = computeCanonicalDocHash(store.get('client-patch-cycle'));
        const resMigrate1 = await request(app)
            .post('/api/migration/admin-record')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-test-role', 'admin')
            .send({
                collection: 'clients',
                action: 'replace',
                record: { id: 'client-patch-cycle', name: 'Klient v2 po migracji', phone: '222-222-222', updatedAt: '2026-09-30T10:01:00Z' },
                expectedUpdatedAt: '2026-09-30T10:00:00Z',
                expectedFingerprint: fp1
            });

        assert.strictEqual(resMigrate1.status, 200);
        assert.strictEqual(resMigrate1.body.success, true);
        const docAfterMigrate1 = store.get('client-patch-cycle');
        assert.strictEqual(docAfterMigrate1.name, 'Klient v2 po migracji');
        assert.strictEqual(docAfterMigrate1._fingerprint, undefined, 'No persistent _fingerprint in doc');

        // 2. Zwykly PATCH rekordu (standardowa edycja przez UI / API)
        const resPatch = await request(app)
            .patch('/api/clients/client-patch-cycle')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-test-role', 'admin')
            .send({
                phone: '333-zwykly-patch'
            });

        assert.strictEqual(resPatch.status, 200);
        const docAfterPatch = store.get('client-patch-cycle');
        assert.strictEqual(docAfterPatch.phone, '333-zwykly-patch');
        assert.notStrictEqual(docAfterPatch.updatedAt, '2026-09-30T10:01:00Z', 'PATCH bumped updatedAt');

        // 3. Nowy podglad migracji (obliczenie fingerprintu ze stanu po zwyklym PATCH)
        const fp2 = computeCanonicalDocHash(docAfterPatch);
        const currentUpdatedAt = docAfterPatch.updatedAt;

        // 4. Kolejna migracja tego samego dokumentu
        const resMigrate2 = await request(app)
            .post('/api/migration/admin-record')
            .set('Authorization', `Bearer ${adminToken}`)
            .set('x-test-role', 'admin')
            .send({
                collection: 'clients',
                action: 'replace',
                record: { id: 'client-patch-cycle', name: 'Klient v3 ostateczny', phone: '444-final', updatedAt: '2026-09-30T10:10:00Z' },
                expectedUpdatedAt: currentUpdatedAt,
                expectedFingerprint: fp2
            });

        assert.strictEqual(resMigrate2.status, 200, 'Second migration after standard PATCH must succeed without false 409');
        assert.strictEqual(resMigrate2.body.success, true);
        const finalDoc = store.get('client-patch-cycle');
        assert.strictEqual(finalDoc.name, 'Klient v3 ostateczny');
        assert.strictEqual(finalDoc.phone, '444-final');
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
