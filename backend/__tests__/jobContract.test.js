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
    validateJobPaginatedSchema
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

    const mockDb = {
        collection: (name) => {
            if (name === 'jobs') return mockJobsColl;
            if (name === 'clients') return mockClientsColl;
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

        // Now attempt to forge actuals on PATCH
        const resPatch = await request(app)
            .patch('/api/jobs/job-forged-actuals')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                actualLaborCost: 456789,
                settledLaborCost: 123456,
                priority: 'high'
            });

        assert.strictEqual(resPatch.status, 200);
        assert.strictEqual(resPatch.body.priority, 'high');
        // Authoritative 0 must remain; client patch value deleted before MongoDB persistence
        assert.strictEqual(resPatch.body.actualLaborCost, 0, 'PATCH must discard client fabricated actualLaborCost');
        assert.strictEqual(resPatch.body.settledLaborCost, 0, 'PATCH must discard client fabricated settledLaborCost');
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

    await t.test('automated generation guard: verifies job.generated.ts is strictly up to date with job.schema.json', () => {
        const rootDir = path.resolve(__dirname, '../..');
        const output = execSync('node scripts/generate-contracts.cjs --check', {
            cwd: rootDir,
            encoding: 'utf8'
        });
        assert.match(output, /Generated contracts are strictly up to date/);
    });
});
