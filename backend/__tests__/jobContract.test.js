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
    reconcilePendingJobAggregates
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
            return jobsStore.get(id) || null;
        },
        find: (filter) => {
            const cursor = {
                skip: () => cursor,
                limit: () => cursor,
                toArray: async () => Array.from(jobsStore.values())
            };
            return cursor;
        },
        insertOne: async (doc) => {
            jobsStore.set(doc.id, { ...doc });
            return { insertedId: doc.id };
        },
        updateOne: async (filter, update) => {
            const id = filter.id || (filter.$or ? filter.$or[0].id : null);
            const existing = jobsStore.get(id);
            if (!existing) return { matchedCount: 0, modifiedCount: 0 };
            if (update.$set) Object.assign(existing, update.$set);
            return { matchedCount: 1, modifiedCount: 1 };
        },
        bulkWrite: async (ops) => {
            let count = 0;
            for (const op of ops) {
                if (op.updateOne) {
                    const id = op.updateOne.filter.id;
                    const doc = jobsStore.get(id) || { id };
                    if (op.updateOne.update.$set) Object.assign(doc, op.updateOne.update.$set);
                    if (op.updateOne.update.$setOnInsert && !jobsStore.has(id)) Object.assign(doc, op.updateOne.update.$setOnInsert);
                    jobsStore.set(id, doc);
                    count++;
                }
            }
            return { upsertedCount: count, modifiedCount: 0, matchedCount: 0 };
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
                    const match = filter.$or.some(c => (c.jobId && e.jobId === c.jobId) || (c.project_id && e.project_id === c.project_id));
                    if (!match) return false;
                }
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
            const id = filter.$or ? filter.$or[0].id : filter.id;
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
            return { matchedCount: 1, modifiedCount: 1 };
        },
        deleteOne: async (filter) => {
            const id = filter.id || (filter.$or ? filter.$or[0].id : null);
            const existed = timeEntriesStore.delete(id);
            return { deletedCount: existed ? 1 : 0 };
        },
        bulkWrite: async (ops) => {
            let count = 0;
            for (const op of ops) {
                if (op.updateOne) {
                    const id = op.updateOne.filter.id;
                    const doc = timeEntriesStore.get(id) || { id };
                    if (op.updateOne.update.$set) Object.assign(doc, op.updateOne.update.$set);
                    if (op.updateOne.update.$setOnInsert && !timeEntriesStore.has(id)) Object.assign(doc, op.updateOne.update.$setOnInsert);
                    timeEntriesStore.set(id, doc);
                    count++;
                }
            }
            return { upsertedCount: count, modifiedCount: 0, matchedCount: 0 };
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

    const mockDb = {
        collection: (name) => {
            if (name === 'jobs') return mockJobsColl;
            if (name === 'clients') return mockClientsColl;
            if (name === 'time-entries') return mockTimeEntriesColl;
            if (name === 'settlements') return mockSettlementsColl;
            if (name === 'employees') return mockEmployeesColl;
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
                priority: 'high'
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
            .send({ name: '' });
        assert.strictEqual(resEmptyName.status, 400);
        assert.match(resEmptyName.body.error, /Pole name nie może być puste/);

        // Clearing clientId with empty string
        const resEmptyClient = await request(app)
            .patch('/api/jobs/job-101')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ clientId: '   ' });
        assert.strictEqual(resEmptyClient.status, 400);
        assert.match(resEmptyClient.body.error, /Pole clientId nie może być puste/);

        // Non-existent job
        const resNotFound = await request(app)
            .patch('/api/jobs/job-not-existing')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ priority: 'low' });
        assert.strictEqual(resNotFound.status, 404);
        assert.match(resNotFound.body.error, /Zlecenie o identyfikatorze 'job-not-existing' nie istnieje/);

        // Valid update
        const resValid = await request(app)
            .patch('/api/jobs/job-101')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ status: 'in_progress', priority: 'high' });
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


    await t.test('[P1] batch upsert of existing job unconditionally preserves its actual costs and stage actuals', async () => {
        // Seed existing job with accumulated labor and stage actuals
        jobsStore.set('job-batch-preserve', {
            id: 'job-batch-preserve',
            name: 'Stare Zlecenie',
            clientId: 'client-1',
            status: 'in_progress',
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

        // Client imports batch update containing existing job with zero/missing actuals
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
                        actualLaborCost: 0, // Client tries to send 0
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

        assert.strictEqual(resBatch.status, 200);
        assert.strictEqual(resBatch.body.succeeded, 1);

        const persisted = jobsStore.get('job-batch-preserve');
        assert.strictEqual(persisted.name, 'Zaktualizowane Zlecenie Batch');
        assert.strictEqual(persisted.priority, 'high');
        assert.strictEqual(persisted.actualLaborHours, 120, 'Batch upsert must preserve existing actualLaborHours');
        assert.strictEqual(persisted.actualLaborCost, 7500, 'Batch upsert must preserve existing actualLaborCost');
        assert.strictEqual(persisted.settledLaborCost, 5000, 'Batch upsert must preserve existing settledLaborCost');
        assert.strictEqual(persisted.materialsActualNet, 3200, 'Batch upsert must preserve existing materialsActualNet');
        assert.strictEqual(persisted.stages[0].actualLaborCost, 7500, 'Batch upsert must preserve stage actualLaborCost');
        assert.strictEqual(persisted.stages[0].actualLaborHours, 120, 'Batch upsert must preserve stage actualLaborHours');
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
                priority: 'high'
            });
        assert.strictEqual(resPatchName.status, 200);
        assert.strictEqual(resPatchName.body.clientName, 'Firma Budowlana S.A.', 'Standalone clientName is stripped from PATCH');
        assert.strictEqual(jobsStore.get('job-client-sync').clientName, 'Firma Budowlana S.A.');

        // 3. PATCH with clientId changed to client-2 (individual)
        const resPatchClient = await request(app)
            .patch('/api/jobs/job-client-sync')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                clientId: 'client-2'
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

    await t.test('automated generation guard: verifies job.generated.ts is strictly up to date with job.schema.json', () => {
        const rootDir = path.resolve(__dirname, '../..');
        const output = execSync('node scripts/generate-contracts.cjs --check', {
            cwd: rootDir,
            encoding: 'utf8'
        });
        assert.match(output, /Generated contracts are strictly up to date/);
    });
});
