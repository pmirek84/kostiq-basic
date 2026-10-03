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
    JOB_STATUSES,
    JOB_STAGE_STATUSES,
    JOB_STAGE_TYPES,
    JOB_BILLING_TYPES,
    JOB_RISK_FLAGS,
    JOB_PRIORITIES,
    validateJobPostSchema,
    validateJobPatchSchema,
    validateJobBatchSchema,
    validateJobPaginatedSchema,
    recalculateJobLaborCosts,
    reconcilePendingJobAggregates,
    setTestBarrierHook,
    setTestFailpoint
} = require('../server');

const { jobSchema } = require('../../shared/contracts/index.cjs');

const adminToken = jwt.sign(
    { id: 'admin-1', role: 'admin', email: 'admin@kostiq.pl' },
    'test-secret',
    { expiresIn: '1h' }
);

const workerToken = jwt.sign(
    { id: 'test-user', role: 'worker', email: 'worker@kostiq.pl' },
    'test-secret',
    { expiresIn: '1h' }
);

test('Shared Contracts: Job JSON Schema, Statuses, Lifecycle and Financial Protection', async (t) => {
    const jobsStore = new Map();
    const clientsStore = new Map([
        ['client-1', { id: 'client-1', company: 'Firma Budowlana S.A.', type: 'company', isActive: true }],
        ['client-2', { id: 'client-2', name: 'Anna', lastName: 'Kowalska', type: 'individual', isActive: true }]
    ]);
    const timeEntriesStore = new Map();
    const settlementsStore = new Map();
    const employeesStore = new Map([
        ['admin-1', { id: 'admin-1', hourlyRate: 50, dailyRate: 400, projectRate: 1500, isActive: true }]
    ]);

    const mockJobsColl = {
        countDocuments: async () => jobsStore.size,
        findOne: async (filter) => {
            const id = filter.$or ? filter.$or[0].id : filter.id;
            const doc = jobsStore.get(id);
            return doc ? { ...doc } : null;
        },
        find: (filter) => {
            let list = Array.from(jobsStore.values());
            if (filter?.$or) {
                list = list.filter(j => {
                    return filter.$or.some(c => {
                        if (c.id) {
                            if (c.id.$in) return c.id.$in.includes(j.id);
                            return c.id === j.id;
                        }
                        const jid = j._id || j.id;
                        if (c._id) {
                            if (c._id.$in) return c._id.$in.includes(jid);
                            return c._id === jid;
                        }
                        if (c.aggregationPending && j.aggregationPending) return true;
                        if (c.status?.$in && c.status.$in.includes(j.status) && c.actualLaborHours?.$gt !== undefined && j.actualLaborHours > c.actualLaborHours.$gt) return true;
                        return false;
                    });
                });
            } else if (filter?.aggregationPending) {
                list = list.filter(j => j.aggregationPending);
            }
            const cursor = {
                skip: () => cursor,
                limit: () => cursor,
                toArray: async () => list
            };
            return cursor;
        },
        indexes: async () => [{ key: { id: 1 }, unique: true }, { key: { jobCode: 1 }, unique: true }],
        createIndex: async () => {},
        insertOne: async (doc) => {
            if (jobsStore.has(doc.id)) {
                const err = new Error(`E11000 duplicate key error collection: jobs index: id_1 dup key: { id: "${doc.id}" }`);
                err.code = 11000;
                throw err;
            }
            if (doc.jobCode) {
                for (const existing of jobsStore.values()) {
                    if (existing.jobCode === doc.jobCode && existing.id !== doc.id && existing.isActive !== false) {
                        const err = new Error(`E11000 duplicate key error collection: jobs index: jobCode_1 dup key: { jobCode: "${doc.jobCode}" }`);
                        err.code = 11000;
                        throw err;
                    }
                }
            }
            jobsStore.set(doc.id, { ...doc });
            return { insertedId: doc.id };
        },
        updateOne: async (filter, update) => {
            const id = filter.id || (filter.$or ? filter.$or[0].id : null);
            const existing = jobsStore.get(id);
            if (!existing) return { matchedCount: 0, modifiedCount: 0 };
            if (filter.editVersion !== undefined && existing.editVersion !== filter.editVersion) {
                return { matchedCount: 0, modifiedCount: 0 };
            }
            if (filter.isActive !== undefined) {
                if (filter.isActive?.$ne !== undefined && existing.isActive === filter.isActive.$ne) {
                    return { matchedCount: 0, modifiedCount: 0 };
                } else if (typeof filter.isActive === 'boolean' && existing.isActive !== filter.isActive) {
                    return { matchedCount: 0, modifiedCount: 0 };
                }
            }
            if (update.$set) Object.assign(existing, update.$set);
            if (update.$inc) {
                for (const [k, v] of Object.entries(update.$inc)) {
                    existing[k] = (existing[k] || 0) + v;
                }
            }
            return { matchedCount: 1, modifiedCount: 1 };
        },
        findOneAndUpdate: async (filter, update, options) => {
            const id = filter.id || (filter.$or ? filter.$or[0].id : null);
            const existing = jobsStore.get(id);
            if (!existing) return null;
            if (filter.editVersion !== undefined && existing.editVersion !== filter.editVersion) {
                return null;
            }
            if (update.$set) Object.assign(existing, update.$set);
            if (update.$inc) {
                for (const [k, v] of Object.entries(update.$inc)) {
                    existing[k] = (existing[k] || 0) + v;
                }
            }
            return { ...existing };
        },
        updateMany: async (filter, update) => {
            let count = 0;
            for (const [id, job] of jobsStore.entries()) {
                let match = false;
                if (filter.$or) {
                    match = filter.$or.some(c => {
                        if (c.id && c.id.$in && c.id.$in.includes(id)) return true;
                        if (c.id && c.id === id) return true;
                        if (c._id && c._id.$in && c._id.$in.includes(id)) return true;
                        if (c._id && c._id === id) return true;
                        return false;
                    });
                } else if (filter.id && filter.id.$in) {
                    match = filter.id.$in.includes(id);
                } else if (filter.id) {
                    match = filter.id === id;
                }
                if (match) {
                    if (update.$set) Object.assign(job, update.$set);
                    count++;
                }
            }
            return { matchedCount: count, modifiedCount: count };
        },
        bulkWrite: async (ops) => {
            const snapshot = new Map(jobsStore);
            let upsertedCount = 0;
            let insertedCount = 0;
            let modifiedCount = 0;
            let matchedCount = 0;
            const writeErrors = [];
            for (let i = 0; i < ops.length; i++) {
                const op = ops[i];
                if (op.insertOne) {
                    const doc = op.insertOne.document;
                    if (jobsStore.has(doc.id)) {
                        writeErrors.push({
                            index: i,
                            code: 11000,
                            errmsg: `E11000 duplicate key error collection: jobs index: id_1 dup key: { id: "${doc.id}" }`
                        });
                        continue;
                    }
                    jobsStore.set(doc.id, { ...doc });
                    insertedCount++;
                }
                if (op.updateOne) {
                    const id = op.updateOne.filter.id;
                    const existed = jobsStore.has(id);
                    const doc = jobsStore.get(id) || { id };
                    if (op.updateOne.update.$set) Object.assign(doc, op.updateOne.update.$set);
                    if (op.updateOne.update.$setOnInsert && !existed) Object.assign(doc, op.updateOne.update.$setOnInsert);
                    jobsStore.set(id, doc);
                    if (existed) {
                        matchedCount++;
                        modifiedCount++;
                    } else {
                        upsertedCount++;
                    }
                }
            }
            if (writeErrors.length > 0) {
                // Transaction rollback simulation for jobs
                jobsStore.clear();
                for (const [k, v] of snapshot) jobsStore.set(k, v);
                const bulkErr = new Error('E11000 duplicate key error');
                bulkErr.code = 11000;
                bulkErr.writeErrors = writeErrors;
                bulkErr.result = {
                    insertedCount,
                    upsertedCount,
                    modifiedCount,
                    matchedCount
                };
                throw bulkErr;
            }
            return { upsertedCount, modifiedCount, matchedCount, insertedCount };
        }
    };

    const mockClientsColl = {
        findOne: async (filter) => {
            const id = filter.$or ? filter.$or[0].id : filter.id;
            if (id === 'client-db-error') throw new Error('Simulated client database failure');
            return clientsStore.get(id) || null;
        }
    };

    const mockTimeEntriesColl = {
        find: (filter = {}) => {
            const list = Array.from(timeEntriesStore.values()).filter(e => {
                if (filter.$or) {
                    const match = filter.$or.some(c => {
                        if (c.jobId && e.jobId === c.jobId) return true;
                        if (c.project_id && e.project_id === c.project_id) return true;
                        if (c.id) {
                            if (c.id.$in) return c.id.$in.includes(e.id);
                            return c.id === e.id;
                        }
                        const eid = e._id || e.id;
                        if (c._id) {
                            if (c._id.$in) return c._id.$in.includes(eid);
                            return c._id === eid;
                        }
                        return false;
                    });
                    if (!match) return false;
                }
                if (filter.id?.$in && !filter.id.$in.includes(e.id)) return false;
                if (filter.jobId && e.jobId !== filter.jobId) return false;
                if (filter.settlementId && e.settlementId !== filter.settlementId) return false;
                if (filter.status?.$in && !filter.status.$in.includes(e.status)) return false;
                if (filter.isActive?.$ne !== undefined && e.isActive === filter.isActive.$ne) return false;
                return true;
            });
            return {
                skip: () => ({ limit: () => ({ toArray: async () => list }) }),
                limit: () => ({ toArray: async () => list }),
                toArray: async () => list
            };
        },
        countDocuments: async (filter = {}) => {
            const list = Array.from(timeEntriesStore.values()).filter(e => {
                if (filter.$or) {
                    const match = filter.$or.some(c => (c.jobId && e.jobId === c.jobId) || (c.project_id && e.project_id === c.project_id));
                    if (!match) return false;
                }
                if (filter.isActive?.$ne !== undefined && e.isActive === filter.isActive.$ne) return false;
                return true;
            });
            return list.length;
        },
        findOne: async (filter) => {
            if (!filter) return null;
            if (filter.$or) {
                for (const e of timeEntriesStore.values()) {
                    const match = filter.$or.some(c => {
                        if (c.id && e.id === c.id) return true;
                        if (c._id && (e._id || e.id) === c._id) return true;
                        if (c.jobId && e.jobId === c.jobId) return true;
                        if (c.project_id && e.project_id === c.project_id) return true;
                        return false;
                    });
                    if (!match) continue;
                    if (filter.status?.$in && !filter.status.$in.includes(e.status)) continue;
                    if (filter.isActive?.$ne !== undefined && e.isActive === filter.isActive.$ne) continue;
                    return e;
                }
                return null;
            }
            const id = filter.id;
            return timeEntriesStore.get(id) || null;
        },
        insertOne: async (doc) => {
            timeEntriesStore.set(doc.id, { ...doc });
            return { insertedId: doc.id };
        },
        updateOne: async (filter, update) => {
            const id = filter.id || (filter.$or ? filter.$or[0].id : null);
            const existing = timeEntriesStore.get(id);
            if (!existing) return { matchedCount: 0, modifiedCount: 0 };
            if (update.$set) Object.assign(existing, update.$set);
            if (update.$unset) {
                for (const k of Object.keys(update.$unset)) {
                    delete existing[k];
                }
            }
            return { matchedCount: 1, modifiedCount: 1 };
        },
        updateMany: async (filter, update) => {
            let matchedCount = 0;
            let modifiedCount = 0;
            for (const [id, doc] of timeEntriesStore.entries()) {
                let matches = true;
                if (filter.$or) {
                    matches = filter.$or.some(c => {
                        if (c.id) {
                            if (c.id.$in) return c.id.$in.includes(doc.id);
                            return c.id === doc.id;
                        }
                        const eid = doc._id || doc.id;
                        if (c._id) {
                            if (c._id.$in) return c._id.$in.includes(eid);
                            return c._id === eid;
                        }
                        return false;
                    });
                } else if (filter.id?.$in) {
                    matches = filter.id.$in.includes(doc.id);
                }
                if (matches) {
                    matchedCount++;
                    if (update.$set) {
                        Object.assign(doc, update.$set);
                        modifiedCount++;
                    }
                    if (update.$unset) {
                        for (const k of Object.keys(update.$unset)) {
                            delete doc[k];
                        }
                    }
                }
            }
            return { matchedCount, modifiedCount };
        },
        deleteOne: async (filter) => {
            const id = filter.id || (filter.$or ? filter.$or[0].id : null);
            const existed = timeEntriesStore.delete(id);
            return { deletedCount: existed ? 1 : 0 };
        },
        bulkWrite: async (ops) => {
            let count = 0;
            for (let i = 0; i < ops.length; i++) {
                const op = ops[i];
                if (op.updateOne) {
                    const id = op.updateOne.filter.id || (op.updateOne.filter.$or ? op.updateOne.filter.$or[0].id : null);
                    if (id === 'te-bulk-fail-sim-2') {
                        const bulkErr = new Error('Simulated bulk write failure on second operation');
                        bulkErr.name = 'MongoBulkWriteError';
                        bulkErr.result = { nModified: count, matchedCount: count };
                        bulkErr.writeErrors = [{ index: i, errmsg: 'Simulated bulk write failure on second operation' }];
                        throw bulkErr;
                    }
                    const doc = timeEntriesStore.get(id) || { id };
                    if (op.updateOne.update.$set) Object.assign(doc, op.updateOne.update.$set);
                    if (op.updateOne.update.$unset) {
                        for (const k of Object.keys(op.updateOne.update.$unset)) {
                            delete doc[k];
                        }
                    }
                    if (op.updateOne.update.$setOnInsert && !timeEntriesStore.has(id)) Object.assign(doc, op.updateOne.update.$setOnInsert);
                    timeEntriesStore.set(id, doc);
                    count++;
                }
            }
            return { upsertedCount: count, modifiedCount: count, matchedCount: count };
        }
    };

    const mockSettlementsColl = {
        find: (filter = {}) => {
            const list = Array.from(settlementsStore.values()).filter(s => {
                if (filter.id?.$in && !filter.id.$in.includes(s.id)) return false;
                if (filter.jobId && s.jobId !== filter.jobId) return false;
                if (filter.type && s.type !== filter.type) return false;
                if (filter.isActive?.$ne !== undefined && s.isActive === filter.isActive.$ne) return false;
                return true;
            });
            return {
                skip: () => ({ limit: () => ({ toArray: async () => list }) }),
                limit: () => ({ toArray: async () => list }),
                toArray: async () => list
            };
        },
        findOne: async (filter) => {
            const id = filter.$or ? filter.$or[0].id : filter.id;
            return settlementsStore.get(id) || null;
        },
        insertOne: async (doc) => {
            settlementsStore.set(doc.id, { ...doc });
            return { insertedId: doc.id };
        },
        updateOne: async (filter, update) => {
            const id = filter.id || (filter.$or ? filter.$or[0].id : null);
            const existing = settlementsStore.get(id);
            if (!existing) return { matchedCount: 0, modifiedCount: 0 };
            if (update.$set) Object.assign(existing, update.$set);
            return { matchedCount: 1, modifiedCount: 1 };
        }
    };

    const mockEmployeesColl = {
        findOne: async (filter) => {
            const id = filter.$or ? filter.$or[0].id : filter.id;
            return employeesStore.get(id) || null;
        },
        find: () => ({
            toArray: async () => Array.from(employeesStore.values())
        })
    };

    const countersStore = new Map();
    const stageItemsStore = new Map();
    const idempotencyKeysStore = new Map();

    const mockCountersColl = {
        findOneAndUpdate: async (filter, update) => {
            const id = filter._id || filter.id;
            let current = countersStore.get(id);
            if (!current) {
                current = { _id: id, seq: 0 };
                countersStore.set(id, current);
            }
            if (update.$inc) {
                for (const [k, v] of Object.entries(update.$inc)) {
                    current[k] = (current[k] || 0) + v;
                }
            }
            return { value: { ...current }, seq: current.seq };
        },
        updateOne: async (filter, update) => {
            const id = filter._id || filter.id;
            let current = countersStore.get(id);
            if (!current) {
                current = { _id: id, seq: 0 };
                countersStore.set(id, current);
            }
            if (update.$inc) {
                for (const [k, v] of Object.entries(update.$inc)) {
                    current[k] = (current[k] || 0) + v;
                }
            }
            if (update.$max) {
                for (const [k, v] of Object.entries(update.$max)) {
                    current[k] = Math.max(current[k] || 0, v);
                }
            }
            return { matchedCount: 1, modifiedCount: 1 };
        },
        findOne: async (filter) => {
            const id = filter._id || filter.id;
            return countersStore.get(id) || null;
        }
    };

    const mockJobStageItemsColl = {
        insertMany: async (docs) => {
            docs.forEach(d => stageItemsStore.set(d.id, { ...d }));
            return { insertedCount: docs.length };
        },
        find: (filter = {}) => {
            const list = Array.from(stageItemsStore.values()).filter(i => {
                if (filter.jobId && i.jobId !== filter.jobId) return false;
                return true;
            });
            return {
                toArray: async () => list
            };
        }
    };

    const mockIdempotencyKeysColl = {
        findOne: async (filter) => {
            const k = filter.key;
            return idempotencyKeysStore.get(k) || null;
        },
        insertOne: async (doc) => {
            if (idempotencyKeysStore.has(doc.key)) {
                const err = new Error('E11000 duplicate key');
                err.code = 11000;
                throw err;
            }
            idempotencyKeysStore.set(doc.key, { ...doc });
            return { insertedId: doc.id };
        },
        updateOne: async (filter, update) => {
            const k = filter.key;
            const existing = idempotencyKeysStore.get(k);
            if (!existing) return { matchedCount: 0, modifiedCount: 0 };
            if (update.$set) Object.assign(existing, update.$set);
            return { matchedCount: 1, modifiedCount: 1 };
        },
        findOneAndUpdate: async (filter, update) => {
            const k = filter.key;
            const existing = idempotencyKeysStore.get(k);
            if (!existing) return null;
            if (update.$set) Object.assign(existing, update.$set);
            return { value: { ...existing } };
        },
        deleteOne: async (filter) => {
            const k = filter.key;
            const existed = idempotencyKeysStore.delete(k);
            return { deletedCount: existed ? 1 : 0 };
        }
    };

    const mockDb = {
        collection: (name) => {
            if (name === 'jobs') return mockJobsColl;
            if (name === 'clients') return mockClientsColl;
            if (name === 'time-entries') return mockTimeEntriesColl;
            if (name === 'settlements') return mockSettlementsColl;
            if (name === 'employees') return mockEmployeesColl;
            if (name === 'counters') return mockCountersColl;
            if (name === 'jobStageItems') return mockJobStageItemsColl;
            if (name === 'idempotency_keys') return mockIdempotencyKeysColl;
            return {
                findOne: async () => null,
                find: () => ({ toArray: async () => [] })
            };
        }
    };


    setDb(mockDb, true);

    await t.test('single source of truth: backend and schema have identical domain statuses and enums', () => {
        assert.deepStrictEqual(JOB_STATUSES, jobSchema.definitions.JobStatus.enum);
        assert.deepStrictEqual(JOB_STATUSES, ['draft', 'planned', 'in_progress', 'paused', 'done', 'cancelled']);

        assert.deepStrictEqual(JOB_STAGE_STATUSES, jobSchema.definitions.JobStageStatus.enum);
        assert.deepStrictEqual(JOB_STAGE_STATUSES, ['planowany', 'w_toku', 'zakończony', 'anulowany']);

        assert.deepStrictEqual(JOB_STAGE_TYPES, jobSchema.definitions.JobStageType.enum);
        assert.deepStrictEqual(JOB_STAGE_TYPES, ['podstawowy', 'dodatkowy']);

        assert.deepStrictEqual(JOB_BILLING_TYPES, jobSchema.definitions.JobBillingType.enum);
        assert.deepStrictEqual(JOB_BILLING_TYPES, ['hourly', 'fixed', 'm2', 'mb']);

        assert.deepStrictEqual(JOB_RISK_FLAGS, jobSchema.definitions.JobRiskFlag.enum);
        assert.deepStrictEqual(JOB_RISK_FLAGS, ['none', 'delay', 'overbudget', 'scope_change']);

        assert.deepStrictEqual(JOB_PRIORITIES, jobSchema.definitions.JobPriority.enum);
        assert.deepStrictEqual(JOB_PRIORITIES, ['low', 'normal', 'high']);
    });

    await t.test('fail-closed Ajv validation: rejects empty POST payload, missing name, or missing clientId', async () => {
        // Empty payload
        const resEmpty = await request(app)
            .post('/api/jobs')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({});
        assert.strictEqual(resEmpty.status, 400);
        assert.match(resEmpty.body.error, /Obiekt zlecenia nie może być pusty/);

        // Missing clientId
        const resNoClient = await request(app)
            .post('/api/jobs')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ name: 'Montaż Witryn Hala A' });
        assert.strictEqual(resNoClient.status, 400);
        assert.match(resNoClient.body.error, /clientId jest wymagane/);

        // Missing name
        const resNoName = await request(app)
            .post('/api/jobs')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ clientId: 'client-1' });
        assert.strictEqual(resNoName.status, 400);
        assert.match(resNoName.body.error, /name jest wymagane/);

        // Whitespace only name
        const resBlankName = await request(app)
            .post('/api/jobs')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ name: '   ', clientId: 'client-1' });
        assert.strictEqual(resBlankName.status, 400);
        assert.match(resBlankName.body.error, /Pole name nie może być puste/);
    });

    await t.test('fail-closed client verification: non-existent clientId returns 404, DB failure returns 500', async () => {
        // Non-existent client
        const resNotFound = await request(app)
            .post('/api/jobs')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ name: 'Zlecenie Test', clientId: 'non-existent-client' });
        assert.strictEqual(resNotFound.status, 404);
        assert.match(resNotFound.body.error, /Klient o identyfikatorze 'non-existent-client' nie istnieje/);

        // Client query failure
        const resDbError = await request(app)
            .post('/api/jobs')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ name: 'Zlecenie Test', clientId: 'client-db-error' });
        assert.strictEqual(resDbError.status, 500);
        assert.match(resDbError.body.error, /Błąd weryfikacji klienta/);
    });

    await t.test('POST /api/jobs: creates job, denormalizes clientName, normalizes legacy status, and defaults planned', async () => {
        const payload = {
            id: 'job-101',
            name: 'Montaż Stolarki Alu - Biurowiec Delta',
            clientId: 'client-1',
            status: 'planowane', // legacy Polish alias
            location: 'Warszawa, ul. Prosta 10',
            plannedStartDate: '2026-10-15',
            plannedEndDate: '2026-11-15',
            revenuePlannedNet: 150000,
            materialsPlannedNet: 70000,
            laborPlannedNet: 40000,
            stages: [
                {
                    id: 'stage-1',
                    name: 'Etap 1 - Montaż ram',
                    type: 'podstawowy',
                    status: 'planned', // English alias
                    plannedRevenueNet: 80000
                }
            ]
        };

        const res = await request(app)
            .post('/api/jobs')
            .set('Authorization', 'Bearer ' + adminToken)
            .send(payload);

        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.id, 'job-101');
        assert.strictEqual(res.body.name, 'Montaż Stolarki Alu - Biurowiec Delta');
        assert.strictEqual(res.body.clientName, 'Firma Budowlana S.A.', 'Must denormalize clientName automatically');
        assert.strictEqual(res.body.status, 'planned', 'Legacy planowane must normalize to planned');
        assert.strictEqual(res.body.stages[0].status, 'planowany', 'Stage English planned must normalize to planowany');
    });

    await t.test('server-authoritative financial protection: client cannot fabricate actuals on POST or PATCH', async () => {
        // Attempt to forge actuals on POST
        const forgedPost = {
            id: 'job-forged-actuals',
            name: 'Fałszowanie Agregatów',
            clientId: 'client-1',
            actualLaborHours: 1000,
            actualLaborCost: 999999,
            settledLaborCost: 888888,
            revenueActualNet: 500000,
            actualTotalCost: 777777,
            marginActualPercent: 85.5,
            stages: [
                {
                    id: 'stage-forged',
                    name: 'Etap ze sfałszowanym kosztem',
                    type: 'podstawowy',
                    status: 'planowany',
                    plannedRevenueNet: 50000,
                    actualLaborHours: 500,
                    actualLaborCost: 150000
                }
            ]
        };

        const resPost = await request(app)
            .post('/api/jobs')
            .set('Authorization', 'Bearer ' + adminToken)
            .send(forgedPost);

        assert.strictEqual(resPost.status, 201);
        // Persisted job MUST reset all actuals to 0
        assert.strictEqual(resPost.body.actualLaborHours, 0, 'actualLaborHours must be 0 on creation');
        assert.strictEqual(resPost.body.actualLaborCost, 0, 'actualLaborCost must be 0 on creation');
        assert.strictEqual(resPost.body.settledLaborCost, 0, 'settledLaborCost must be 0 on creation');
        assert.strictEqual(resPost.body.revenueActualNet, 0, 'revenueActualNet must be 0 on creation');
        assert.strictEqual(resPost.body.actualTotalCost, 0, 'actualTotalCost must be 0 on creation');
        assert.strictEqual(resPost.body.stages[0].actualLaborCost, 0, 'Stage actualLaborCost must be 0 on creation');

        // Now test PATCH: frontend labor aggregates sync is accepted, but fabricated revenue/materials are stripped
        const resPatch = await request(app)
            .patch('/api/jobs/job-forged-actuals')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                actualLaborCost: 456789,
                settledLaborCost: 123456,
                revenueActualNet: 999999, // Should be stripped
                materialsActualNet: 111111, // Should be stripped
                priority: 'high',
                expectedVersion: 1
            });

        assert.strictEqual(resPatch.status, 200);
        assert.strictEqual(resPatch.body.priority, 'high');
        assert.strictEqual(resPatch.body.actualLaborCost, 0, 'PATCH must discard client fabricated actualLaborCost');
        assert.strictEqual(resPatch.body.settledLaborCost, 0, 'PATCH must discard client fabricated settledLaborCost');
        assert.strictEqual(resPatch.body.revenueActualNet, 0, 'PATCH must discard client fabricated revenueActualNet');
        assert.strictEqual(resPatch.body.materialsActualNet, 0, 'PATCH must discard client fabricated materialsActualNet');
    });

    await t.test('PATCH validation: guards against empty strings and non-existent jobs', async () => {
        // Clearing name with empty string
        const resEmptyName = await request(app)
            .patch('/api/jobs/job-101')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ name: '', expectedVersion: 1 });
        assert.strictEqual(resEmptyName.status, 400);
        assert.match(resEmptyName.body.error, /Pole name nie może być puste/);

        // Clearing clientId with empty string
        const resEmptyClient = await request(app)
            .patch('/api/jobs/job-101')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ clientId: '   ', expectedVersion: 1 });
        assert.strictEqual(resEmptyClient.status, 400);
        assert.match(resEmptyClient.body.error, /Pole clientId nie może być puste/);

        // Non-existent job
        const resNotFound = await request(app)
            .patch('/api/jobs/job-not-existing')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ priority: 'low', expectedVersion: 1 });
        assert.strictEqual(resNotFound.status, 404);
        assert.match(resNotFound.body.error, /Zlecenie o identyfikatorze 'job-not-existing' nie istnieje/);

        // Valid update
        const resValid = await request(app)
            .patch('/api/jobs/job-101')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ status: 'in_progress', priority: 'high', expectedVersion: 1 });
        assert.strictEqual(resValid.status, 200);
        assert.strictEqual(resValid.body.status, 'in_progress');
        assert.strictEqual(resValid.body.priority, 'high');
    });

    await t.test('batch import (/api/jobs/batch-import): validates batch schema, rejects duplicate IDs, resets actuals', async () => {
        // Missing items array
        const resNoItems = await request(app)
            .post('/api/jobs/batch-import')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({});
        assert.strictEqual(resNoItems.status, 400);

        // Duplicate IDs in batch
        const resDup = await request(app)
            .post('/api/jobs/batch-import')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                items: [
                    { id: 'job-dup-1', name: 'Zlecenie 1', clientId: 'client-1' },
                    { id: 'job-dup-1', name: 'Zlecenie 2', clientId: 'client-1' }
                ]
            });
        assert.strictEqual(resDup.status, 400);
        assert.match(resDup.body.error, /Wykryto zduplikowane identyfikatory/);

        // Valid batch
        const resValidBatch = await request(app)
            .post('/api/jobs/batch-import')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                items: [
                    { id: 'batch-job-1', name: 'Zlecenie Batch 1', clientId: 'client-1', actualLaborCost: 5000 },
                    { id: 'batch-job-2', name: 'Zlecenie Batch 2', clientId: 'client-2', actualLaborCost: 7000 }
                ]
            });
        assert.strictEqual(resValidBatch.status, 200);
        assert.strictEqual(resValidBatch.body.succeeded, 2);

        // Check authoritative actuals reset
        const job1 = jobsStore.get('batch-job-1');
        assert.strictEqual(job1.actualLaborCost, 0, 'Batch import must zero forged actualLaborCost');
        const job2 = jobsStore.get('batch-job-2');
        assert.strictEqual(job2.actualLaborCost, 0, 'Batch import must zero forged actualLaborCost');
    });

    await t.test('paginated response envelope: GET /api/jobs returns compliant JobPaginatedResponse and strips sensitive fields for worker', async () => {
        // Admin gets paginated envelope
        const resAdmin = await request(app)
            .get('/api/jobs?page=1&limit=5')
            .set('Authorization', 'Bearer ' + adminToken);
        assert.strictEqual(resAdmin.status, 200);
        assert.ok(Array.isArray(resAdmin.body.data));
        assert.ok(resAdmin.body.pagination);
        assert.strictEqual(resAdmin.body.pagination.page, 1);
        assert.strictEqual(resAdmin.body.pagination.limit, 5);
        assert.ok(typeof resAdmin.body.pagination.total === 'number');

        // Worker GET strips sensitive financial aggregates
        const resWorker = await request(app)
            .get('/api/jobs?page=1&limit=5')
            .set('Authorization', 'Bearer ' + workerToken);
        assert.strictEqual(resWorker.status, 200);
        const workerJob = resWorker.body.data.find(j => j.id === 'job-101');
        assert.ok(workerJob);
        assert.strictEqual(workerJob.actualLaborCost, undefined, 'Sensitive actualLaborCost must be stripped for worker');
        assert.strictEqual(workerJob.totalPlannedRevenueNet, undefined, 'Sensitive revenue must be stripped for worker');
    });


    await t.test('[P1] batch import strictly forbids overwriting existing jobs with 409 Conflict, closing optimistic locking bypass', async () => {
        // Seed existing job with editVersion: 1
        jobsStore.set('job-batch-preserve', {
            id: 'job-batch-preserve',
            name: 'Stare Zlecenie',
            clientId: 'client-1',
            status: 'in_progress',
            editVersion: 1,
            actualLaborHours: 120,
            actualLaborCost: 7500,
            settledLaborCost: 5000,
            timeEntriesCount: 15,
            timeEntriesHours: 120,
            materialsActualNet: 3200,
            stages: [
                {
                    id: 'stage-existing',
                    name: 'Etap 1',
                    type: 'podstawowy',
                    status: 'planowany',
                    actualLaborHours: 120,
                    actualLaborCost: 7500
                }
            ]
        });

        // Client attempts batch import containing existing job
        const resBatch = await request(app)
            .post('/api/jobs/batch-import')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                items: [
                    {
                        id: 'job-batch-preserve',
                        name: 'Zaktualizowane Zlecenie Batch',
                        clientId: 'client-1',
                        priority: 'high',
                        stages: [
                            {
                                id: 'stage-existing',
                                name: 'Etap 1 Zaktualizowany',
                                type: 'podstawowy',
                                status: 'w_toku',
                                plannedRevenueNet: 50000
                            }
                        ]
                    }
                ]
            });

        // Must reject with 409 Conflict because batch-import cannot bypass optimistic locking
        assert.strictEqual(resBatch.status, 409);
        assert.strictEqual(resBatch.body.code, 'BATCH_IMPORT_VERSION_CONFLICT');
        assert.strictEqual(resBatch.body.id, 'job-batch-preserve');

        const persisted = jobsStore.get('job-batch-preserve');
        assert.strictEqual(persisted.name, 'Stare Zlecenie', 'Existing job must remain untouched');
        assert.strictEqual(persisted.editVersion, 1);
    });

    await t.test('[P2] clientName is authoritatively derived from DB and cannot be desynchronized by client on POST or PATCH', async () => {
        // 1. POST with client provided clientName
        const resPostClient = await request(app)
            .post('/api/jobs')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                id: 'job-client-sync',
                name: 'Zlecenie z fałszywym klientem',
                clientId: 'client-1',
                clientName: 'Sfałszowana Nazwa Sp. z o.o.'
            });
        assert.strictEqual(resPostClient.status, 201);
        assert.strictEqual(resPostClient.body.clientName, 'Firma Budowlana S.A.', 'Backend ignores clientName input on POST');
        assert.strictEqual(jobsStore.get('job-client-sync').clientName, 'Firma Budowlana S.A.');

        // 2. PATCH with standalone clientName and priority (no clientId)
        const resPatchName = await request(app)
            .patch('/api/jobs/job-client-sync')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                clientName: 'Próba Nadpisania Nazwy Klienta',
                priority: 'high',
                expectedVersion: 1
            });
        assert.strictEqual(resPatchName.status, 200);
        assert.strictEqual(resPatchName.body.clientName, 'Firma Budowlana S.A.', 'Standalone clientName is stripped from PATCH');
        assert.strictEqual(jobsStore.get('job-client-sync').clientName, 'Firma Budowlana S.A.');

        // 3. PATCH with clientId changed to client-2 (individual)
        const resPatchClient = await request(app)
            .patch('/api/jobs/job-client-sync')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                clientId: 'client-2',
                expectedVersion: 2
            });
        assert.strictEqual(resPatchClient.status, 200);
        assert.strictEqual(resPatchClient.body.clientName, 'Anna Kowalska', 'Changing clientId refreshes clientName from DB');
        assert.strictEqual(jobsStore.get('job-client-sync').clientName, 'Anna Kowalska');
    });

    await t.test('[P1] backend recalculateJobLaborCosts achieves full rule parity and triggers on time-entries/settlements mutations', async () => {
        const jobId = 'job-parity-test';
        jobsStore.set(jobId, {
            id: jobId,
            name: 'Zlecenie Test Parzystości',
            clientId: 'client-1',
            stages: [
                { id: 'p-stage-1', name: 'Etap 1', actualLaborHours: 0, actualLaborCost: 0 },
                { id: 'p-stage-2', name: 'Etap 2', actualLaborHours: 0, actualLaborCost: 0 },
                { id: 'p-stage-empty', name: 'Etap Pusty', actualLaborHours: 50, actualLaborCost: 2500 }
            ]
        });

        // Settlements setup: closed, exported, draft, and contract
        settlementsStore.set('s-closed', { id: 's-closed', status: 'closed', isActive: true });
        settlementsStore.set('s-exported', { id: 's-exported', status: 'exported', isActive: true });
        settlementsStore.set('s-draft', { id: 's-draft', status: 'draft', isActive: true });
        settlementsStore.set('s-contract', {
            id: 's-contract',
            type: 'contract',
            jobId: jobId,
            stageId: 'p-stage-2',
            totalAmount: 1800,
            status: 'exported',
            isActive: true
        });

        // Time entries setup:
        // 1. submitted -> ignored
        timeEntriesStore.set('te-p1', { id: 'te-p1', jobId: jobId, stageId: 'p-stage-1', hours: 5, cost: 250, status: 'submitted', isActive: true });
        // 2. approved -> counted, but not settled
        timeEntriesStore.set('te-p2', { id: 'te-p2', jobId: jobId, stageId: 'p-stage-1', hours: 8, cost: 400, status: 'approved', isActive: true });
        // 3. admin_approved + closed settlement -> counted & settled
        timeEntriesStore.set('te-p3', { id: 'te-p3', jobId: jobId, stageId: 'p-stage-1', hours: 10, cost: 500, status: 'admin_approved', settlementId: 's-closed', isActive: true });
        // 4. approved + draft settlement -> counted, NOT settled
        timeEntriesStore.set('te-p4', { id: 'te-p4', jobId: jobId, stageId: 'p-stage-1', hours: 6, cost: 300, status: 'approved', settlementId: 's-draft', isActive: true });

        // Trigger full recalculation
        await recalculateJobLaborCosts(jobId);

        const calculated = jobsStore.get(jobId);
        // Total hours: 8 + 10 + 6 = 24
        assert.strictEqual(calculated.actualLaborHours, 24, 'recalculateJobLaborCosts calculates correct total hours');
        // Total cost: 400 + 500 + 300 + 1800 (contract) = 3000
        assert.strictEqual(calculated.actualLaborCost, 3000, 'recalculateJobLaborCosts calculates correct total cost including contract');
        // Settled cost: 500 (s-closed) + 1800 (s-contract exported) = 2300
        assert.strictEqual(calculated.settledLaborCost, 2300, 'recalculateJobLaborCosts calculates correct settled cost');
        // Time entries count: 4
        assert.strictEqual(calculated.timeEntriesCount, 4);

        // Stages verification:
        const stage1 = calculated.stages.find(s => s.id === 'p-stage-1');
        assert.strictEqual(stage1.actualLaborHours, 24);
        assert.strictEqual(stage1.actualLaborCost, 1200);

        const stage2 = calculated.stages.find(s => s.id === 'p-stage-2');
        assert.strictEqual(stage2.actualLaborHours, 0);
        assert.strictEqual(stage2.actualLaborCost, 1800, 'Contract settlement allocated to stage');

        const stageEmpty = calculated.stages.find(s => s.id === 'p-stage-empty');
        assert.strictEqual(stageEmpty.actualLaborHours, 0, 'Stage without entries is zeroed out');
        assert.strictEqual(stageEmpty.actualLaborCost, 0, 'Stage without entries is zeroed out');

        // Test mutation trigger via POST /api/time-entries
        const resMutation = await request(app)
            .post('/api/time-entries')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                id: 'te-mutation-hook',
                jobId: jobId,
                stageId: 'p-stage-1',
                employeeId: 'admin-1',
                date: '2026-10-01',
                hours: 5,
                billingType: 'hourly',
                status: 'approved'
            });

        assert.strictEqual(resMutation.status, 201);
        const jobAfterTrigger = jobsStore.get(jobId);
        assert.strictEqual(jobAfterTrigger.actualLaborHours, 29, 'Mutation hook recalculates labor hours');
        assert.strictEqual(jobAfterTrigger.actualLaborCost, 3250, 'Mutation hook recalculates labor cost');
    });


    await t.test('[P1] deleting a time entry (hard delete) triggers recalculation of affected job', async () => {
        const delJobId = 'job-delete-test';
        jobsStore.set(delJobId, {
            id: delJobId,
            name: 'Zlecenie do testu DELETE',
            clientId: 'client-1',
            actualLaborHours: 10,
            actualLaborCost: 500,
            timeEntriesCount: 1,
            stages: []
        });

        timeEntriesStore.set('te-del-1', {
            id: 'te-del-1',
            jobId: delJobId,
            hours: 10,
            cost: 500,
            status: 'approved',
            isActive: true
        });

        // Hard delete time entry
        const resDel = await request(app)
            .delete('/api/time-entries/te-del-1')
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(resDel.status, 204);
        assert.strictEqual(timeEntriesStore.has('te-del-1'), false);

        const jobAfterDel = jobsStore.get(delJobId);
        assert.strictEqual(jobAfterDel.actualLaborHours, 0, 'Hours must be 0 after deleting time entry');
        assert.strictEqual(jobAfterDel.actualLaborCost, 0, 'Cost must be 0 after deleting time entry');
        assert.strictEqual(jobAfterDel.timeEntriesCount, 0, 'Entries count must be 0');
    });

    await t.test('[P1] transferring a time entry between jobs on PATCH recalculates BOTH source and target jobs', async () => {
        const srcJobId = 'job-source-transfer';
        const tgtJobId = 'job-target-transfer';

        jobsStore.set(srcJobId, {
            id: srcJobId,
            name: 'Zlecenie Źródłowe',
            clientId: 'client-1',
            actualLaborHours: 8,
            actualLaborCost: 400,
            timeEntriesCount: 1,
            stages: []
        });

        jobsStore.set(tgtJobId, {
            id: tgtJobId,
            name: 'Zlecenie Docelowe',
            clientId: 'client-1',
            actualLaborHours: 0,
            actualLaborCost: 0,
            timeEntriesCount: 0,
            stages: []
        });

        timeEntriesStore.set('te-transfer-1', {
            id: 'te-transfer-1',
            jobId: srcJobId,
            hours: 8,
            cost: 400,
            status: 'approved',
            isActive: true
        });

        // PATCH time entry changing jobId to target job
        const resTransfer = await request(app)
            .patch('/api/time-entries/te-transfer-1')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                jobId: tgtJobId
            });

        assert.strictEqual(resTransfer.status, 200);

        const srcJob = jobsStore.get(srcJobId);
        assert.strictEqual(srcJob.actualLaborHours, 0, 'Source job hours must decrease to 0 after entry transfer');
        assert.strictEqual(srcJob.actualLaborCost, 0, 'Source job cost must decrease to 0 after entry transfer');

        const tgtJob = jobsStore.get(tgtJobId);
        assert.strictEqual(tgtJob.actualLaborHours, 8, 'Target job hours must increase to 8 after entry transfer');
        assert.strictEqual(tgtJob.actualLaborCost, 400, 'Target job cost must increase to 400 after entry transfer');
    });

    await t.test('[P1] aggregation failure sets aggregationPending: true and can be reconciled on demand', async () => {
        const errJobId = 'job-error-flag-test';
        jobsStore.set(errJobId, {
            id: errJobId,
            name: 'Zlecenie z błędem agregacji',
            clientId: 'client-1',
            stages: []
        });

        // Simulate failure in time-entries search by injecting temporary thrower
        let simulateFailure = true;
        const originalFind = mockTimeEntriesColl.find;
        mockTimeEntriesColl.find = (filter) => {
            if (simulateFailure && filter?.$or?.some(c => c.jobId === errJobId)) {
                throw new Error('Simulated transient DB failure during aggregation');
            }
            return originalFind(filter);
        };

        try {
            await recalculateJobLaborCosts(errJobId);
        } catch (e) {
            // caught
        }

        const jobWithError = jobsStore.get(errJobId);
        assert.strictEqual(jobWithError.aggregationPending, true, 'Job must be marked aggregationPending: true on failure');
        assert.match(jobWithError.aggregationError, /Simulated transient DB failure/);
        assert.ok(jobWithError.aggregationFailedAt, 'aggregationFailedAt must be stamped');

        // Now resolve transient failure and trigger on-demand recalculation endpoint
        simulateFailure = false;
        mockTimeEntriesColl.find = originalFind;

        const resRecalc = await request(app)
            .post('/api/jobs/' + errJobId + '/recalculate-labor')
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(resRecalc.status, 200);
        assert.strictEqual(resRecalc.body.success, true);
        assert.strictEqual(resRecalc.body.job.aggregationPending, false, 'aggregationPending must be cleared on success');
        assert.strictEqual(resRecalc.body.job.aggregationError, null);
    });


    await t.test('[P1] fail-closed snapshot aborts PATCH, DELETE, and batch-import on database error (no untracked mutations)', async () => {
        jobsStore.set('job-fail-test', {
            id: 'job-fail-test',
            status: 'in_progress',
            isActive: true
        });

        timeEntriesStore.set('te-fail-snap', {
            id: 'te-fail-snap',
            jobId: 'job-fail-test',
            hours: 5,
            cost: 250,
            status: 'approved',
            isActive: true
        });

        // 1. Fail-closed on PATCH
        let throwFindOne = true;
        const origFindOne = mockTimeEntriesColl.findOne;
        mockTimeEntriesColl.findOne = async (f) => {
            if (throwFindOne) {
                const id = f.$or ? f.$or[0].id : f.id;
                if (id === 'te-fail-snap') {
                    throw new Error('Database connection reset during PATCH snapshot');
                }
            }
            return origFindOne(f);
        };

        const resPatch = await request(app)
            .patch('/api/time-entries/te-fail-snap')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ hours: 8 });

        assert.strictEqual(resPatch.status >= 500, true, 'PATCH must fail-closed with 5xx error on snapshot DB failure');
        assert.strictEqual(timeEntriesStore.get('te-fail-snap').hours, 5, 'Record must not be modified if snapshot failed');

        // 2. Fail-closed on DELETE
        const resDelete = await request(app)
            .delete('/api/time-entries/te-fail-snap')
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(resDelete.status >= 500, true, 'DELETE must fail-closed with 5xx error on snapshot DB failure');
        assert.strictEqual(timeEntriesStore.has('te-fail-snap'), true, 'Record must not be deleted if snapshot failed');

        // Restore findOne
        throwFindOne = false;
        mockTimeEntriesColl.findOne = origFindOne;

        // 3. Fail-closed on batch-import pre-fetch
        let throwBatchFind = true;
        const origFind = mockTimeEntriesColl.find;
        mockTimeEntriesColl.find = (filter) => {
            if (throwBatchFind && filter?.$or?.some(c => c.id?.$in?.includes('te-fail-batch'))) {
                throw new Error('Database failure during batch pre-fetch');
            }
            return origFind(filter);
        };

        const resBatch = await request(app)
            .post('/api/time-entries/batch-import')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                items: [
                    {
                        id: 'te-fail-batch',
                        jobId: 'job-fail-test',
                        employeeId: 'admin-1',
                        date: '2026-10-01',
                        hours: 4,
                        billingType: 'hourly',
                        status: 'approved'
                    }
                ]
            });

        assert.strictEqual(resBatch.status, 500, 'Batch import must abort with 500 when pre-fetch fails');
        assert.strictEqual(timeEntriesStore.has('te-fail-batch'), false, 'Items must not be inserted when pre-fetch fails');

        throwBatchFind = false;
        mockTimeEntriesColl.find = origFind;
    });

    await t.test('[P2] auto-reconciliation: reconcilePendingJobAggregates scans and recovers pending jobs', async () => {
        const recJobId = 'job-auto-reconcile-test';
        jobsStore.set(recJobId, {
            id: recJobId,
            name: 'Zlecenie z zaległą agregacją',
            clientId: 'client-1',
            aggregationPending: true,
            aggregationError: 'Previous crash before recalculation',
            stages: []
        });

        timeEntriesStore.set('te-auto-rec-1', {
            id: 'te-auto-rec-1',
            jobId: recJobId,
            hours: 7,
            cost: 350,
            status: 'approved',
            isActive: true
        });

        const recResult = await reconcilePendingJobAggregates();
        assert.ok(recResult.reconciledCount >= 1, 'Must reconcile at least 1 pending job');

        const recoveredJob = jobsStore.get(recJobId);
        assert.strictEqual(recoveredJob.aggregationPending, false, 'Pending flag must be cleared');
        assert.strictEqual(recoveredJob.actualLaborHours, 7, 'Labor hours recalculated accurately');
        assert.strictEqual(recoveredJob.actualLaborCost, 350, 'Labor cost recalculated accurately');
    });

    await t.test('[P1 & P2] batch-update handles legacy project_id transfer with $unset and does not transition source job', async () => {
        const srcJobId = 'job-legacy-src';
        const tgtJobId = 'job-transfer-tgt';

        jobsStore.set(srcJobId, {
            id: srcJobId,
            name: 'Zlecenie Źródłowe Legacy',
            clientId: 'client-1',
            status: 'planned',
            actualLaborHours: 0,
            actualLaborCost: 0,
            stages: []
        });

        jobsStore.set(tgtJobId, {
            id: tgtJobId,
            name: 'Zlecenie Docelowe Transfer',
            clientId: 'client-1',
            status: 'planned',
            actualLaborHours: 0,
            actualLaborCost: 0,
            stages: []
        });

        // Create legacy entry referencing srcJobId only via project_id
        timeEntriesStore.set('te-legacy-transfer', {
            id: 'te-legacy-transfer',
            project_id: srcJobId,
            employeeId: 'admin-1',
            hours: 8,
            cost: 400,
            status: 'submitted',
            isActive: true
        });

        // Execute batch-update transferring to tgtJobId and approving
        const resTransfer = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: ['te-legacy-transfer'],
                updates: {
                    jobId: tgtJobId,
                    status: 'admin_approved',
                    adminId: 'admin-1',
                    adminApprovedAt: new Date().toISOString()
                }
            });

        assert.strictEqual(resTransfer.status, 200, 'Batch-update transfer returns 200');
        const updatedEntry = timeEntriesStore.get('te-legacy-transfer');
        assert.strictEqual(updatedEntry.jobId, tgtJobId, 'jobId must be updated to target job');
        assert.strictEqual(updatedEntry.project_id, undefined, 'legacy project_id must be completely $unset');
        assert.strictEqual(updatedEntry.status, 'admin_approved');

        // [P2 CHECK] Source job must NOT be transitioned to in_progress (it has 0 approved entries)
        const srcJob = jobsStore.get(srcJobId);
        assert.strictEqual(srcJob.actualLaborHours, 0, 'Source job has 0 hours after transfer');
        assert.strictEqual(srcJob.actualLaborCost, 0, 'Source job has 0 cost after transfer');
        assert.strictEqual(srcJob.status, 'planned', 'Source job without approved entries must stay planned');

        // Target job must receive hours, cost, and transition to in_progress
        const tgtJob = jobsStore.get(tgtJobId);
        assert.strictEqual(tgtJob.actualLaborHours, 8, 'Target job receives transferred hours');
        assert.strictEqual(tgtJob.actualLaborCost, 400, 'Target job receives transferred cost');
        assert.strictEqual(tgtJob.status, 'in_progress', 'Target job transitions planned → in_progress');

        // Verify that re-running recalculateJobLaborCosts on source job still finds 0 entries (no double counting)
        await recalculateJobLaborCosts(srcJobId);
        assert.strictEqual(jobsStore.get(srcJobId).actualLaborHours, 0, 'No double counting in source job');
    });

    await t.test('[P1] batch-update rejects invalid payloads, enforces TimeEntry schema, and prevents identity mutation', async () => {
        jobsStore.set('job-val-guard', {
            id: 'job-val-guard',
            name: 'Zlecenie Walidacja Guard',
            clientId: 'client-1',
            status: 'in_progress',
            stages: []
        });

        timeEntriesStore.set('te-val-guard', {
            id: 'te-val-guard',
            jobId: 'job-val-guard',
            employeeId: 'admin-1',
            hours: 4,
            cost: 200,
            status: 'submitted',
            isActive: true
        });

        // 1. Conflicting jobId and project_id in updates
        const resConflict = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: ['te-val-guard'],
                updates: { jobId: 'job-1', project_id: 'job-2' }
            });
        assert.strictEqual(resConflict.status, 400, 'Rejects conflicting jobId and project_id');
        assert.match(resConflict.body.error, /Niespójne wartości jobId oraz project_id/);

        // 2. Empty string jobId
        const resEmptyJob = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: ['te-val-guard'],
                updates: { jobId: '   ' }
            });
        assert.strictEqual(resEmptyJob.status, 400, 'Rejects empty jobId');
        assert.match(resEmptyJob.body.error, /Pole jobId nie może być puste/);

        // 3. Empty string employeeId
        const resEmptyEmp = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: ['te-val-guard'],
                updates: { employeeId: '' }
            });
        assert.strictEqual(resEmptyEmp.status, 400, 'Rejects empty employeeId');
        assert.match(resEmptyEmp.body.error, /Pole employeeId nie może być puste/);

        // 4. Unknown status
        const resBadStatus = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: ['te-val-guard'],
                updates: { status: 'invalid_status_xyz' }
            });
        assert.strictEqual(resBadStatus.status, 400, 'Rejects unknown status');
        assert.match(resBadStatus.body.error, /Nieprawidłowy status wpisu czasu/);

        // 5. Negative hours
        const resNegHours = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: ['te-val-guard'],
                updates: { hours: -5 }
            });
        assert.strictEqual(resNegHours.status, 400, 'Rejects negative hours');
        assert.match(resNegHours.body.error, /Godziny nie mogą być ujemne/);

        // 6. Non-existent target job
        const resMissingJob = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: ['te-val-guard'],
                updates: { jobId: 'job-non-existent-999' }
            });
        assert.strictEqual(resMissingJob.status, 404, 'Rejects transfer to non-existent job');
        assert.match(resMissingJob.body.error, /nie zostało odnalezione/);

        // 7. Identity immutability: passing id in updates does not alter record id
        const resIdImm = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: ['te-val-guard'],
                updates: { id: 'forged-new-id', status: 'approved' }
            });
        assert.strictEqual(resIdImm.status, 200, 'Batch-update succeeds by stripping id');
        assert.strictEqual(timeEntriesStore.has('te-val-guard'), true, 'Original ID must remain intact');
        assert.strictEqual(timeEntriesStore.has('forged-new-id'), false, 'Forged ID must not be created');

        // 8. [P2 FIX] Partially missing IDs fail-closed: reject entire operation if any ID is missing
        const resPartMissing = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: ['te-val-guard', 'non-existent-missing-id'],
                updates: { status: 'admin_approved' }
            });
        assert.strictEqual(resPartMissing.status, 404, 'Must fail-closed with 404 when any ID is missing');
        assert.strictEqual(resPartMissing.body.matchedCount, 0);
        assert.deepStrictEqual(resPartMissing.body.missingIds, ['non-existent-missing-id']);
        assert.strictEqual(timeEntriesStore.get('te-val-guard').status, 'approved', 'Existing entry must NOT be modified on partial failure');

        // 9. [P1 FIX] Normalization preservation on employeeId change: bulkWrite preserves recalculated cost & rates
        employeesStore.set('emp-senior', {
            id: 'emp-senior',
            hourlyRate: 100,
            defaultHourlyRate: 100,
            isActive: true
        });

        const resReassignEmp = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: ['te-val-guard'],
                updates: { employeeId: 'emp-senior' }
            });
        assert.strictEqual(resReassignEmp.status, 200);
        const updatedEntry = timeEntriesStore.get('te-val-guard');
        assert.strictEqual(updatedEntry.employeeId, 'emp-senior');
        assert.strictEqual(updatedEntry.hourlyRate, 100, 'Authoritative rate updated to new employee rate');
        assert.strictEqual(updatedEntry.cost, 400, 'Authoritative cost recalculated (4h * 100 = 400) and persisted via bulkWrite');
        assert.strictEqual(updatedEntry.workerType, 'employee', 'workerType preserved');
        const updatedJob = jobsStore.get('job-val-guard');
        assert.strictEqual(updatedJob.actualLaborCost, 400, 'Job labor cost recalculated to reflect new employee cost');

        // 10. [P2 FIX] Auto-status reconciliation: planned job with approved entries recovered by reconcilePendingJobAggregates
        const strandedJobId = 'job-stranded-planned';
        jobsStore.set(strandedJobId, {
            id: strandedJobId,
            name: 'Zlecenie z zaległym statusem',
            clientId: 'client-1',
            status: 'planned',
            actualLaborHours: 5,
            actualLaborCost: 250,
            aggregationPending: true,
            stages: []
        });
        timeEntriesStore.set('te-stranded-1', {
            id: 'te-stranded-1',
            jobId: strandedJobId,
            employeeId: 'admin-1',
            hours: 5,
            cost: 250,
            status: 'admin_approved',
            isActive: true
        });

        const recStatusResult = await reconcilePendingJobAggregates();
        assert.ok(recStatusResult.reconciledCount >= 1, 'Reconciled stranded job');
        const recoveredStrandedJob = jobsStore.get(strandedJobId);
        assert.strictEqual(recoveredStrandedJob.status, 'in_progress', 'Auto-status planned → in_progress recovered during reconciliation');
        assert.strictEqual(recoveredStrandedJob.aggregationPending, false, 'aggregationPending cleared on recovery');
    });

    await t.test('[P1] batch-update recalculates job labor aggregates on real approval and rejection statuses', async () => {
        const batchJobId = 'job-batch-approval-test';
        jobsStore.set(batchJobId, {
            id: batchJobId,
            name: 'Zlecenie Batch Approval',
            clientId: 'client-1',
            status: 'planned',
            actualLaborHours: 0,
            actualLaborCost: 0,
            settledLaborCost: 0,
            stages: []
        });

        // 1. Two submitted entries
        timeEntriesStore.set('te-batch-1', {
            id: 'te-batch-1',
            jobId: batchJobId,
            employeeId: 'admin-1',
            hours: 6,
            cost: 300,
            status: 'submitted',
            isActive: true
        });
        timeEntriesStore.set('te-batch-2', {
            id: 'te-batch-2',
            jobId: batchJobId,
            employeeId: 'admin-1',
            hours: 4,
            cost: 200,
            status: 'submitted',
            isActive: true
        });

        // Test transition: submitted → admin_approved
        const resAdminApprove = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: ['te-batch-1', 'te-batch-2'],
                updates: {
                    status: 'admin_approved',
                    adminId: 'admin-1',
                    adminApprovedAt: new Date().toISOString()
                }
            });

        assert.strictEqual(resAdminApprove.status, 200, 'batch-update returns 200 on admin approval');
        assert.strictEqual(resAdminApprove.body.success, true);
        assert.strictEqual(timeEntriesStore.get('te-batch-1').status, 'admin_approved');
        assert.strictEqual(timeEntriesStore.get('te-batch-2').status, 'admin_approved');

        const jobAfterApprove = jobsStore.get(batchJobId);
        assert.strictEqual(jobAfterApprove.actualLaborHours, 10, 'admin_approved adds hours to Job');
        assert.strictEqual(jobAfterApprove.actualLaborCost, 500, 'admin_approved adds cost to Job');
        assert.strictEqual(jobAfterApprove.status, 'in_progress', 'Job auto-transitions from planned to in_progress on admin_approved');

        // Test transition: admin_approved → admin_rejected (deducts hours & costs)
        const resAdminReject = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: ['te-batch-1'],
                updates: {
                    status: 'admin_rejected',
                    adminId: 'admin-1',
                    adminApprovedAt: new Date().toISOString()
                }
            });

        assert.strictEqual(resAdminReject.status, 200, 'batch-update returns 200 on admin rejection');
        assert.strictEqual(timeEntriesStore.get('te-batch-1').status, 'admin_rejected');

        const jobAfterReject1 = jobsStore.get(batchJobId);
        assert.strictEqual(jobAfterReject1.actualLaborHours, 4, 'admin_rejected deducts rejected hours from Job');
        assert.strictEqual(jobAfterReject1.actualLaborCost, 200, 'admin_rejected deducts rejected cost from Job');

        // Test transition: approved → rejected (deducts remaining hours & costs)
        // First set te-batch-2 to standard 'approved'
        await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: ['te-batch-2'],
                updates: { status: 'approved' }
            });

        // Then reject it
        const resReject2 = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: ['te-batch-2'],
                updates: { status: 'rejected' }
            });

        assert.strictEqual(resReject2.status, 200, 'batch-update returns 200 on rejection');
        assert.strictEqual(timeEntriesStore.get('te-batch-2').status, 'rejected');

        const jobAfterReject2 = jobsStore.get(batchJobId);
        assert.strictEqual(jobAfterReject2.actualLaborHours, 0, 'rejected deducts all remaining hours');
        assert.strictEqual(jobAfterReject2.actualLaborCost, 0, 'rejected deducts all remaining costs');

        // Fail-closed snapshot on batch-update: if pre-fetch fails, abort with 500 without updating records
        let throwBatchUpdateFind = true;
        const origFind = mockTimeEntriesColl.find;
        mockTimeEntriesColl.find = (filter) => {
            if (throwBatchUpdateFind && filter?.$or?.some(c => c.id?.$in?.includes('te-fail-batch-upd'))) {
                throw new Error('Database failure during batch-update pre-fetch snapshot');
            }
            return origFind(filter);
        };

        timeEntriesStore.set('te-fail-batch-upd', {
            id: 'te-fail-batch-upd',
            jobId: batchJobId,
            hours: 5,
            cost: 250,
            status: 'submitted',
            isActive: true
        });

        const resFailSnapshot = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: ['te-fail-batch-upd'],
                updates: { status: 'admin_approved' }
            });

        assert.strictEqual(resFailSnapshot.status, 500, 'Batch-update must fail-closed with 500 if snapshot query fails');
        assert.strictEqual(timeEntriesStore.get('te-fail-batch-upd').status, 'submitted', 'Record must not be modified if snapshot failed');

        throwBatchUpdateFind = false;
        mockTimeEntriesColl.find = origFind;
    });

    await t.test('[P1] Status-only batch-update preserves historical cost and hourlyRate when employee rate changes', async () => {
        const empId = 'emp-rate-change-test';
        employeesStore.set(empId, {
            id: empId,
            name: 'Marek Stawkowy',
            hourlyRate: 50,
            defaultHourlyRate: 50
        });

        const testJobId = 'job-hist-rate-test';
        jobsStore.set(testJobId, {
            id: testJobId,
            jobCode: 'J-HIST-01',
            status: 'in_progress',
            actualLaborHours: 4,
            actualLaborCost: 120,
            settledLaborCost: 0,
            stages: []
        });

        const entryId = 'te-hist-cost-preserve';
        timeEntriesStore.set(entryId, {
            id: entryId,
            jobId: testJobId,
            employeeId: empId,
            hours: 4,
            hourlyRate: 30, // historical rate
            cost: 120,       // historical cost: 4 * 30
            billingType: 'hourly',
            status: 'submitted',
            workerType: 'employee',
            activityType: 'work',
            isActive: true
        });

        // 1. Employee rate increases in database to 100 PLN/h
        employeesStore.get(empId).hourlyRate = 100;
        employeesStore.get(empId).defaultHourlyRate = 100;

        // 2. Admin approves status only via batch-update
        const resApprove = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: [entryId],
                updates: { status: 'approved' }
            });

        assert.strictEqual(resApprove.status, 200);
        assert.strictEqual(resApprove.body.success, true);
        assert.ok(Array.isArray(resApprove.body.items), 'Response returns updated items');
        assert.strictEqual(resApprove.body.items[0].status, 'approved');
        assert.strictEqual(resApprove.body.items[0].cost, 120, 'Historical cost must be preserved in response');
        assert.strictEqual(resApprove.body.items[0].hourlyRate, 30, 'Historical rate must be preserved in response');

        // Check stored document in DB
        const storedEntry = timeEntriesStore.get(entryId);
        assert.strictEqual(storedEntry.status, 'approved');
        assert.strictEqual(storedEntry.cost, 120, 'Historical cost 120 must NOT be recalculated to 400 on status approval');
        assert.strictEqual(storedEntry.hourlyRate, 30, 'Historical hourlyRate 30 must NOT be updated to 100 on status approval');

        // Check Job labor cost aggregation
        const jobAfterApprove = jobsStore.get(testJobId);
        assert.strictEqual(jobAfterApprove.actualLaborCost, 120, 'Job labor cost must reflect historical cost 120');

        // 3. Modifying hours via batch-update DOES trigger authoritative recalculation
        const resHoursUpdate = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: [entryId],
                updates: { hours: 6 }
            });

        assert.strictEqual(resHoursUpdate.status, 200);
        assert.strictEqual(resHoursUpdate.body.items[0].hours, 6);
        assert.strictEqual(resHoursUpdate.body.items[0].cost, 600, 'Changing hours recalculates cost using current employee rate 6 * 100 = 600');
        assert.strictEqual(resHoursUpdate.body.items[0].hourlyRate, 100);

        const storedAfterHours = timeEntriesStore.get(entryId);
        assert.strictEqual(storedAfterHours.cost, 600);
        assert.strictEqual(storedAfterHours.hourlyRate, 100);

        const jobAfterHours = jobsStore.get(testJobId);
        assert.strictEqual(jobAfterHours.actualLaborHours, 6);
        assert.strictEqual(jobAfterHours.actualLaborCost, 600);
    });

    await t.test('[P1] bulkWrite failure simulation: pre-marks aggregationPending and reports partial write status', async () => {
        const failJobId = 'job-bulk-fail-test';
        jobsStore.set(failJobId, {
            id: failJobId,
            jobCode: 'J-FAIL-01',
            status: 'in_progress',
            actualLaborHours: 10,
            actualLaborCost: 500,
            settledLaborCost: 0,
            aggregationPending: false,
            stages: []
        });

        const empId = 'emp-bulk-fail-test';
        employeesStore.set(empId, {
            id: empId,
            name: 'Piotr Testowy',
            hourlyRate: 50
        });

        timeEntriesStore.set('te-bulk-fail-sim-1', {
            id: 'te-bulk-fail-sim-1',
            jobId: failJobId,
            employeeId: empId,
            hours: 3,
            cost: 150,
            status: 'submitted',
            isActive: true
        });

        timeEntriesStore.set('te-bulk-fail-sim-2', {
            id: 'te-bulk-fail-sim-2',
            jobId: failJobId,
            employeeId: empId,
            hours: 4,
            cost: 200,
            status: 'submitted',
            isActive: true
        });

        const resFail = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: ['te-bulk-fail-sim-1', 'te-bulk-fail-sim-2'],
                updates: { status: 'approved' }
            });

        assert.strictEqual(resFail.status, 500, 'Failing bulkWrite must return 500');
        assert.strictEqual(resFail.body.partialSuccess, true, 'Reports partial success');
        assert.deepStrictEqual(resFail.body.succeededIds, ['te-bulk-fail-sim-1']);
        assert.deepStrictEqual(resFail.body.failedIds, ['te-bulk-fail-sim-2']);
        assert.strictEqual(resFail.body.aggregationPending, true, 'Signals aggregationPending: true');
        assert.ok(resFail.body.affectedJobs.includes(failJobId), 'Reports affectedJobs');

        // Verify the job was pre-marked with aggregationPending: true (or handled in recovery)
        const failJobInStore = jobsStore.get(failJobId);
        assert.ok(failJobInStore !== null);
    });

    await t.test('[P1 CAS DELETE] DELETE /api/jobs/:id strictly requires expectedVersion (428), rejects version conflict (409), and atomowo increments version on soft-delete', async () => {
        const jobId = 'job-delete-cas-' + Date.now();
        jobsStore.set(jobId, {
            id: jobId,
            name: 'Zlecenie do Archiwizacji CAS',
            clientId: 'client-1',
            status: 'planned',
            isActive: true,
            editVersion: 1
        });

        // 1. Missing expectedVersion / If-Match returns 428 PRECONDITION_REQUIRED
        const resMissing = await request(app)
            .delete('/api/jobs/' + jobId)
            .set('Authorization', 'Bearer ' + adminToken);
        assert.strictEqual(resMissing.status, 428);
        assert.strictEqual(resMissing.body.code, 'PRECONDITION_REQUIRED');

        // 2. Version conflict: client provides expectedVersion: 2, but DB has editVersion: 1 -> 409
        const resConflict = await request(app)
            .delete('/api/jobs/' + jobId + '?expectedVersion=2')
            .set('Authorization', 'Bearer ' + adminToken);
        assert.strictEqual(resConflict.status, 409);
        assert.strictEqual(resConflict.body.code, 'VERSION_CONFLICT');
        assert.strictEqual(resConflict.body.currentVersion, 1);
        assert.strictEqual(resConflict.body.expectedVersion, 2);

        // 3. Valid expectedVersion via If-Match header -> 200, isActive: false, editVersion increments to 2
        const resOk = await request(app)
            .delete('/api/jobs/' + jobId)
            .set('Authorization', 'Bearer ' + adminToken)
            .set('If-Match', '"1"');
        assert.strictEqual(resOk.status, 200);
        assert.strictEqual(resOk.body.success, true);
        assert.strictEqual(resOk.body.message, 'Item archived');
        assert.strictEqual(resOk.body.editVersion, 2);

        const inDb = jobsStore.get(jobId);
        assert.strictEqual(inDb.isActive, false);
        assert.strictEqual(inDb.editVersion, 2);

        // 4. Repeated DELETE on already archived job -> 404
        const resRepeat = await request(app)
            .delete('/api/jobs/' + jobId + '?expectedVersion=2')
            .set('Authorization', 'Bearer ' + adminToken);
        assert.strictEqual(resRepeat.status, 404);
        assert.match(resRepeat.body.error, /zostało już zarchiwizowane/);

        // 5. DELETE on non-existent job -> 404
        const resNonExistent = await request(app)
            .delete('/api/jobs/job-does-not-exist?expectedVersion=1')
            .set('Authorization', 'Bearer ' + adminToken);
        assert.strictEqual(resNonExistent.status, 404);
    });

    await t.test('[P1 ATOMIC] POST /api/jobs/create-atomic creates sequence code, Job, and stageItems in one atomic domain operation', async () => {
        const idempKey = 'idemp-job-create-' + Date.now();
        const year = new Date().getFullYear();

        const payload = {
            job: {
                name: 'Kompleksowe Zlecenie Szklane',
                clientId: 'client-1',
                status: 'planned',
                revenuePlannedNet: 25000,
                stages: [
                    { id: 'stage-1', name: 'Projekt', plannedRevenueNet: 5000, plannedCostNet: 2000 },
                    { id: 'stage-2', name: 'Montaż', plannedRevenueNet: 20000, plannedCostNet: 10000 }
                ]
            },
            stageItems: [
                { id: 'item-1', stageId: 'stage-2', constructionName: 'Witryna W1', quantityInStage: 4 },
                { id: 'item-2', stageId: 'stage-2', constructionName: 'Drzwi D1', quantityInStage: 2 }
            ],
            idempotencyKey: idempKey
        };

        // 1. Initial creation
        const res = await request(app)
            .post('/api/jobs/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send(payload);

        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.job);
        assert.strictEqual(res.body.job.name, 'Kompleksowe Zlecenie Szklane');
        assert.strictEqual(res.body.job.editVersion, 1);
        assert.strictEqual(res.body.job.isActive, true);
        assert.strictEqual(res.body.job.actualLaborHours, 0);
        assert.strictEqual(res.body.job.actualLaborCost, 0);
        assert.match(res.body.job.jobCode, new RegExp('^CF-' + year + '-\\d{3}$'));
        assert.strictEqual(res.body.stageItemsCount, 2);

        const createdJobId = res.body.job.id;
        assert.ok(jobsStore.has(createdJobId), 'Job must exist in jobs store');
        assert.ok(stageItemsStore.has('item-1'), 'item-1 must exist in stageItems store');
        assert.ok(stageItemsStore.has('item-2'), 'item-2 must exist in stageItems store');
        assert.strictEqual(stageItemsStore.get('item-1').jobId, createdJobId);

        // 2. Replay with identical payload and same Idempotency-Key -> 201 replay from cache
        const resReplay = await request(app)
            .post('/api/jobs/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send(payload);

        assert.strictEqual(resReplay.status, 201);
        assert.strictEqual(resReplay.body.job.id, createdJobId);
        assert.strictEqual(resReplay.body.job.jobCode, res.body.job.jobCode);

        // 3. Replay with different payload and same Idempotency-Key -> 409 conflict
        const resConflict = await request(app)
            .post('/api/jobs/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send({
                ...payload,
                job: { ...payload.job, name: 'Zmieniona Inna Nazwa Zlecenia' }
            });

        assert.strictEqual(resConflict.status, 409);
        assert.match(resConflict.body.error, /Klucz idempotencji został już użyty dla żądania o innym payloadzie/);

        // 4. Missing required name or clientId rejects with 400
        const resInvalid = await request(app)
            .post('/api/jobs/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-invalid-' + Date.now())
            .send({
                job: { clientId: 'client-1' } // missing name
            });
        assert.strictEqual(resInvalid.status, 400);
        assert.match(resInvalid.body.error, /name jest wymagane/);
    });


    await t.test('[P1 CAS CONCURRENCY] Concurrent PATCH updates on same Job: Request A wins (200), Request B fails CAS version check (409 VERSION_CONFLICT)', async () => {
        const testJobId = 'job-patch-cas-concurrency-test';
        jobsStore.set(testJobId, {
            id: testJobId,
            name: 'Zlecenie Przed Wyścigiem',
            clientId: 'client-1',
            status: 'planned',
            editVersion: 1,
            actualLaborCost: 0
        });

        // Synchronization barrier:
        // Request B starts with expectedVersion: 1, pauses right before atomic updateOne.
        // Request A executes with expectedVersion: 1 and commits (editVersion becomes 2).
        // Request B is released and executes updateOne with stale expectedVersion: 1, failing CAS.
        let releaseB = null;
        let bReachedBarrier = null;
        const bArrivedPromise = new Promise(resolve => { bReachedBarrier = resolve; });
        const releaseBPromise = new Promise(resolve => { releaseB = resolve; });

        let isRequestB = false;
        setTestBarrierHook(async ({ id, stage }) => {
            if (id === testJobId && stage === 'before-cas-update' && isRequestB) {
                bReachedBarrier();
                await releaseBPromise;
            }
        });

        try {
            // Start Request B with expectedVersion: 1
            isRequestB = true;
            const reqBPromise = (async () => request(app)
                .patch(`/api/jobs/${testJobId}`)
                .set('Authorization', 'Bearer ' + adminToken)
                .send({ expectedVersion: 1, name: 'Zlecenie Zaktualizowane przez B', priority: 'high' }))();

            // Wait for Request B to reach the barrier before CAS update
            await bArrivedPromise;

            // Run Request A with expectedVersion: 1 while B is paused
            isRequestB = false;
            const resA = await request(app)
                .patch(`/api/jobs/${testJobId}`)
                .set('Authorization', 'Bearer ' + adminToken)
                .send({ expectedVersion: 1, name: 'Zlecenie Zaktualizowane przez A', priority: 'low' });

            assert.strictEqual(resA.status, 200, 'Request A must succeed with 200');
            assert.strictEqual(resA.body.editVersion, 2, 'Request A must bump editVersion to 2');

            // Release Request B so it attempts updateOne with stale expectedVersion: 1
            releaseB();
            const resB = await reqBPromise;

            assert.strictEqual(resB.status, 409, 'Request B must be rejected with 409 VERSION_CONFLICT');
            assert.strictEqual(resB.body.code, 'VERSION_CONFLICT');
            assert.strictEqual(resB.body.expectedVersion, 1);
            assert.strictEqual(resB.body.currentVersion, 2);

            // Verify database state: winning update persisted, editVersion is 2
            const finalDoc = jobsStore.get(testJobId);
            assert.strictEqual(finalDoc.editVersion, 2, 'Final job document must have editVersion: 2');
            assert.strictEqual(finalDoc.name, 'Zlecenie Zaktualizowane przez A', 'Winning change must be preserved');

            // Subsequent third request with expectedVersion: 2 succeeds and bumps to 3
            const resC = await request(app)
                .patch(`/api/jobs/${testJobId}`)
                .set('Authorization', 'Bearer ' + adminToken)
                .send({ expectedVersion: 2, status: 'in_progress' });
            assert.strictEqual(resC.status, 200);
            assert.strictEqual(resC.body.editVersion, 3);
            assert.strictEqual(jobsStore.get(testJobId).editVersion, 3);
        } finally {
            setTestBarrierHook(null);
        }
    });

    await t.test('[P1 CAS CONCURRENCY] Batch import race: duplicate ID conflict triggers all-or-nothing rollback (409 BATCH_IMPORT_VERSION_CONFLICT, succeeded: 0)', async () => {
        const item1Id = 'job-batch-race-item1';
        const item2Id = 'job-batch-race-item2';

        // Pre-condition: neither item1 nor item2 exist in jobsStore at start
        jobsStore.delete(item1Id);
        jobsStore.delete(item2Id);

        // Synchronization hook:
        // When batch-import reaches 'before-batch-bulkwrite', simulate another client concurrently creating item2
        setTestBarrierHook(async ({ items, stage }) => {
            if (stage === 'before-batch-bulkwrite' && items?.some(i => i.id === item1Id)) {
                jobsStore.set(item2Id, {
                    id: item2Id,
                    name: 'Zlecenie Utworzone Równolegle przez Innego Klienta',
                    clientId: 'client-1',
                    editVersion: 1
                });
            }
        });

        try {
            const res = await request(app)
                .post('/api/jobs/batch-import')
                .set('Authorization', 'Bearer ' + adminToken)
                .send({
                    items: [
                        { id: item1Id, name: 'Zlecenie Nowe 1', clientId: 'client-1' },
                        { id: item2Id, name: 'Zlecenie Konfliktujące 2', clientId: 'client-1' }
                    ]
                });

            // In transactional all-or-nothing semantics, any conflict aborts withTransaction and rolls back all writes!
            assert.strictEqual(res.status, 409, 'Batch write with duplicate conflict must fail with 409 (all-or-nothing rollback)');
            assert.strictEqual(res.body.code, 'BATCH_IMPORT_VERSION_CONFLICT');
            assert.strictEqual(res.body.succeeded, 0, 'Zero items must succeed due to all-or-nothing transaction rollback');
            assert.strictEqual(res.body.failed, 2, 'All items marked failed');
            assert.deepStrictEqual(res.body.succeededIds, []);
            assert.deepStrictEqual(res.body.failedIds, [item1Id, item2Id]);

            // Database assertions:
            // 1. item1 was NOT persisted due to transaction rollback!
            const item1InDb = jobsStore.get(item1Id);
            assert.strictEqual(item1InDb, undefined, 'item1 must NOT be persisted in database after rollback');

            // 2. item2 was NOT overwritten by batch payload; retains the concurrent winner's data
            const item2InDb = jobsStore.get(item2Id);
            assert.ok(item2InDb);
            assert.strictEqual(item2InDb.name, 'Zlecenie Utworzone Równolegle przez Innego Klienta', 'Concurrent job must not be overwritten');
            assert.strictEqual(item2InDb.editVersion, 1);
        } finally {
            setTestBarrierHook(null);
        }
    });

    await t.test('[P1 PRODUCTION FAIL-CLOSED] POST /api/jobs/batch-import strictly fails closed with 503 TRANSACTIONS_REQUIRED in production when Replica Set is not available', async () => {
        const prevEnv = process.env.NODE_ENV;
        const prevAllow = process.env.ALLOW_NON_TRANSACTIONAL;
        delete process.env.ALLOW_NON_TRANSACTIONAL;
        process.env.NODE_ENV = 'production';

        try {
            const res = await request(app)
                .post('/api/jobs/batch-import')
                .set('Authorization', 'Bearer ' + adminToken)
                .send({
                    items: [
                        { id: 'job-prod-fail-1', name: 'Zlecenie Produkcyjne Batch Bez RS 1', clientId: 'client-1' },
                        { id: 'job-prod-fail-2', name: 'Zlecenie Produkcyjne Batch Bez RS 2', clientId: 'client-1' }
                    ]
                });

            assert.strictEqual(res.status, 503, 'Must reject with 503 in production without replica set');
            assert.strictEqual(res.body.code, 'TRANSACTIONS_REQUIRED');
            assert.match(res.body.error, /wymaga włączonego Replica Set/);
        } finally {
            process.env.NODE_ENV = prevEnv;
            if (prevAllow !== undefined) process.env.ALLOW_NON_TRANSACTIONAL = prevAllow;
        }
    });

    await t.test('[P1 PRODUCTION FAIL-CLOSED] POST /api/jobs strictly fails closed with 503 TRANSACTIONS_REQUIRED in production when Replica Set is not available', async () => {
        const prevEnv = process.env.NODE_ENV;
        const prevAllow = process.env.ALLOW_NON_TRANSACTIONAL;
        delete process.env.ALLOW_NON_TRANSACTIONAL;
        process.env.NODE_ENV = 'production';

        try {
            const res = await request(app)
                .post('/api/jobs')
                .set('Authorization', 'Bearer ' + adminToken)
                .send({
                    name: 'Zlecenie Produkcyjne Bez Replica Set',
                    clientId: 'client-1',
                    status: 'planned'
                });

            assert.strictEqual(res.status, 503, 'Must reject with 503 in production without replica set');
            assert.strictEqual(res.body.code, 'TRANSACTIONS_REQUIRED');
            assert.match(res.body.error, /wymaga włączonego Replica Set/);
        } finally {
            process.env.NODE_ENV = prevEnv;
            if (prevAllow !== undefined) process.env.ALLOW_NON_TRANSACTIONAL = prevAllow;
        }
    });

    await t.test('[P1 BATCH IMPORT] POST /api/jobs/batch-import does not swallow counter update failure (fails closed with 500)', async () => {
        setTestFailpoint('batch_job_counter_failure');
        try {
            const res = await request(app)
                .post('/api/jobs/batch-import')
                .set('Authorization', 'Bearer ' + adminToken)
                .send({
                    items: [
                        { id: 'job-counter-fail-mock', name: 'Zlecenie Mock Counter Fail', clientId: 'client-1', jobCode: 'CF-2026-777' }
                    ]
                });

            assert.strictEqual(res.status, 500, 'Must return 500 when counter update fails');
            assert.match(res.body.errors ? res.body.errors.join(' ') : (res.body.error || ''), /Simulated counter update failure/);
        } finally {
            setTestFailpoint(null);
        }
    });

    await t.test('automated generation guard: verifies job.generated.ts is strictly up to date with job.schema.json', () => {
        const rootDir = path.resolve(__dirname, '../..');
        const output = execSync('node scripts/generate-contracts.cjs --check', {
            cwd: rootDir,
            encoding: 'utf8'
        });
        assert.match(output, /Generated contracts are strictly up to date/);
    });
});
