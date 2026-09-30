process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const {
    app,
    setDb,
    VALID_TIME_ENTRY_STATUSES,
    WORKER_ALLOWED_TIME_ENTRY_STATUSES,
    FOREMAN_ALLOWED_TIME_ENTRY_STATUSES,
    BILLING_TYPES,
    TIME_ENTRY_TYPES,
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
        findOne: async (f) => store.get(f.id) || null,
        find: (filter) => ({
            toArray: async () => {
                if (filter && filter.id && filter.id.$in) {
                    return filter.id.$in.map(id => store.get(id)).filter(Boolean);
                }
                return Array.from(store.values());
            }
        }),
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
            if (id === 'job-closed') return { id: 'job-closed', status: 'done' };
            return { id: id || 'job-1', status: 'in_progress' };
        }
    };

    const mockEmployeesColl = {
        findOne: async (f) => {
            const id = f.$or ? f.$or[0].id : f.id;
            if (id === 'emp-db-error') {
                throw new Error('Database query failure');
            }
            if (id === 'emp-not-found') {
                return null;
            }
            return { id: id || 'admin-1', hourlyRate: 50, dailyRate: 400, projectRate: 1500 };
        }
    };

    const mockDb = {
        collection: (name) => {
            if (name === 'time-entries') return mockTimeEntriesColl;
            if (name === 'jobs') return mockJobsColl;
            if (name === 'employees') return mockEmployeesColl;
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
    await t.test('automated generation guard: verifies timeEntry.generated.ts is strictly up to date with timeEntry.schema.json', async () => {
        const { execSync } = require('child_process');
        const path = require('path');
        const rootDir = path.resolve(__dirname, '../..');
        assert.doesNotThrow(() => {
            execSync('node scripts/generate-contracts.cjs --check', { cwd: rootDir, stdio: 'pipe' });
        });
    });
});
