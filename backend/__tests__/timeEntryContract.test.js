process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const {
    app,
    setDb,
    backfillTimeEntriesWorkerType,
    VALID_TIME_ENTRY_STATUSES,
    WORKER_ALLOWED_TIME_ENTRY_STATUSES,
    FOREMAN_ALLOWED_TIME_ENTRY_STATUSES,
    BILLING_TYPES,
    TIME_ENTRY_TYPES,
    ACTIVITY_TYPES,
    WORKER_TYPES,
    validateTimeEntryPostSchema,
    validateTimeEntryPatchSchema,
    validateTimeEntryBatchSchema
} = require('../server');

const { timeEntrySchema } = require('../../shared/contracts/index.cjs');

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

const foremanToken = jwt.sign(
    { id: 'test-user', role: 'foreman', email: 'foreman@kostiq.pl' },
    'test-secret',
    { expiresIn: '1h' }
);

test('Shared Contracts: TimeEntry JSON Schema, Statuses and Payload Conformity', async (t) => {
    const store = new Map();

    const mockTimeEntriesColl = {
        countDocuments: async () => store.size,
        findOne: async (f) => store.get(f.id) || null,
        find: (filter) => {
            const cursor = {
                skip: () => cursor,
                limit: () => cursor,
                toArray: async () => {
                    if (filter && filter.id && filter.id.$in) {
                        return filter.id.$in.map(id => store.get(id)).filter(Boolean);
                    }
                    return Array.from(store.values());
                }
            };
            return cursor;
        },
        insertOne: async (doc) => {
            store.set(doc.id, { ...doc });
            return { insertedId: doc.id };
        },
        updateOne: async (f, u) => {
            const existing = store.get(f.id);
            if (!existing) return { matchedCount: 0, modifiedCount: 0 };
            if (u.$set) Object.assign(existing, u.$set);
            return { matchedCount: 1, modifiedCount: 1 };
        },
        bulkWrite: async (ops) => {
            let count = 0;
            for (const op of ops) {
                if (op.updateOne) {
                    const id = op.updateOne.filter.id;
                    const doc = store.get(id) || { id };
                    if (op.updateOne.update.$set) Object.assign(doc, op.updateOne.update.$set);
                    if (op.updateOne.update.$setOnInsert && !store.has(id)) Object.assign(doc, op.updateOne.update.$setOnInsert);
                    store.set(id, doc);
                    count++;
                }
            }
            return { upsertedCount: count, modifiedCount: 0, matchedCount: 0 };
        }
    };

    const mockJobsColl = {
        findOne: async (f) => {
            const id = f.$or ? f.$or[0].id : f.id;
            if (id === 'job-db-error') throw new Error('Database job query failure');
            if (id === 'job-not-found' || id === 'j' || id === 'non-existent-job') return null;
            if (id === 'job-closed') return { id: 'job-closed', status: 'done' };
            if (id === 'job-cancelled') return { id: 'job-cancelled', status: 'cancelled' };
            return { id: id || 'job-1', status: 'in_progress' };
        }
    };

    const mockEmployeesColl = {
        find: (f) => ({
            toArray: async () => [
                { id: 'test-user', hourlyRate: 50, dailyRate: 400, projectRate: 1500 },
                { id: 'admin-1', hourlyRate: 50, dailyRate: 400, projectRate: 1500 },
                { id: 'collision-user', hourlyRate: 50, dailyRate: 400, projectRate: 1500 }
            ]
        }),
        findOne: async (f) => {
            const id = f.$or ? f.$or[0].id : f.id;
            if (id === 'emp-db-error') {
                throw new Error('Database query failure');
            }
            if (id === 'emp-not-found' || id === 'emp-and-sub-not-found' || id === 'does-not-exist' || id === 'completely-unknown-entity' || (id && id.startsWith('sub-'))) {
                return null;
            }
            if (id === 'test-user') {
                return { id: 'test-user', hourlyRate: 50, dailyRate: 400, projectRate: 1500 };
            }
            if (id === 'collision-user') {
                return { id: 'collision-user', hourlyRate: 50, dailyRate: 400, projectRate: 1500 };
            }
            return { id: id || 'admin-1', hourlyRate: 50, dailyRate: 400, projectRate: 1500 };
        }
    };

    const mockSubcontractorsColl = {
        find: (f) => ({
            toArray: async () => [
                { id: 'sub-1', rate: 250, defaultHourlyRate: 250, settlementType: 'godzina' },
                { id: 'sub-m2', rate: 80, settlementType: 'm2' },
                { id: 'sub-mb', rate: 60, settlementType: 'mb' },
                { id: 'sub-ryczalt', rate: 5000, settlementType: 'ryczałt' },
                { id: 'collision-user', rate: 250, defaultHourlyRate: 250, settlementType: 'godzina' }
            ]
        }),
        findOne: async (f) => {
            const id = f.$or ? f.$or[0].id : f.id;
            if (id === 'sub-1') {
                return { id: 'sub-1', rate: 250, defaultHourlyRate: 250, settlementType: 'godzina' };
            }
            if (id === 'collision-user') {
                return { id: 'collision-user', rate: 250, defaultHourlyRate: 250, settlementType: 'godzina' };
            }
            if (id === 'sub-m2') {
                return { id: 'sub-m2', rate: 80, settlementType: 'm2' };
            }
            if (id === 'sub-mb') {
                return { id: 'sub-mb', rate: 45, settlementType: 'mb' };
            }
            if (id === 'sub-ryczalt') {
                return { id: 'sub-ryczalt', rate: 1500, settlementType: 'ryczałt' };
            }
            return null;
        }
    };

    const mockDb = {
        collection: (name) => {
            if (name === 'time-entries') return mockTimeEntriesColl;
            if (name === 'jobs') return mockJobsColl;
            if (name === 'employees') return mockEmployeesColl;
            if (name === 'subcontractors') return mockSubcontractorsColl;
            return {
                findOne: async () => null,
                find: () => ({ toArray: async () => [] })
            };
        }
    };

    setDb(mockDb, true);

    await t.test('single source of truth: backend and schema have identical 9 domain statuses', () => {
        const schemaStatuses = timeEntrySchema.definitions.TimeEntryStatus.enum;
        assert.strictEqual(schemaStatuses.length, 9);
        assert.deepStrictEqual(VALID_TIME_ENTRY_STATUSES, schemaStatuses);
        assert.deepStrictEqual(WORKER_ALLOWED_TIME_ENTRY_STATUSES, ['draft', 'pending', 'submitted']);
        assert.deepStrictEqual(FOREMAN_ALLOWED_TIME_ENTRY_STATUSES, ['draft', 'pending', 'submitted', 'foreman_approved', 'foreman_rejected']);
        assert.deepStrictEqual(BILLING_TYPES, ['hourly', 'daily', 'project', 'fixed', 'm2', 'mb']);
        assert.deepStrictEqual(TIME_ENTRY_TYPES, ['drive', 'work', 'other', 'employee', 'subcontractor']);
        assert.deepStrictEqual(ACTIVITY_TYPES, ['drive', 'work', 'other']);
        assert.deepStrictEqual(WORKER_TYPES, ['employee', 'subcontractor']);
    });

    await t.test('every single one of the 9 statuses is accepted when submitted by admin', async () => {
        for (const status of VALID_TIME_ENTRY_STATUSES) {
            const entryId = 'entry-status-' + status;
            const res = await request(app)
                .post('/api/time-entries')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    id: entryId,
                    employeeId: 'admin-1',
                    jobId: 'job-1',
                    status: status,
                    hours: 2,
                    billingType: 'hourly'
                });

            assert.strictEqual(res.status, 201, `Status '${status}' should be accepted with 201 Created`);
            assert.strictEqual(store.get(entryId).status, status);
        }
    });

    await t.test('invalid status like settled or unknown is rejected with 400', async () => {
        const resSettled = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: 'entry-invalid-settled',
                employeeId: 'admin-1',
                jobId: 'job-1',
                status: 'settled',
                hours: 4
            });

        assert.strictEqual(resSettled.status, 400);
        assert.match(resSettled.body.error, /Nieprawidłowy status wpisu czasu/);

        const resUnknown = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: 'entry-invalid-unknown',
                employeeId: 'admin-1',
                jobId: 'job-1',
                status: 'bogus_status',
                hours: 4
            });

        assert.strictEqual(resUnknown.status, 400);
    });

    await t.test('worker attempting higher-privilege status (approved/admin_approved) is coerced to submitted', async () => {
        const entryId = 'worker-tamper-status';
        const res = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${workerToken}`)
            .set('x-test-role', 'worker')
            .send({
                id: entryId,
                employeeId: 'test-user',
                jobId: 'job-1',
                status: 'admin_approved',
                hours: 5
            });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(store.get(entryId).status, 'submitted', 'Worker status should be coerced to submitted');
    });

    await t.test('POST payload variants: validates required fields, hours bounds, and calendar correctness', async () => {
        // Missing employeeId
        const resMissingEmp = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ jobId: 'job-1', hours: 4 });
        assert.strictEqual(resMissingEmp.status, 400);
        assert.match(resMissingEmp.body.error, /employeeId jest wymagane/);

        // Missing jobId
        const resMissingJob = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ employeeId: 'admin-1', hours: 4 });
        assert.strictEqual(resMissingJob.status, 400);
        assert.match(resMissingJob.body.error, /jobId jest wymagane/);

        // Negative hours
        const resNegHours = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ employeeId: 'admin-1', jobId: 'job-1', hours: -1 });
        assert.strictEqual(resNegHours.status, 400);
        assert.match(resNegHours.body.error, /Godziny nie mogą być ujemne/);

        // Hours > 24
        const resOverHours = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ employeeId: 'admin-1', jobId: 'job-1', hours: 25 });
        assert.strictEqual(resOverHours.status, 400);
        assert.match(resOverHours.body.error, /Godziny nie mogą przekraczać 24h/);

        // Invalid calendar date
        const resBadCal = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ employeeId: 'admin-1', jobId: 'job-1', date: '2026-02-31' });
        assert.strictEqual(resBadCal.status, 400);
        assert.match(resBadCal.body.error, /Nieprawidłowa data kalendarzowa/);
    });

    await t.test('PATCH payload variant: updates fields without requiring employeeId and jobId', async () => {
        store.set('entry-for-patch', {
            id: 'entry-for-patch',
            employeeId: 'admin-1',
            jobId: 'job-1',
            status: 'draft',
            hours: 4,
            cost: 200,
            updatedAt: '2026-09-30T10:00:00Z'
        });

        const resPatch = await request(app)
            .patch('/api/time-entries/entry-for-patch')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                hours: 6,
                description: 'Updated description'
            });

        assert.strictEqual(resPatch.status, 200);
        const patched = store.get('entry-for-patch');
        assert.strictEqual(patched.hours, 6);
        assert.strictEqual(patched.description, 'Updated description');
    });


    await t.test('fail-closed Ajv validation: rejects invalid billingType, invalid type, and string hours', async () => {
        // Valid daily billingType (now officially supported)
        const resDaily = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: 'entry-valid-daily',
                employeeId: 'admin-1',
                jobId: 'job-1',
                billingType: 'daily',
                hours: 1, // 1 day
                cost: 400
            });
        assert.strictEqual(resDaily.status, 201, 'Valid billingType daily should be accepted with 201');

        // Invalid billingType: nonsense
        const resBadBilling = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: 'entry-bad-billing',
                employeeId: 'admin-1',
                jobId: 'job-1',
                billingType: 'nonsense',
                hours: 8
            });
        assert.strictEqual(resBadBilling.status, 400, 'Invalid billingType MUST be rejected with 400');
        assert.match(resBadBilling.body.error, /Nieprawidłowy typ rozliczenia/);

        // Invalid type: nonsense
        const resBadType = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: 'entry-bad-type',
                employeeId: 'admin-1',
                jobId: 'job-1',
                type: 'nonsense',
                hours: 8
            });
        assert.strictEqual(resBadType.status, 400, 'Invalid type MUST be rejected with 400');
        assert.match(resBadType.body.error, /Nieprawidłowy typ wpisu/);

        // String hours: "8" instead of number
        const resStringHours = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: 'entry-string-hours',
                employeeId: 'admin-1',
                jobId: 'job-1',
                hours: "8"
            });
        assert.strictEqual(resStringHours.status, 400, 'String hours MUST be rejected with 400');
        assert.match(resStringHours.body.error, /hours/);
    });

    await t.test('batch import validation: requires items array and validates batch schema', async () => {
        // Missing items array (e.g. legacy entries: [...])
        const resMissingItems = await request(app)
            .post('/api/time-entries/batch-import')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ entries: [{ employeeId: 'admin-1', jobId: 'job-1' }] });
        assert.strictEqual(resMissingItems.status, 400, 'Batch import without items array must return 400');
        assert.match(resMissingItems.body.error, /items/);

        // Batch with invalid item (negative hours)
        const resInvalidBatchItem = await request(app)
            .post('/api/time-entries/batch-import')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                items: [
                    { id: 'b-bad-1', employeeId: 'admin-1', jobId: 'job-1', hours: -5 }
                ]
            });
        assert.strictEqual(resInvalidBatchItem.status, 400, 'Batch with schema-invalid items must return 400');
    });

    await t.test('batch import payload: imports multiple valid entries and computes costs', async () => {
        const batchEntries = [
            { id: 'batch-c-1', employeeId: 'admin-1', jobId: 'job-1', hours: 3, date: '2026-09-29' },
            { id: 'batch-c-2', employeeId: 'admin-1', jobId: 'job-1', hours: 4, date: '2026-09-29' }
        ];

        const resBatch = await request(app)
            .post('/api/time-entries/batch-import')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ items: batchEntries });

        assert.strictEqual(resBatch.status, 200);
        assert.strictEqual(resBatch.body.status, 'success');
        assert.strictEqual(resBatch.body.succeeded, 2);
        assert.strictEqual(resBatch.body.failed, 0);
        assert.strictEqual(store.get('batch-c-1').cost, 150); // 3h * 50 PLN/h
        assert.strictEqual(store.get('batch-c-2').cost, 200); // 4h * 50 PLN/h
    });
    await t.test('server authoritative cost calculation: recalculates daily and project costs, preventing client fabrication', async () => {
        // Daily: employee has dailyRate 400, client submits cost: 999999 and hours: 2 (2 days)
        const resDaily = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: 'entry-cost-daily',
                employeeId: 'admin-1',
                jobId: 'job-1',
                billingType: 'daily',
                hours: 2,
                cost: 999999
            });

        assert.strictEqual(resDaily.status, 201);
        const storedDaily = store.get('entry-cost-daily');
        assert.strictEqual(storedDaily.cost, 800, 'Daily cost MUST be recalculated as hours * dailyRate (2 * 400 = 800), ignoring client 999999');
        assert.strictEqual(storedDaily.hourlyRate, 400);

        // Project: employee has projectRate 1500, client submits cost: 999999
        const resProject = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: 'entry-cost-project',
                employeeId: 'admin-1',
                jobId: 'job-1',
                billingType: 'project',
                hours: 0,
                cost: 999999
            });

        assert.strictEqual(resProject.status, 201);
        const storedProject = store.get('entry-cost-project');
        assert.strictEqual(storedProject.cost, 1500, 'Project cost MUST be recalculated as projectRate (1500), ignoring client 999999');
        assert.strictEqual(storedProject.hourlyRate, 1500);
    });

    await t.test('fail-closed rate lookup: aborts save on employee lookup error (500) or missing employee (404)', async () => {
        // DB error during employee rate lookup
        const resDbError = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: 'entry-db-error',
                employeeId: 'emp-db-error',
                jobId: 'job-1',
                billingType: 'daily',
                hours: 1,
                cost: 999999
            });

        assert.strictEqual(resDbError.status, 500);
        assert.strictEqual(store.has('entry-db-error'), false, 'Record MUST NOT be saved when rate lookup fails');

        // Non-existent employee
        const resNotFound = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: 'entry-not-found',
                employeeId: 'emp-not-found',
                jobId: 'job-1',
                billingType: 'daily',
                hours: 1,
                cost: 999999
            });

        assert.strictEqual(resNotFound.status, 404);
        assert.strictEqual(store.has('entry-not-found'), false, 'Record MUST NOT be saved for non-existent employee');
    });

    await t.test('empty POST payload {} is strictly rejected by Ajv schema', async () => {
        const resEmpty = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({});

        assert.strictEqual(resEmpty.status, 400);
        assert.match(resEmpty.body.error, /employeeId jest wymagane/);
    });
    await t.test('[P1] PATCH authoritative cost recalculation: worker cannot forge cost and changing hours recalculates cost', async () => {
        // Setup initial daily entry for test-user (worker): 1 day (hours: 1), dailyRate: 400, cost: 400
        store.set('worker-entry-patch', {
            id: 'worker-entry-patch',
            employeeId: 'test-user',
            jobId: 'job-1',
            billingType: 'daily',
            hours: 1,
            cost: 400,
            hourlyRate: 400,
            status: 'submitted',
            updatedAt: '2026-09-30T10:00:00Z'
        });

        // 1. Worker tries to forge cost: PATCH { cost: 999999 } without changing hours
        const resForgeCost = await request(app)
            .patch('/api/time-entries/worker-entry-patch')
            .set('Authorization', `Bearer ${workerToken}`)
            .send({ cost: 999999 });

        assert.strictEqual(resForgeCost.status, 200);
        const storedAfterForge = store.get('worker-entry-patch');
        assert.strictEqual(storedAfterForge.cost, 400, 'Worker forged cost must be overwritten with authoritative cost 400');
        assert.strictEqual(resForgeCost.body.cost, 400);

        // 2. Worker updates hours: PATCH { hours: 2 } on daily entry (dailyRate 400)
        const resChangeHours = await request(app)
            .patch('/api/time-entries/worker-entry-patch')
            .set('Authorization', `Bearer ${workerToken}`)
            .send({ hours: 2 });

        assert.strictEqual(resChangeHours.status, 200);
        const storedAfterHours = store.get('worker-entry-patch');
        assert.strictEqual(storedAfterHours.hours, 2);
        assert.strictEqual(storedAfterHours.cost, 800, 'Changing hours from 1 to 2 on daily entry must recalculate cost to 800 (2 * 400)');
        assert.strictEqual(resChangeHours.body.cost, 800);
        assert.strictEqual(resChangeHours.body.hours, 2);
    });

    await t.test('[P1] Legacy alias normalization: employee_id and project_id are normalized and deleted before MongoDB persistence', async () => {
        // 1. Single POST with legacy aliases
        const legacyPostPayload = {
            id: 'entry-legacy-post',
            employee_id: 'admin-1',
            project_id: 'job-1',
            hours: 2,
            cost: 100,
            billingType: 'hourly'
        };

        const resPost = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(legacyPostPayload);

        assert.strictEqual(resPost.status, 201);
        const storedPost = store.get('entry-legacy-post');
        assert.strictEqual(storedPost.employeeId, 'admin-1');
        assert.strictEqual(storedPost.jobId, 'job-1');
        assert.strictEqual(storedPost.employee_id, undefined, 'employee_id MUST NOT be saved in database');
        assert.strictEqual(storedPost.project_id, undefined, 'project_id MUST NOT be saved in database');

        // 2. Batch import with legacy aliases
        const batchWithAliases = [
            { id: 'batch-alias-1', employee_id: 'admin-1', project_id: 'job-1', hours: 3 },
            { id: 'batch-alias-2', employee_id: 'admin-1', project_id: 'job-1', hours: 4 }
        ];

        const resBatch = await request(app)
            .post('/api/time-entries/batch-import')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ items: batchWithAliases });

        assert.strictEqual(resBatch.status, 200);
        const storedBatch1 = store.get('batch-alias-1');
        assert.strictEqual(storedBatch1.employeeId, 'admin-1');
        assert.strictEqual(storedBatch1.jobId, 'job-1');
        assert.strictEqual(storedBatch1.employee_id, undefined, 'Batch item employee_id MUST NOT exist in database');
        assert.strictEqual(storedBatch1.project_id, undefined, 'Batch item project_id MUST NOT exist in database');

        // 3. PATCH with legacy alias project_id
        const resPatch = await request(app)
            .patch('/api/time-entries/entry-legacy-post')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ project_id: 'job-2' });

        assert.strictEqual(resPatch.status, 200);
        const storedPatch = store.get('entry-legacy-post');
        assert.strictEqual(storedPatch.jobId, 'job-2');
        assert.strictEqual(storedPatch.project_id, undefined, 'PATCH project_id MUST NOT be saved in database');
    });

    await t.test('[P1 & P2] Subcontractor domain rates, settlementType mapping, and mismatch validation', async () => {
        // 1. Hourly subcontractor entry: sub-1 has rate 250 PLN/h and settlementType 'godzina'
        const resSubHourly = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: 'entry-sub-hourly',
                employeeId: 'sub-1',
                jobId: 'job-1',
                type: 'subcontractor',
                billingType: 'hourly',
                hours: 4
            });

        assert.strictEqual(resSubHourly.status, 201);
        const storedSubHourly = store.get('entry-sub-hourly');
        assert.strictEqual(storedSubHourly.cost, 1000, 'Subcontractor hourly cost must be 4 * 250 = 1000 PLN');
        assert.strictEqual(storedSubHourly.hourlyRate, 250);

        // 2. Ryczałt subcontractor entry: sub-ryczalt has rate 1500 PLN and settlementType 'ryczałt'
        // Test defaulting: omitted billingType automatically defaults to 'project'
        const resSubProjectDefault = await request(app)
            .post('/api/time-entries')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                id: 'entry-sub-project-default',
                employeeId: 'sub-ryczalt',
                jobId: 'job-1',
                hours: 0
            });

        assert.strictEqual(resSubProjectDefault.status, 201);
        const storedSubProjectDefault = store.get('entry-sub-project-default');
        assert.strictEqual(storedSubProjectDefault.billingType, 'project', 'Omitting billingType for ryczałt sub must default to project');
        assert.strictEqual(storedSubProjectDefault.cost, 1500, 'Subcontractor project cost must be 1500 PLN');
        assert.strictEqual(storedSubProjectDefault.hourlyRate, 1500);
        assert.strictEqual(storedSubProjectDefault.workerType, 'subcontractor');

        // Submitting mismatched billingType (e.g. hourly for ryczałt sub) must be rejected with 400
        const resSubProjectMismatch = await request(app)
            .post('/api/time-entries')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                id: 'entry-sub-project-mismatch',
                employeeId: 'sub-ryczalt',
                jobId: 'job-1',
                billingType: 'hourly',
                hours: 4
            });
        assert.strictEqual(resSubProjectMismatch.status, 400);
        assert.match(resSubProjectMismatch.body.error, /typ rozliczenia 'hourly'/);

        // 3. m2 subcontractor entry: sub-m2 has rate 80 PLN/m2 and settlementType 'm2'
        const resSubM2 = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: 'entry-sub-m2',
                employeeId: 'sub-m2',
                jobId: 'job-1',
                type: 'subcontractor',
                billingType: 'm2',
                quantity: 10
            });

        assert.strictEqual(resSubM2.status, 201);
        const storedSubM2 = store.get('entry-sub-m2');
        assert.strictEqual(storedSubM2.cost, 800, 'Subcontractor m2 cost must be 10 * 80 = 800 PLN');
        assert.strictEqual(storedSubM2.rate, 80);

        // 4. Mismatch validation: sub-m2 (settlementType 'm2') submitted with billingType 'hourly' MUST be rejected with 400
        const resMismatch = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: 'entry-sub-mismatch',
                employeeId: 'sub-m2',
                jobId: 'job-1',
                type: 'subcontractor',
                billingType: 'hourly',
                hours: 4
            });

        assert.strictEqual(resMismatch.status, 400, 'Mismatched settlementType (m2 sub billed as hourly) MUST return 400');
        assert.match(resMismatch.body.error, /typ rozliczenia 'hourly'/);

        // 5. Unknown entity in both employees and subcontractors returns 404
        const resNotFound = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: 'entry-unknown-both',
                employeeId: 'emp-and-sub-not-found',
                jobId: 'job-1',
                hours: 2
            });

        assert.strictEqual(resNotFound.status, 404);
        assert.match(resNotFound.body.error, /Pracownik lub podwykonawca/);
    });

    await t.test('[P1] Non-existent employee with client rate in m2/mb/fixed is rejected with 404 (no orphaned records)', async () => {
        const resOrphan = await request(app)
            .post('/api/time-entries')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                id: 'orphan-entry-test',
                employeeId: 'does-not-exist',
                jobId: 'job-1',
                type: 'subcontractor',
                billingType: 'm2',
                quantity: 10,
                rate: 80
            });

        assert.strictEqual(resOrphan.status, 404, 'Must reject with 404 even if client provided rate/unitPrice');
        assert.match(resOrphan.body.error, /Pracownik lub podwykonawca/);
        assert.strictEqual(store.has('orphan-entry-test'), false, 'Orphaned record must NEVER be saved in database');
    });

    await t.test('[P1] PATCH quantity or rate on m2/mb entries recalculates cost authoritatively', async () => {
        // Setup initial m2 entry: 10 m2 at 80 PLN/m2 = 800 PLN
        store.set('m2-patch-test', {
            id: 'm2-patch-test',
            employeeId: 'sub-m2',
            jobId: 'job-1',
            type: 'subcontractor',
            billingType: 'm2',
            quantity: 10,
            rate: 80,
            cost: 800,
            status: 'submitted',
            updatedAt: '2026-09-30T10:00:00Z'
        });

        // 1. PATCH quantity: { quantity: 20 } -> cost must become 20 * 80 = 1600
        const resPatchQty = await request(app)
            .patch('/api/time-entries/m2-patch-test')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ quantity: 20 });

        assert.strictEqual(resPatchQty.status, 200);
        const storedAfterQty = store.get('m2-patch-test');
        assert.strictEqual(storedAfterQty.quantity, 20);
        assert.strictEqual(storedAfterQty.cost, 1600, 'PATCH quantity 20 must recalculate cost to 1600 (20 * 80)');
        assert.strictEqual(resPatchQty.body.cost, 1600);

        // 2. PATCH rate: { rate: 100 } -> cost must become 20 * 100 = 2000
        const resPatchRate = await request(app)
            .patch('/api/time-entries/m2-patch-test')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ rate: 100 });

        assert.strictEqual(resPatchRate.status, 200);
        const storedAfterRate = store.get('m2-patch-test');
        assert.strictEqual(storedAfterRate.rate, 100);
        assert.strictEqual(storedAfterRate.cost, 2000, 'PATCH rate 100 must recalculate cost to 2000 (20 * 100)');
        assert.strictEqual(resPatchRate.body.cost, 2000);
    });

    await t.test('[P1] Worker is forbidden from choosing m2, mb, or fixed billing types to fabricate costs', async () => {
        // 1. Worker POST with m2, quantity 10, rate 999 -> MUST return 400
        const resWorkerM2 = await request(app)
            .post('/api/time-entries')
            .set('Authorization', 'Bearer ' + workerToken)
            .send({
                id: 'worker-forged-m2',
                employeeId: 'test-user',
                jobId: 'job-1',
                billingType: 'm2',
                quantity: 10,
                rate: 999
            });
        assert.strictEqual(resWorkerM2.status, 400);
        assert.match(resWorkerM2.body.error, /Typ rozliczenia 'm2' nie jest dozwolony dla pracownika/);
        assert.strictEqual(store.has('worker-forged-m2'), false, 'Forged m2 entry must NOT be saved');

        // 2. Worker POST with fixed, cost 999999 -> MUST return 400
        const resWorkerFixed = await request(app)
            .post('/api/time-entries')
            .set('Authorization', 'Bearer ' + workerToken)
            .send({
                id: 'worker-forged-fixed',
                employeeId: 'test-user',
                jobId: 'job-1',
                billingType: 'fixed',
                cost: 999999
            });
        assert.strictEqual(resWorkerFixed.status, 400);
        assert.match(resWorkerFixed.body.error, /Typ rozliczenia 'fixed' nie jest dozwolony dla pracownika/);
        assert.strictEqual(store.has('worker-forged-fixed'), false, 'Forged fixed entry must NOT be saved');

        // 3. Worker POST with mb -> MUST return 400
        const resWorkerMb = await request(app)
            .post('/api/time-entries')
            .set('Authorization', 'Bearer ' + workerToken)
            .send({
                id: 'worker-forged-mb',
                employeeId: 'test-user',
                jobId: 'job-1',
                billingType: 'mb',
                quantity: 10,
                rate: 50
            });
        assert.strictEqual(resWorkerMb.status, 400);
        assert.match(resWorkerMb.body.error, /Typ rozliczenia 'mb' nie jest dozwolony dla pracownika/);
        assert.strictEqual(store.has('worker-forged-mb'), false);
    });

    await t.test('[P1] Fail-closed job verification: non-existent job returns 404 and DB error returns 500', async () => {
        // 1. Non-existent job returns 404
        const resJobNotFound = await request(app)
            .post('/api/time-entries')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                id: 'entry-missing-job',
                employeeId: 'test-user',
                jobId: 'j',
                hours: 4,
                billingType: 'hourly'
            });
        assert.strictEqual(resJobNotFound.status, 404);
        assert.match(resJobNotFound.body.error, /Zlecenie o identyfikatorze 'j' nie zostało odnalezione/);
        assert.strictEqual(store.has('entry-missing-job'), false, 'Orphaned entry without parent job must NEVER be saved');

        // 2. Database failure on job check returns 500
        const resJobDbError = await request(app)
            .post('/api/time-entries')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                id: 'entry-db-error-job',
                employeeId: 'test-user',
                jobId: 'job-db-error',
                hours: 4,
                billingType: 'hourly'
            });
        assert.strictEqual(resJobDbError.status, 500);
        assert.match(resJobDbError.body.error, /Błąd podczas weryfikacji zlecenia/);
        assert.strictEqual(store.has('entry-db-error-job'), false);
    });

    await t.test('[P2] Separation of activityType and workerType: authoritative resolution on backend', async () => {
        // 1. Employee form entry with type: work sets activityType: work and workerType: employee
        const resEmpWork = await request(app)
            .post('/api/time-entries')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                id: 'entry-activity-work',
                employeeId: 'test-user',
                jobId: 'job-1',
                type: 'work',
                hours: 5,
                billingType: 'hourly'
            });
        assert.strictEqual(resEmpWork.status, 201);
        const storedEmpWork = store.get('entry-activity-work');
        assert.strictEqual(storedEmpWork.workerType, 'employee', 'Worker type must be authoritatively resolved to employee');
        assert.strictEqual(storedEmpWork.activityType, 'work');

        // 2. Client attempting to forge workerType: subcontractor on an employee is authoritatively overridden
        const resForgeWorkerType = await request(app)
            .post('/api/time-entries')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                id: 'entry-forge-sub',
                employeeId: 'test-user',
                jobId: 'job-1',
                workerType: 'subcontractor',
                hours: 5,
                billingType: 'hourly'
            });
        assert.strictEqual(resForgeWorkerType.status, 201);
        const storedForged = store.get('entry-forge-sub');
        assert.strictEqual(storedForged.workerType, 'employee', 'Server must overwrite workerType with employee based on entity resolver');

        // 3. Subcontractor entry with activityType: drive has workerType: subcontractor
        const resSubDrive = await request(app)
            .post('/api/time-entries')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                id: 'entry-sub-drive',
                employeeId: 'sub-1',
                jobId: 'job-1',
                activityType: 'drive',
                hours: 2,
                billingType: 'hourly'
            });
        assert.strictEqual(resSubDrive.status, 201);
        const storedSubDrive = store.get('entry-sub-drive');
        assert.strictEqual(storedSubDrive.workerType, 'subcontractor');
        assert.strictEqual(storedSubDrive.activityType, 'drive');
    });


    await t.test('[P1] PATCH cannot clear employeeId or jobId with empty string or whitespace (fail-closed)', async () => {
        // Create initial valid entry owned by worker
        store.set('entry-for-empty-check', {
            id: 'entry-for-empty-check',
            employeeId: 'test-user',
            jobId: 'job-1',
            date: '2026-03-01T00:00:00.000Z',
            hours: 4,
            billingType: 'hourly',
            hourlyRate: 50,
            cost: 200,
            status: 'submitted',
            workerType: 'employee',
            activityType: 'work'
        });

        // 1. Worker tries to clear employeeId: ""
        const resWorkerEmptyEmp = await request(app)
            .patch('/api/time-entries/entry-for-empty-check')
            .set('Authorization', 'Bearer ' + workerToken)
            .send({ employeeId: '' });
        assert.strictEqual(resWorkerEmptyEmp.status, 400);
        assert.match(resWorkerEmptyEmp.body.error, /employeeId nie może być puste/);
        assert.strictEqual(store.get('entry-for-empty-check').employeeId, 'test-user', 'employeeId must NOT be cleared');

        // 2. Worker tries to clear employeeId: "   "
        const resWorkerWhitespaceEmp = await request(app)
            .patch('/api/time-entries/entry-for-empty-check')
            .set('Authorization', 'Bearer ' + workerToken)
            .send({ employeeId: '   ' });
        assert.strictEqual(resWorkerWhitespaceEmp.status, 400);
        assert.match(resWorkerWhitespaceEmp.body.error, /employeeId nie może być puste/);

        // 3. Worker tries to clear jobId: ""
        const resWorkerEmptyJob = await request(app)
            .patch('/api/time-entries/entry-for-empty-check')
            .set('Authorization', 'Bearer ' + workerToken)
            .send({ jobId: '' });
        assert.strictEqual(resWorkerEmptyJob.status, 400);
        assert.match(resWorkerEmptyJob.body.error, /jobId nie może być puste/);
        assert.strictEqual(store.get('entry-for-empty-check').jobId, 'job-1', 'jobId must NOT be cleared');

        // 4. Admin tries to clear jobId: ""
        const resAdminEmptyJob = await request(app)
            .patch('/api/time-entries/entry-for-empty-check')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ jobId: '' });
        assert.strictEqual(resAdminEmptyJob.status, 400);
        assert.match(resAdminEmptyJob.body.error, /jobId nie może być puste/);

        // 5. Admin tries to clear employeeId: ""
        const resAdminEmptyEmp = await request(app)
            .patch('/api/time-entries/entry-for-empty-check')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ employeeId: '' });
        assert.strictEqual(resAdminEmptyEmp.status, 400);
        assert.match(resAdminEmptyEmp.body.error, /employeeId nie może być puste/);
    });

    await t.test('[P1 & P2] Historical migration backfill: bulkWrite batching, no N+1, safe unresolved handling, and no guessing', async () => {
        const legacyEntries = [
            {
                _id: 'legacy-sub-entry',
                id: 'legacy-sub-entry',
                employeeId: 'sub-1', // exists in subcontractors
                jobId: 'job-1',
                type: 'work',
                hours: 8,
                billingType: 'hourly',
                cost: 400
            },
            {
                _id: 'legacy-emp-entry',
                id: 'legacy-emp-entry',
                employeeId: 'admin-1', // exists in employees
                jobId: 'job-1',
                type: 'work',
                hours: 8,
                billingType: 'hourly',
                cost: 400
            },
            {
                _id: 'legacy-orphan-entry',
                id: 'legacy-orphan-entry',
                employeeId: 'orphan-contractor-999', // NOT in subcontractors NOR employees
                jobId: 'job-1',
                type: 'work', // ambiguous activity type
                hours: 8,
                billingType: 'hourly',
                cost: 400
            }
        ];

        const legacyStore = new Map(legacyEntries.map(e => [e._id, { ...e }]));
        const migrationsStore = new Map();
        const migrationLogs = [];
        const dynamicSubcontractors = [{ id: 'sub-1', name: 'Podwykonawca 1' }];
        const dynamicEmployees = [{ id: 'admin-1', name: 'Pracownik 1' }];

        const mockMigrationDb = {
            collection: (name) => {
                if (name === 'system_migrations') {
                    return {
                        findOne: async (query) => migrationsStore.get(query.id) || null,
                        updateOne: async (query, update, opts) => {
                            const existing = migrationsStore.get(query.id) || {};
                            const merged = { ...existing, ...update.$set, id: query.id };
                            migrationsStore.set(query.id, merged);
                        }
                    };
                }
                if (name === '_migration_logs') {
                    return {
                        insertOne: async (doc) => {
                            migrationLogs.push(doc);
                        }
                    };
                }
                if (name === 'time-entries') {
                    return {
                        find: (query) => {
                            const unmigrated = Array.from(legacyStore.values()).filter(e => !e.workerType);
                            let index = 0;
                            return {
                                hasNext: async () => index < unmigrated.length,
                                next: async () => unmigrated[index++]
                            };
                        },
                        bulkWrite: async (ops) => {
                            for (const op of ops) {
                                const filter = op.updateOne.filter;
                                const update = op.updateOne.update;
                                const doc = legacyStore.get(filter._id);
                                if (doc && update.$set) {
                                    Object.assign(doc, update.$set);
                                }
                            }
                        }
                    };
                }
                if (name === 'subcontractors') {
                    return {
                        find: () => ({
                            toArray: async () => dynamicSubcontractors
                        })
                    };
                }
                if (name === 'employees') {
                    return {
                        find: () => ({
                            toArray: async () => dynamicEmployees
                        })
                    };
                }
                return { findOne: async () => null };
            }
        };

        // Run initial backfill
        const result1 = await backfillTimeEntriesWorkerType(mockMigrationDb);
        assert.strictEqual(result1.resolvedCount, 2, 'Should resolve sub-1 and admin-1');
        assert.strictEqual(result1.unresolvedCount, 1, 'orphan-contractor-999 must remain unresolved');
        assert.strictEqual(result1.status, 'partial', 'Status must be partial while unresolved entries remain');

        // Check resolved records
        const sub = legacyStore.get('legacy-sub-entry');
        assert.strictEqual(sub.workerType, 'subcontractor');
        assert.strictEqual(sub.activityType, 'work');

        const emp = legacyStore.get('legacy-emp-entry');
        assert.strictEqual(emp.workerType, 'employee');
        assert.strictEqual(emp.activityType, 'work');

        // CRITICAL CHECK: Unresolved record must NEVER be guessed as employee!
        const orphan = legacyStore.get('legacy-orphan-entry');
        assert.strictEqual(orphan.workerType, undefined, 'Orphan record workerType must NOT be guessed as employee');
        assert.strictEqual(orphan.activityType, 'work', 'Activity type should still be normalized');

        // Verify audit record logged in _migration_logs
        assert.strictEqual(migrationLogs.length, 1);
        assert.strictEqual(migrationLogs[0].unresolvedCount, 1);
        assert.strictEqual(migrationLogs[0].unresolvedRecords[0].employeeId, 'orphan-contractor-999');

        // Now simulate the missing contractor being restored in subcontractors dictionary
        dynamicSubcontractors.push({ id: 'orphan-contractor-999', name: 'Przywrócony Podwykonawca' });

        // Second run re-attempts unresolved records (since previous status was partial)
        const result2 = await backfillTimeEntriesWorkerType(mockMigrationDb);
        assert.strictEqual(result2.resolvedCount, 1, 'Should now resolve the restored contractor');
        assert.strictEqual(result2.unresolvedCount, 0, 'No more unresolved entries');
        assert.strictEqual(result2.status, 'completed', 'Status must now be completed');
        assert.strictEqual(orphan.workerType, 'subcontractor', 'Now correctly resolved to subcontractor');

        // Third run: no-op since status is completed
        const result3 = await backfillTimeEntriesWorkerType(mockMigrationDb);
        assert.strictEqual(result3.status, 'already_completed');
    });

    await t.test('[P1 & P2] Historical migration backfill: ID collision resolution and memory buffer capping', async () => {
        const collisionSubcontractors = [
            { id: 'collision-id', name: 'Podwykonawca Kolizyjny' }
        ];
        const collisionEmployees = [
            { id: 'collision-id', name: 'Pracownik Kolizyjny' }
        ];

        // 1. Ambiguous collision (type: 'work') -> must remain unresolved
        // 2. Explicit collision with type: 'subcontractor' -> resolves to subcontractor
        // 3. Explicit collision with type: 'employee' -> resolves to employee
        // 4. Over 100 unresolved records -> memory buffer capped at 100 samples
        const testEntries = [
            {
                _id: 'col-ambiguous',
                id: 'col-ambiguous',
                employeeId: 'collision-id',
                jobId: 'job-1',
                type: 'work',
                hours: 8
            },
            {
                _id: 'col-sub',
                id: 'col-sub',
                employeeId: 'collision-id',
                jobId: 'job-1',
                type: 'subcontractor',
                hours: 8
            },
            {
                _id: 'col-emp',
                id: 'col-emp',
                employeeId: 'collision-id',
                jobId: 'job-1',
                type: 'employee',
                hours: 8
            }
        ];

        // Add 120 orphan entries to verify capping at 100
        for (let i = 0; i < 120; i++) {
            testEntries.push({
                _id: `orphan-${i}`,
                id: `orphan-${i}`,
                employeeId: `unknown-entity-${i}`,
                jobId: 'job-1',
                type: 'work',
                hours: 8
            });
        }

        const entriesStore = new Map(testEntries.map(e => [e._id, { ...e }]));
        const migrationsStore = new Map();
        const logs = [];

        const mockDb = {
            collection: (name) => {
                if (name === 'system_migrations') {
                    return {
                        findOne: async (query) => migrationsStore.get(query.id) || null,
                        updateOne: async (query, update) => {
                            const existing = migrationsStore.get(query.id) || {};
                            migrationsStore.set(query.id, { ...existing, ...update.$set, id: query.id });
                        }
                    };
                }
                if (name === '_migration_logs') {
                    return {
                        insertOne: async (doc) => { logs.push(doc); }
                    };
                }
                if (name === 'time-entries') {
                    return {
                        find: () => {
                            const unmigrated = Array.from(entriesStore.values()).filter(e => !e.workerType);
                            let idx = 0;
                            return {
                                hasNext: async () => idx < unmigrated.length,
                                next: async () => unmigrated[idx++]
                            };
                        },
                        bulkWrite: async (ops) => {
                            for (const op of ops) {
                                const doc = entriesStore.get(op.updateOne.filter._id);
                                if (doc && op.updateOne.update.$set) {
                                    Object.assign(doc, op.updateOne.update.$set);
                                }
                            }
                        }
                    };
                }
                if (name === 'subcontractors') {
                    return { find: () => ({ toArray: async () => collisionSubcontractors }) };
                }
                if (name === 'employees') {
                    return { find: () => ({ toArray: async () => collisionEmployees }) };
                }
                return { findOne: async () => null };
            }
        };

        const result = await backfillTimeEntriesWorkerType(mockDb);

        // 2 resolved: col-sub and col-emp
        assert.strictEqual(result.resolvedCount, 2);
        // 121 unresolved: col-ambiguous + 120 orphans
        assert.strictEqual(result.unresolvedCount, 121);
        assert.strictEqual(result.status, 'partial');

        // Check resolutions
        assert.strictEqual(entriesStore.get('col-ambiguous').workerType, undefined, 'Ambiguous collision must remain unresolved');
        assert.strictEqual(entriesStore.get('col-sub').workerType, 'subcontractor', 'Explicit subcontractor type resolves collision');
        assert.strictEqual(entriesStore.get('col-emp').workerType, 'employee', 'Explicit employee type resolves collision');

        // Check memory buffer capping in logs
        assert.strictEqual(logs.length, 1);
        assert.strictEqual(logs[0].unresolvedCount, 121, 'unresolvedCount integer accurately reflects total 121');
        assert.strictEqual(logs[0].unresolvedRecords.length, 100, 'unresolvedRecords sample array strictly capped at 100');
    });

    await t.test('[P2] GET /api/time-entries and GET /api/time-entries/:id dynamically enrich missing workerType and activityType', async () => {
        // Place unmigrated records into the live test store
        store.set('get-enrich-sub', {
            id: 'get-enrich-sub',
            employeeId: 'sub-1', // known subcontractor in mock DB
            jobId: 'job-1',
            type: 'drive', // legacy activity without workerType
            hours: 3,
            billingType: 'hourly',
            cost: 150
            // workerType is omitted
        });

        store.set('get-enrich-emp', {
            id: 'get-enrich-emp',
            employeeId: 'test-user', // known employee in mock DB
            jobId: 'job-1',
            type: 'work',
            hours: 4,
            billingType: 'hourly',
            cost: 200
            // workerType is omitted
        });

        store.set('get-enrich-unknown', {
            id: 'get-enrich-unknown',
            employeeId: 'completely-unknown-entity',
            jobId: 'job-1',
            type: 'work',
            hours: 2,
            billingType: 'hourly',
            cost: 100
            // workerType is omitted
        });

        store.set('get-enrich-col-ambiguous', {
            id: 'get-enrich-col-ambiguous',
            employeeId: 'collision-user',
            jobId: 'job-1',
            type: 'work',
            hours: 4,
            billingType: 'hourly',
            cost: 200
        });

        store.set('get-enrich-col-sub', {
            id: 'get-enrich-col-sub',
            employeeId: 'collision-user',
            jobId: 'job-1',
            type: 'subcontractor',
            hours: 4,
            billingType: 'hourly',
            cost: 200
        });

        store.set('get-enrich-col-emp', {
            id: 'get-enrich-col-emp',
            employeeId: 'collision-user',
            jobId: 'job-1',
            type: 'employee',
            hours: 4,
            billingType: 'hourly',
            cost: 200
        });

        // 1. GET /api/time-entries (list)
        const resList = await request(app)
            .get('/api/time-entries')
            .set('Authorization', 'Bearer ' + adminToken);
        assert.strictEqual(resList.status, 200);

        const listItems = resList.body.data || resList.body;
        const subItem = listItems.find(it => it.id === 'get-enrich-sub');
        assert.ok(subItem, 'get-enrich-sub must be returned in list');
        assert.strictEqual(subItem.workerType, 'subcontractor', 'GET must enrich workerType to subcontractor');
        assert.strictEqual(subItem.activityType, 'drive', 'GET must enrich activityType to drive');

        const empItem = listItems.find(it => it.id === 'get-enrich-emp');
        assert.ok(empItem, 'get-enrich-emp must be returned in list');
        assert.strictEqual(empItem.workerType, 'employee', 'GET must enrich workerType to employee');
        assert.strictEqual(empItem.activityType, 'work', 'GET must enrich activityType to work');

        const unknownItem = listItems.find(it => it.id === 'get-enrich-unknown');
        assert.ok(unknownItem, 'get-enrich-unknown must be returned in list');
        assert.strictEqual(unknownItem.workerType, undefined, 'GET must NOT fabricate employee for unknown entity');
        assert.strictEqual(unknownItem.activityType, 'work', 'GET must still normalize activityType to work');

        // 2. GET /api/time-entries/:id (single entry)
        const resSingleSub = await request(app)
            .get('/api/time-entries/get-enrich-sub')
            .set('Authorization', 'Bearer ' + adminToken);
        assert.strictEqual(resSingleSub.status, 200);
        assert.strictEqual(resSingleSub.body.workerType, 'subcontractor');
        assert.strictEqual(resSingleSub.body.activityType, 'drive');

        const resSingleEmp = await request(app)
            .get('/api/time-entries/get-enrich-emp')
            .set('Authorization', 'Bearer ' + adminToken);
        assert.strictEqual(resSingleEmp.status, 200);
        assert.strictEqual(resSingleEmp.body.workerType, 'employee');
        assert.strictEqual(resSingleEmp.body.activityType, 'work');

        const resSingleUnknown = await request(app)
            .get('/api/time-entries/get-enrich-unknown')
            .set('Authorization', 'Bearer ' + adminToken);
        assert.strictEqual(resSingleUnknown.status, 200);
        assert.strictEqual(resSingleUnknown.body.workerType, undefined, 'GET single must NOT fabricate employee');
        assert.strictEqual(resSingleUnknown.body.activityType, 'work');

        // Assert GET list collision handling
        const colAmbItem = listItems.find(it => it.id === 'get-enrich-col-ambiguous');
        assert.ok(colAmbItem);
        assert.strictEqual(colAmbItem.workerType, undefined, 'GET list must not resolve ambiguous collision');
        assert.strictEqual(colAmbItem.activityType, 'work');

        const colSubItem = listItems.find(it => it.id === 'get-enrich-col-sub');
        assert.ok(colSubItem);
        assert.strictEqual(colSubItem.workerType, 'subcontractor', 'GET list resolves collision with explicit subcontractor type');

        const colEmpItem = listItems.find(it => it.id === 'get-enrich-col-emp');
        assert.ok(colEmpItem);
        assert.strictEqual(colEmpItem.workerType, 'employee', 'GET list resolves collision with explicit employee type');

        // Assert GET single collision handling
        const resSingleColAmb = await request(app)
            .get('/api/time-entries/get-enrich-col-ambiguous')
            .set('Authorization', 'Bearer ' + adminToken);
        assert.strictEqual(resSingleColAmb.status, 200);
        assert.strictEqual(resSingleColAmb.body.workerType, undefined, 'GET single must not resolve ambiguous collision');

        const resSingleColSub = await request(app)
            .get('/api/time-entries/get-enrich-col-sub')
            .set('Authorization', 'Bearer ' + adminToken);
        assert.strictEqual(resSingleColSub.status, 200);
        assert.strictEqual(resSingleColSub.body.workerType, 'subcontractor', 'GET single resolves collision with explicit sub type');

        const resSingleColEmp = await request(app)
            .get('/api/time-entries/get-enrich-col-emp')
            .set('Authorization', 'Bearer ' + adminToken);
        assert.strictEqual(resSingleColEmp.status, 200);
        assert.strictEqual(resSingleColEmp.body.workerType, 'employee', 'GET single resolves collision with explicit emp type');
    });

    await t.test('automated generation guard: verifies timeEntry.generated.ts is strictly up to date with timeEntry.schema.json', async () => {
        const { execSync } = require('child_process');
        const path = require('path');
        const rootDir = path.resolve(__dirname, '../..');
        assert.doesNotThrow(() => {
            execSync('node scripts/generate-contracts.cjs --check', { cwd: rootDir, stdio: 'pipe' });
        });
    });
});
