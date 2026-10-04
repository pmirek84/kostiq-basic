process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { execSync } = require('child_process');
const path = require('path');

const {
    app,
    setDb,
    OFFER_RECORD_KINDS,
    OFFER_STATUSES,
    OFFER_VAT_RATES,
    OFFER_DISCOUNT_TYPES,
    validateOfferPostSchema,
    validateOfferPatchSchema,
    validateOfferBatchSchema,
    validateOfferSchema,
    syncOfferCountersFromExistingData,
    generateOfferNumber,
    setTestFailpoint
} = require('../server');

const { offerSchema } = require('../../shared/contracts/index.cjs');

const adminToken = jwt.sign(
    { id: 'admin-1', role: 'admin', email: 'admin@kostiq.pl' },
    'test-secret',
    { expiresIn: '1h' }
);

test('Shared Contracts: Offer JSON Schema, Domain Hardening, Atomic Numbering and Concurrency', async (t) => {
    const offersStore = new Map();
    const constructionsStore = new Map();
    const countersStore = new Map();
    const idempotencyStore = new Map();
    const employeesStore = new Map([
        ['admin-1', { id: 'admin-1', email: 'admin@kostiq.pl', role: 'admin', isActive: true }]
    ]);

    const mockOffersColl = {
        countDocuments: async () => offersStore.size,
        findOne: async (filter) => {
            const id = filter.id || (filter.$or ? filter.$or[0].id : null);
            if (id) {
                const doc = offersStore.get(id);
                if (!doc) return null;
                if (filter.isActive !== undefined && doc.isActive !== filter.isActive) return null;
                if (filter.editVersion !== undefined && doc.editVersion !== filter.editVersion) return null;
                return { ...doc };
            }
            if (filter.number) {
                for (const o of offersStore.values()) {
                    if (o.number === filter.number) return { ...o };
                }
            }
            return null;
        },
        find: (filter = {}) => ({
            toArray: async () => {
                let results = Array.from(offersStore.values()).map(o => ({ ...o }));
                if (filter.recordKind) results = results.filter(r => r.recordKind === filter.recordKind);
                if (filter.number && filter.number.$type === 'string') {
                    results = results.filter(r => typeof r.number === 'string');
                }
                return results;
            }
        }),
        insertOne: async (doc) => {
            if (offersStore.has(doc.id)) {
                const err = new Error(`E11000 duplicate key error collection: offers index: id_1 dup key: { id: "${doc.id}" }`);
                err.code = 11000;
                throw err;
            }
            for (const existing of offersStore.values()) {
                if (existing.number && existing.number === doc.number) {
                    const err = new Error(`E11000 duplicate key error collection: offers index: number_1 dup key: { number: "${doc.number}" }`);
                    err.code = 11000;
                    throw err;
                }
            }
            offersStore.set(doc.id, { ...doc });
            return { insertedId: doc.id };
        },
        updateOne: async (filter, update) => {
            const id = filter.id;
            const doc = offersStore.get(id);
            if (!doc) return { matchedCount: 0, modifiedCount: 0 };
            if (filter.editVersion !== undefined && doc.editVersion !== filter.editVersion) {
                return { matchedCount: 0, modifiedCount: 0 };
            }
            if (filter.isActive !== undefined && filter.isActive.$ne !== undefined) {
                if (doc.isActive === filter.isActive.$ne) return { matchedCount: 0, modifiedCount: 0 };
            }
            const updated = { ...doc };
            if (update.$set) Object.assign(updated, update.$set);
            if (update.$inc) {
                for (const [k, v] of Object.entries(update.$inc)) {
                    updated[k] = (updated[k] || 0) + v;
                }
            }
            offersStore.set(id, updated);
            return { matchedCount: 1, modifiedCount: 1 };
        },
        bulkWrite: async (ops) => {
            const snapshot = new Map(offersStore);
            let insertedCount = 0;
            let modifiedCount = 0;
            let upsertedCount = 0;
            const writeErrors = [];

            for (let i = 0; i < ops.length; i++) {
                const op = ops[i];
                if (op.insertOne) {
                    const doc = op.insertOne.document;
                    if (offersStore.has(doc.id)) {
                        writeErrors.push({
                            index: i,
                            code: 11000,
                            errmsg: `E11000 duplicate key error collection: offers index: id_1 dup key: { id: "${doc.id}" }`
                        });
                    }
                    if (doc.number) {
                        for (const [existingId, o] of offersStore.entries()) {
                            if (existingId !== doc.id && o.number === doc.number) {
                                writeErrors.push({
                                    index: i,
                                    code: 11000,
                                    errmsg: `E11000 duplicate key error collection: offers index: number_1 dup key: { number: "${doc.number}" }`
                                });
                                break;
                            }
                        }
                    }
                    if (writeErrors.length === 0) {
                        offersStore.set(doc.id, { ...doc });
                        insertedCount++;
                    }
                } else if (op.updateOne) {
                    const id = op.updateOne.filter.id;
                    const doc = op.updateOne.update.$set;
                    // Check duplicate number unique index constraint
                    if (doc.number) {
                        for (const [existingId, o] of offersStore.entries()) {
                            if (existingId !== id && o.number === doc.number) {
                                writeErrors.push({
                                    index: i,
                                    code: 11000,
                                    errmsg: `E11000 duplicate key error collection: offers index: number_1 dup key: { number: "${doc.number}" }`
                                });
                                break;
                            }
                        }
                    }
                    if (writeErrors.length === 0) {
                        offersStore.set(id, { ...(offersStore.get(id) || {}), ...doc });
                        upsertedCount++;
                    }
                }
            }

            if (writeErrors.length > 0) {
                // Rollback simulation in transaction
                offersStore.clear();
                for (const [k, v] of snapshot) offersStore.set(k, v);
                const bulkErr = new Error('E11000 duplicate key error');
                bulkErr.code = 11000;
                bulkErr.writeErrors = writeErrors;
                throw bulkErr;
            }
            return { insertedCount, modifiedCount, upsertedCount, matchedCount: upsertedCount };
        }
    };

    const mockCountersColl = {
        findOneAndUpdate: async (filter, update, opts = {}) => {
            const id = filter._id;
            const cur = countersStore.get(id) || { _id: id, seq: 0 };
            if (update.$inc) {
                cur.seq = (cur.seq || 0) + (update.$inc.seq || 1);
            }
            if (update.$max && update.$max.seq > cur.seq) {
                cur.seq = update.$max.seq;
            }
            countersStore.set(id, cur);
            return { value: { ...cur } };
        },
        findOne: async (filter) => {
            const doc = countersStore.get(filter._id);
            return doc ? { ...doc } : null;
        },
        updateOne: async (filter, update) => {
            const id = filter._id;
            const cur = countersStore.get(id) || { _id: id, seq: 0 };
            if (update.$max && update.$max.seq !== undefined) {
                if (update.$max.seq > cur.seq) cur.seq = update.$max.seq;
            }
            if (update.$set) Object.assign(cur, update.$set);
            countersStore.set(id, cur);
            return { matchedCount: 1, modifiedCount: 1 };
        }
    };

    const mockIdempotencyColl = {
        insertOne: async (doc) => {
            const key = `${doc.endpoint}:${doc.key}`;
            if (idempotencyStore.has(key)) {
                const err = new Error(`E11000 duplicate key error collection: idempotency_keys dup key: ${key}`);
                err.code = 11000;
                throw err;
            }
            idempotencyStore.set(key, { ...doc });
            return { insertedId: key };
        },
        findOne: async (filter) => {
            const key = `${filter.endpoint}:${filter.key}`;
            const doc = idempotencyStore.get(key);
            return doc ? { ...doc } : null;
        },
        updateOne: async (filter, update) => {
            const key = `${filter.endpoint}:${filter.key}`;
            const doc = idempotencyStore.get(key);
            if (!doc) return { matchedCount: 0, modifiedCount: 0 };
            if (update.$set) Object.assign(doc, update.$set);
            idempotencyStore.set(key, doc);
            return { matchedCount: 1, modifiedCount: 1 };
        }
    };

    const mockConstructionsColl = {
        insertOne: async (doc) => {
            constructionsStore.set(doc.id, { ...doc });
            return { insertedId: doc.id };
        },
        find: () => ({ toArray: async () => Array.from(constructionsStore.values()) })
    };

    const mockDb = {
        collection: (name) => {
            if (name === 'offers') return mockOffersColl;
            if (name === 'counters') return mockCountersColl;
            if (name === 'idempotency_keys') return mockIdempotencyColl;
            if (name === 'constructions') return mockConstructionsColl;
            if (name === 'employees') {
                return {
                    findOne: async (filter) => {
                        const id = filter.id || (filter.$or ? filter.$or[0].id : null);
                        return employeesStore.get(id) || employeesStore.get('admin-1') || null;
                    }
                };
            }
            return {
                find: () => ({ toArray: async () => [] }),
                findOne: async () => null,
                insertOne: async () => ({ insertedId: 'mock' }),
                updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 })
            };
        }
    };

    setDb(mockDb, true);

    await t.test('1. Contract Enums: verifies canonical Offer statuses, recordKinds, vat rates and discount types', () => {
        assert.deepStrictEqual([...OFFER_RECORD_KINDS], ['offer', 'template']);
        assert.deepStrictEqual([...OFFER_STATUSES], ['draft', 'sent', 'accepted', 'rejected', 'converted', 'archived']);
        assert.deepStrictEqual([...OFFER_VAT_RATES], [0, 8, 23]);
        assert.deepStrictEqual([...OFFER_DISCOUNT_TYPES], ['none', 'percent', 'amount']);
    });

    await t.test('2. Ajv Schema Validation: validateOfferPostSchema rejects invalid recordKind, forged version or expectedVersion', () => {
        // Valid payload
        const validPayload = {
            clientId: 'client-1',
            location: 'Warszawa, ul. Złota 44',
            status: 'draft',
            totalNet: 15000,
            vatRate: 23,
            recordKind: 'offer'
        };
        const validResult = validateOfferPostSchema(validPayload);
        assert.strictEqual(validResult, true, 'Valid payload must satisfy schema');

        // Invalid recordKind
        const invalidKind = { ...validPayload, recordKind: 'invalid_kind' };
        assert.strictEqual(validateOfferPostSchema(invalidKind), false);

        // editVersion injection in POST strictly rejected
        const withVersion = { ...validPayload, editVersion: 5 };
        assert.strictEqual(validateOfferPostSchema(withVersion), false);

        // expectedVersion injection in POST strictly rejected
        const withExpectedVersion = { ...validPayload, expectedVersion: 1 };
        assert.strictEqual(validateOfferPostSchema(withExpectedVersion), false);
    });

    await t.test('3. Ajv Schema Validation: validateOfferPatchSchema requires expectedVersion, forbids number and recordKind mutation', () => {
        // Missing expectedVersion -> fails
        const missingExp = { totalNet: 20000 };
        assert.strictEqual(validateOfferPatchSchema(missingExp), false);

        // Valid patch
        const validPatch = { totalNet: 20000, expectedVersion: 1 };
        assert.strictEqual(validateOfferPatchSchema(validPatch), true);

        // Mutating number forbidden
        const mutNumber = { number: 'OF/2026/999', expectedVersion: 1 };
        assert.strictEqual(validateOfferPatchSchema(mutNumber), false);

        // Mutating recordKind forbidden
        const mutKind = { recordKind: 'template', expectedVersion: 1 };
        assert.strictEqual(validateOfferPatchSchema(mutKind), false);

        // Mutating editVersion directly forbidden
        const mutVersion = { editVersion: 2, expectedVersion: 1 };
        assert.strictEqual(validateOfferPatchSchema(mutVersion), false);
    });

    await t.test('4. Atomic Offer Creation: POST /api/offers generates canonical OF/YYYY/NNN with zero-padded sequence and sets editVersion: 1', async () => {
        const res = await request(app)
            .post('/api/offers')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'offer-create-ik-1')
            .send({
                clientId: 'client-test',
                location: 'Gdańsk, ul. Długa 1',
                status: 'draft',
                totalNet: 12500,
                vatRate: 23
            });

        assert.strictEqual(res.status, 201);
        assert.ok(res.body.id);
        const year = new Date().getFullYear();
        assert.match(res.body.number, new RegExp(`^OF/${year}/\\d{3}$`));
        assert.strictEqual(res.body.recordKind, 'offer');
        assert.strictEqual(res.body.editVersion, 1);
        assert.strictEqual(res.body.isActive, true);

        // Check counter doc
        const counter = await mockCountersColl.findOne({ _id: `offer_${year}` });
        assert.ok(counter);
        assert.ok(counter.seq >= 1);
    });

    await t.test('5. Atomic Template Creation: POST /api/offers with recordKind: template generates TPL-YYYY-NNN', async () => {
        const res = await request(app)
            .post('/api/offers')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'tpl-create-ik-1')
            .send({
                recordKind: 'template',
                title: 'Wzór Standardowy Okna',
                status: 'draft',
                offerTemplateType: 'detailed'
            });

        assert.strictEqual(res.status, 201);
        const year = new Date().getFullYear();
        assert.match(res.body.number, new RegExp(`^TPL-${year}/\\d{3}$` | `^TPL-${year}-\\d{3}$`));
        assert.strictEqual(res.body.recordKind, 'template');
        assert.strictEqual(res.body.editVersion, 1);
    });

    await t.test('6. Idempotency Key deduplication: identical replay returns cached response without duplicate creation', async () => {
        const res1 = await request(app)
            .post('/api/offers')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'offer-ik-replay-test')
            .send({
                clientId: 'client-replay',
                location: 'Kraków',
                status: 'draft',
                totalNet: 5000
            });

        assert.strictEqual(res1.status, 201);
        const initialNumber = res1.body.number;

        // Replay with identical payload
        const res2 = await request(app)
            .post('/api/offers')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'offer-ik-replay-test')
            .send({
                clientId: 'client-replay',
                location: 'Kraków',
                status: 'draft',
                totalNet: 5000
            });

        assert.strictEqual(res2.status, 201);
        assert.strictEqual(res2.body.id, res1.body.id);
        assert.strictEqual(res2.body.number, initialNumber);

        // Replay with DIFFERENT payload -> 409 Conflict
        const res3 = await request(app)
            .post('/api/offers')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'offer-ik-replay-test')
            .send({
                clientId: 'client-tampered',
                location: 'Wrocław'
            });

        assert.strictEqual(res3.status, 409);
        assert.match(res3.body.error, /Klucz idempotencji został już użyty/i);
    });

    await t.test('7. CAS Concurrency on PATCH /api/offers/:id: requires expectedVersion (428), rejects stale version (409), increments version on match', async () => {
        const offerId = 'offer-cas-test-1';
        offersStore.set(offerId, {
            id: offerId,
            number: 'OF/2026/010',
            recordKind: 'offer',
            clientId: 'client-cas',
            location: 'Poznań',
            status: 'draft',
            totalNet: 10000,
            editVersion: 1,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        // 1. Missing expectedVersion -> 428 PRECONDITION_REQUIRED
        const resMissing = await request(app)
            .patch(`/api/offers/${offerId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ location: 'Poznań Nowy Adres' });

        assert.strictEqual(resMissing.status, 428);
        assert.strictEqual(resMissing.body.code, 'PRECONDITION_REQUIRED');

        // 2. Stale expectedVersion -> 409 VERSION_CONFLICT
        const resStale = await request(app)
            .patch(`/api/offers/${offerId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ location: 'Poznań Nowy Adres', expectedVersion: 99 });

        assert.strictEqual(resStale.status, 409);
        assert.strictEqual(resStale.body.code, 'VERSION_CONFLICT');

        // 3. Matching expectedVersion -> 200 and editVersion incremented to 2
        const resMatch = await request(app)
            .patch(`/api/offers/${offerId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ location: 'Poznań Poprawny Adres', expectedVersion: 1 });

        assert.strictEqual(resMatch.status, 200);
        assert.strictEqual(resMatch.body.editVersion, 2);
        assert.strictEqual(resMatch.body.location, 'Poznań Poprawny Adres');

        // 4. Stale previous version (1) now fails
        const resNowStale = await request(app)
            .patch(`/api/offers/${offerId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ location: 'Próba z wersji 1', expectedVersion: 1 });

        assert.strictEqual(resNowStale.status, 409);
    });

    await t.test('8. CAS Concurrency on DELETE /api/offers/:id: requires expectedVersion (428), rejects stale (409), soft-deletes and increments version', async () => {
        const offerId = 'offer-cas-del-1';
        offersStore.set(offerId, {
            id: offerId,
            number: 'OF/2026/020',
            recordKind: 'offer',
            clientId: 'client-del',
            status: 'draft',
            editVersion: 2,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        // 1. Missing expectedVersion -> 428
        const resMissing = await request(app)
            .delete(`/api/offers/${offerId}`)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(resMissing.status, 428);

        // 2. Stale expectedVersion -> 409
        const resStale = await request(app)
            .delete(`/api/offers/${offerId}?expectedVersion=1`)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(resStale.status, 409);

        // 3. Matching expectedVersion -> 200, archived, editVersion: 3
        const resMatch = await request(app)
            .delete(`/api/offers/${offerId}?expectedVersion=2`)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(resMatch.status, 200);
        assert.strictEqual(resMatch.body.editVersion, 3);
        const inDb = offersStore.get(offerId);
        assert.strictEqual(inDb.isActive, false);

        // 4. Second delete returns 404 already archived
        const resSecond = await request(app)
            .delete(`/api/offers/${offerId}?expectedVersion=3`)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(resSecond.status, 404);
        assert.match(resSecond.body.error, /została już zarchiwizowana/i);
    });

    await t.test('9. Counter Synchronization parses canonical OF/YYYY/NNN and historical formats (OF/2026/05 and 01/2025)', async () => {
        const testOffers = [
            { id: 'o-hist-1', number: 'OF/2026/05', recordKind: 'offer' },
            { id: 'o-canon-1', number: 'OF/2026/006', recordKind: 'offer' },
            { id: 'o-hist-2', number: '01/2025', recordKind: 'offer' },
            { id: 'o-hist-3', number: '03/2025 (kopia)', recordKind: 'offer' },
            { id: 'o-tpl-1', number: 'WZÓR-STD-01', recordKind: 'template' }
        ];

        const testDb = {
            collection: (name) => {
                if (name === 'offers') {
                    return {
                        find: () => ({ toArray: async () => testOffers })
                    };
                }
                if (name === 'counters') return mockCountersColl;
            }
        };

        await syncOfferCountersFromExistingData(testDb);

        const counter2026 = await mockCountersColl.findOne({ _id: 'offer_2026' });
        assert.ok(counter2026);
        assert.strictEqual(counter2026.seq, 6, 'Counter for 2026 must be at least 6 from OF/2026/006 and OF/2026/05');

        const counter2025 = await mockCountersColl.findOne({ _id: 'offer_2025' });
        assert.ok(counter2025);
        assert.strictEqual(counter2025.seq, 3, 'Counter for 2025 must be 3 from historical 03/2025 (kopia)');
    });

    await t.test('10. Automated generation guard: verifies offer.generated.ts is strictly up to date with offer.schema.json', () => {
        const result = execSync('node scripts/generate-contracts.cjs --check', {
            cwd: path.resolve(__dirname, '../..'),
            encoding: 'utf8'
        });
        assert.ok(result.includes('Generated contracts are strictly up to date'));
    });

    await t.test('11. PATCH immutability: attempting to mutate number or recordKind returns 400', async () => {
        const offerId = 'offer-mut-test-1';
        offersStore.set(offerId, {
            id: offerId,
            number: 'OF/2026/050',
            recordKind: 'offer',
            clientId: 'client-mut',
            editVersion: 1,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });

        // Attempting to change number
        const resNum = await request(app)
            .patch(`/api/offers/${offerId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ number: 'OF/2026/999', expectedVersion: 1 });

        assert.strictEqual(resNum.status, 400);
        assert.match(resNum.body.error, /Modyfikacja numeru oferty jest zabroniona/i);

        // Attempting to change recordKind
        const resKind = await request(app)
            .patch(`/api/offers/${offerId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ recordKind: 'template', expectedVersion: 1 });

        assert.strictEqual(resKind.status, 400);
        assert.match(resKind.body.error, /Modyfikacja typu rekordu/i);
    });

    await t.test('12. POST /api/offers/create-atomic: transactional creation with child constructions', async () => {
        const offerId = 'offer-with-constr-1';
        const res = await request(app)
            .post('/api/offers/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'atomic-offer-constr-ik-1')
            .send({
                id: offerId,
                clientId: 'client-atomic',
                location: 'Sopot, ul. Bohaterów Monte Cassino',
                status: 'draft',
                totalNet: 45000,
                constructions: [
                    { id: 'c-1', name: 'Okno Fix', width: 2000, height: 1500, quantity: 2, totalNet: 10000 },
                    { id: 'c-2', name: 'Drzwi HST', width: 3000, height: 2300, quantity: 1, totalNet: 35000 }
                ]
            });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.status, 'success');
        assert.strictEqual(res.body.offer.id, offerId);
        assert.match(res.body.offer.number, /^OF\/\d{4}\/\d{3}$/);
        assert.strictEqual(res.body.constructions.length, 2);
        assert.strictEqual(res.body.constructions[0].offerId, offerId);
        assert.strictEqual(res.body.constructions[1].offerId, offerId);
    });

    await t.test('13. Production fail-closed: POST /api/offers returns 503 when transactions are required and replica set is unavailable', async () => {
        const oldEnv = process.env.NODE_ENV;
        const oldAllow = process.env.ALLOW_NON_TRANSACTIONAL;
        process.env.NODE_ENV = 'production';
        delete process.env.ALLOW_NON_TRANSACTIONAL;

        setDb(mockDb, true, null, false);
        try {
            const res = await request(app)
                .post('/api/offers')
                .set('Authorization', 'Bearer ' + adminToken)
                .send({ clientId: 'c-prod', location: 'X', status: 'draft' });

            assert.strictEqual(res.status, 503);
            assert.strictEqual(res.body.code, 'TRANSACTIONS_REQUIRED');
        } finally {
            process.env.NODE_ENV = oldEnv;
            if (oldAllow) process.env.ALLOW_NON_TRANSACTIONAL = oldAllow;
            setDb(mockDb, true);
        }
    });

    await t.test('14. Production fail-closed: POST /api/offers/batch-import returns 503 when replica set is unavailable', async () => {
        const oldEnv = process.env.NODE_ENV;
        const oldAllow = process.env.ALLOW_NON_TRANSACTIONAL;
        process.env.NODE_ENV = 'production';
        delete process.env.ALLOW_NON_TRANSACTIONAL;

        setDb(mockDb, true, null, false);
        try {
            const res = await request(app)
                .post('/api/offers/batch-import')
                .set('Authorization', 'Bearer ' + adminToken)
                .send({ items: [{ id: 'off-1', number: 'OF/2026/001', recordKind: 'offer', status: 'draft' }] });

            assert.strictEqual(res.status, 503);
            assert.strictEqual(res.body.code, 'TRANSACTIONS_REQUIRED');
        } finally {
            process.env.NODE_ENV = oldEnv;
            if (oldAllow) process.env.ALLOW_NON_TRANSACTIONAL = oldAllow;
            setDb(mockDb, true);
        }
    });

    await t.test('15. All-or-nothing rollback on batch-import: conflict triggers 409 BATCH_IMPORT_VERSION_CONFLICT with succeeded: 0', async () => {
        offersStore.set('existing-off-1', {
            id: 'existing-off-1',
            number: 'OF/2026/088',
            recordKind: 'offer',
            editVersion: 1
        });

        const res = await request(app)
            .post('/api/offers/batch-import')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                items: [
                    { id: 'new-off-1', number: 'OF/2026/089', recordKind: 'offer', status: 'draft' },
                    { id: 'conflict-off-2', number: 'OF/2026/088', recordKind: 'offer', status: 'draft' }
                ]
            });

        assert.strictEqual(res.status, 409);
        assert.strictEqual(res.body.code, 'BATCH_IMPORT_VERSION_CONFLICT');
        assert.strictEqual(res.body.status, 'failed');
        assert.strictEqual(res.body.succeeded, 0);
    });
    await t.test('16. POST /api/offers rejects custom offer number with 400 Bad Request', async () => {
        const res = await request(app)
            .post('/api/offers')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                number: 'CUSTOM/2026/999',
                clientId: 'client-1',
                title: 'Custom Number Test'
            });

        assert.strictEqual(res.status, 400);
        assert.ok(res.body.error.includes('Podawanie własnego numeru oferty jest zabronione'));
    });

    await t.test('17. Template creation uses template_YYYY counter and TPL-YYYY-NNN format without touching offer_YYYY counter', async () => {
        countersStore.set('offer_2026', { _id: 'offer_2026', seq: 10 });
        countersStore.set('template_2026', { _id: 'template_2026', seq: 3 });

        const res = await request(app)
            .post('/api/offers/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                recordKind: 'template',
                title: 'Szablon Okien Standard',
                offerTemplateType: 'standard'
            });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.offer.recordKind, 'template');
        assert.strictEqual(res.body.offer.number, 'TPL-2026-004');

        // offer_2026 counter must NOT have been incremented!
        const offerCounter = countersStore.get('offer_2026');
        assert.strictEqual(offerCounter.seq, 10, 'offer_2026 counter must remain at 10');

        const tplCounter = countersStore.get('template_2026');
        assert.strictEqual(tplCounter.seq, 4, 'template_2026 counter must be incremented to 4');
    });

    await t.test('18. Idempotency canonicalJsonStringify: payload with same fields in different key order returns cached 201 response', async () => {
        const idempKey = 'key-keyorder-test-' + Date.now();

        // First request with keys: title, clientId
        const res1 = await request(app)
            .post('/api/offers/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send({
                title: 'Oferta Kolejność Kluczy',
                clientId: 'client-1'
            });

        assert.strictEqual(res1.status, 201);
        const createdNumber = res1.body.offer.number;

        // Second request with same logical data but inverted keys: clientId, title
        const res2 = await request(app)
            .post('/api/offers/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send({
                clientId: 'client-1',
                title: 'Oferta Kolejność Kluczy'
            });

        assert.strictEqual(res2.status, 201);
        assert.strictEqual(res2.body.offer.number, createdNumber, 'Must return the exact same cached offer');
    });
    await t.test('19. vatRate: 0 is strictly preserved and not coerced to 23', async () => {
        const res = await request(app)
            .post('/api/offers/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                title: 'Oferta Stawka 0% VAT',
                clientId: 'client-1',
                vatRate: 0
            });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.offer.vatRate, 0, 'vatRate 0 must NOT be coerced to 23');
    });

    await t.test('20. POST /api/offers/batch-import validates schema and rejects invalid status, negative amounts, or invalid recordKind', async () => {
        // Invalid status in batch
        const res1 = await request(app)
            .post('/api/offers/batch-import')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                items: [
                    { id: 'off-inv-status', title: 'Zły status', recordKind: 'offer', status: 'unknown_status' }
                ]
            });
        assert.strictEqual(res1.status, 400);

        // Negative financial amount in batch
        const res2 = await request(app)
            .post('/api/offers/batch-import')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                items: [
                    { id: 'off-neg-cost', title: 'Ujemny koszt', recordKind: 'offer', status: 'draft', materialsCost: -50 }
                ]
            });
        assert.strictEqual(res2.status, 400);
        assert.ok(res2.body.error.includes('materialsCost'));

        // Invalid recordKind in batch
        const res3 = await request(app)
            .post('/api/offers/batch-import')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                items: [
                    { id: 'off-inv-kind', title: 'Zły kind', recordKind: 'invalid_kind', status: 'draft' }
                ]
            });
        assert.strictEqual(res3.status, 400);
    });

    await t.test('21. Template deduplication rejects deletion when child constructions graph or status differs from primary', async () => {
        const { migrateOfferDomainAndReconcileConflicts } = require('../server');

        const mockTargetDb = {
            collection: (name) => {
                if (name === '_migrations') return { findOne: async () => null };
                if (name === 'offers') {
                    return {
                        find: (q) => ({
                            toArray: async () => {
                                if (q && q.number === 'WZÓR-STD-01') {
                                    return [
                                        { id: 'tpl-primary', number: 'WZÓR-STD-01', recordKind: 'template', status: 'draft', title: 'Szablon 1' },
                                        { id: 'tpl-dup-diff', number: 'WZÓR-STD-01', recordKind: 'template', status: 'draft', title: 'Szablon 1' }
                                    ];
                                }
                                return [];
                            }
                        })
                    };
                }
                if (name === 'constructions') {
                    return {
                        find: (q) => ({
                            toArray: async () => {
                                if (q.offerId === 'tpl-primary') {
                                    return [{ id: 'c1', name: 'Konstrukcja A', width: 1000 }];
                                }
                                if (q.offerId === 'tpl-dup-diff') {
                                    return [{ id: 'c2', name: 'Inna Konstrukcja B', width: 2000 }];
                                }
                                return [];
                            }
                        })
                    };
                }
                return { find: () => ({ toArray: async () => [] }), countDocuments: async () => 0 };
            },
            listCollections: () => ({ toArray: async () => [{ name: 'jobs' }] })
        };

        let threw = false;
        try {
            await migrateOfferDomainAndReconcileConflicts(mockTargetDb, null);
        } catch (err) {
            threw = true;
            assert.ok(err.message.includes('child constructions graph does not match primary template'), 'Must reject different constructions graph');
        }
        assert.strictEqual(threw, true, 'Migration must fail-closed if constructions graph differs');
    });

    await t.test('22. Collision resolution on OF/2026/05 fails closed if exact Budex/Jan IDs are missing', async () => {
        const { migrateOfferDomainAndReconcileConflicts } = require('../server');

        const mockTargetDb = {
            collection: (name) => {
                if (name === '_migrations') return { findOne: async () => null };
                if (name === 'offers') {
                    return {
                        find: (q) => ({
                            toArray: async () => {
                                if (q && q.number === 'OF/2026/05') {
                                    return [
                                        { id: 'some-random-id-1', number: 'OF/2026/05', recordKind: 'offer' },
                                        { id: 'some-random-id-2', number: 'OF/2026/05', recordKind: 'offer' }
                                    ];
                                }
                                return [];
                            }
                        })
                    };
                }
                return { find: () => ({ toArray: async () => [] }), countDocuments: async () => 0 };
            },
            listCollections: () => ({ toArray: async () => [] })
        };

        let threw = false;
        try {
            await migrateOfferDomainAndReconcileConflicts(mockTargetDb, null);
        } catch (err) {
            threw = true;
            assert.ok(err.message.includes('does not match expected IDs'), 'Must reject missing exact Budex/Jan IDs');
        }
        assert.strictEqual(threw, true, 'Migration must fail-closed without guessing IDs');
    });
    await t.test('23. [P1] Direct Ajv validateOfferBatchSchema strictly rejects empty object { items: [{}] }', () => {
        const { validateOfferBatchSchema } = require('../server');
        if (typeof validateOfferBatchSchema === 'function') {
            const emptyItemRes = validateOfferBatchSchema({ items: [{}] });
            assert.strictEqual(emptyItemRes, false, '{ items: [{}] } must be strictly rejected');
            const errors = validateOfferBatchSchema.errors || [];
            const missingProps = errors.map(e => e.params?.missingProperty).filter(Boolean);
            assert.ok(missingProps.includes('id') || missingProps.includes('number') || missingProps.includes('recordKind') || missingProps.includes('status'));

            const validItemRes = validateOfferBatchSchema({
                items: [{
                    id: 'offer-batch-valid-1',
                    number: 'OF/2026/099',
                    recordKind: 'offer',
                    status: 'draft'
                }]
            });
            assert.strictEqual(validItemRes, true, 'Valid batch item with id, number, recordKind, status must pass schema');
        }
    });

    await t.test('24. [P1] POST /api/offers/batch-import rejects empty item {} or missing number/status with 400 Bad Request', async () => {
        const resEmpty = await request(app)
            .post('/api/offers/batch-import')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ items: [{}] });

        assert.strictEqual(resEmpty.status, 400);
        assert.ok(resEmpty.body.error);

        const resMissingNum = await request(app)
            .post('/api/offers/batch-import')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                items: [{
                    id: 'offer-no-num',
                    recordKind: 'offer',
                    status: 'draft'
                }]
            });

        assert.strictEqual(resMissingNum.status, 400);
        assert.ok(resMissingNum.body.error);
    });
    await t.test('25. [P2] validateOfferBatchSchema and batch-import strictly reject unknown/additional properties', async () => {
        const { validateOfferBatchSchema } = require('../server');
        if (typeof validateOfferBatchSchema === 'function') {
            const resUnknown = validateOfferBatchSchema({
                items: [{
                    id: 'offer-unknown-prop',
                    number: 'OF/2026/099',
                    recordKind: 'offer',
                    status: 'draft',
                    unknownFieldLeak: 'forbidden',
                    expectedVersion: 1
                }]
            });
            assert.strictEqual(resUnknown, false, 'Batch item with unknown properties must be strictly rejected');
        }

        const resEndpoint = await request(app)
            .post('/api/offers/batch-import')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                items: [{
                    id: 'offer-unknown-endpoint',
                    number: 'OF/2026/098',
                    recordKind: 'offer',
                    status: 'draft',
                    forbiddenCustomerField: 12345
                }]
            });

        assert.strictEqual(resEndpoint.status, 400);
        assert.ok(resEndpoint.body.error);
    });
});
