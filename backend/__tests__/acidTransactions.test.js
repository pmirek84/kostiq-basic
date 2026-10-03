process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { MongoClient, ObjectId } = require('mongodb');

const {
    app,
    setDb,
    reconcileDuplicatesAndEnsureIndexes,
    setTestFailpoint
} = require('../server');

const adminToken = jwt.sign(
    { id: 'admin-acid', role: 'admin', email: 'admin@kostiq.pl' },
    'test-secret',
    { expiresIn: '1h' }
);

test('ACID Multi-Document Transactions: Real Replica Set Verification', async (t) => {
    const testPort = '27018';
    const ephemeralDbPath = path.resolve(__dirname, '../scratch_rs_acid_test');
    try {
        fs.rmSync(ephemeralDbPath, { recursive: true, force: true });
    } catch (_) {}
    fs.mkdirSync(ephemeralDbPath, { recursive: true });

    console.log('[ACID TEST] Spawning ephemeral mongod on port', testPort, 'with --replSet rsTest...');
    const mongodProc = spawn('C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe', [
        '--port', testPort,
        '--dbpath', ephemeralDbPath,
        '--replSet', 'rsTest',
        '--bind_ip', '127.0.0.1'
    ], {
        stdio: 'ignore' // Crucial: prevents stdio pipe buffer deadlock on Windows
    });
    mongodProc.unref();

    let mongoClient = null;
    let testDb = null;

    // [P2 FIX] Register cleanup IMMEDIATELY after spawning with synchronous process tree kill
    t.after(async () => {
        console.log('[ACID TEST] Cleaning up ephemeral mongod...');
        setDb(null, true, null, false);
        if (mongoClient) {
            try {
                await mongoClient.close(true);
            } catch (_) {}
            mongoClient = null;
        }

        if (mongodProc && mongodProc.pid) {
            try {
                execSync(`taskkill /F /T /PID ${mongodProc.pid}`);
            } catch (_) {}
        }

        for (let r = 0; r < 20; r++) {
            try {
                if (fs.existsSync(ephemeralDbPath)) {
                    fs.rmSync(ephemeralDbPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
                }
                break;
            } catch (_) {
                await new Promise(res => setTimeout(res, 100));
            }
        }
    });

    // [P2 FIX] Sequential polling without overlapping intervals, closing every unaccepted connection
    for (let attempt = 1; attempt <= 40; attempt++) {
        let client = null;
        try {
            client = new MongoClient(`mongodb://127.0.0.1:${testPort}/?directConnection=true`, {
                serverSelectionTimeoutMS: 500,
                connectTimeoutMS: 500
            });
            await client.connect();
            mongoClient = client;
            break;
        } catch (err) {
            if (client) {
                try {
                    await client.close(true);
                } catch (_) {}
            }
            if (attempt === 40) {
                throw new Error('Timed out waiting for ephemeral mongod: ' + err.message);
            }
            await new Promise(r => setTimeout(r, 200));
        }
    }

    const admin = mongoClient.db().admin();
    console.log('[ACID TEST] Initiating rsTest replica set...');
    try {
        await admin.command({ replSetInitiate: {} });
    } catch (initErr) {
        // If already initiated
    }

    // Wait until isWritablePrimary is true using modern hello command
    let isPrimary = false;
    for (let i = 0; i < 30; i++) {
        const helloRes = await admin.command({ hello: 1 });
        if (helloRes.isWritablePrimary) {
            isPrimary = true;
            console.log('[ACID TEST] Replica set primary ready: hello.setName =', helloRes.setName);
            break;
        }
        await new Promise(r => setTimeout(r, 300));
    }
    assert.strictEqual(isPrimary, true, 'Replica set must elect a primary');

    testDb = mongoClient.db('kostiq_acid_suite');
    setDb(testDb, true, mongoClient, true);
    await reconcileDuplicatesAndEnsureIndexes(testDb);

    await t.test('1. Full success: settlement, time-entries, advances and job aggregates commit atomically', async () => {
        const workerId = 'emp-acid-1';
        const jobId = 'job-acid-1';
        const te1Id = 'te-acid-1';
        const te2Id = 'te-acid-2';
        const advId = 'req-acid-1';

        await testDb.collection('employees').insertOne({
            id: workerId,
            firstName: 'Jan',
            lastName: 'Nowak',
            hourlyRate: 50,
            isActive: true
        });

        await testDb.collection('jobs').insertOne({
            id: jobId,
            jobCode: 'J-ACID-01',
            status: 'in_progress',
            actualLaborHours: 12,
            actualLaborCost: 600,
            settledLaborCost: 0,
            stages: []
        });

        await testDb.collection('time-entries').insertMany([
            { id: te1Id, jobId, employeeId: workerId, date: '2026-09-10', hours: 4, cost: 200, hourlyRate: 50, status: 'approved', isActive: true },
            { id: te2Id, jobId, employeeId: workerId, date: '2026-09-11', hours: 8, cost: 400, hourlyRate: 50, status: 'approved', isActive: true }
        ]);

        await testDb.collection('requests').insertOne({
            id: advId,
            employeeId: workerId,
            type: 'zaliczka',
            amount: 150,
            status: 'zaakceptowany',
            isActive: true
        });

        const res = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1001')
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: [te1Id, te2Id],
                advanceIds: [advId],
                notes: 'Rozliczenie wrześniowe'
            });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.success, true);
        const createdSettlement = res.body.settlement;
        assert.ok(createdSettlement.id);
        assert.strictEqual(createdSettlement.totalHours, 12);
        assert.strictEqual(createdSettlement.grossAmount, 600);
        assert.strictEqual(createdSettlement.advanceDeductions, 150);
        assert.strictEqual(createdSettlement.totalAmount, 450);

        // Verify in real MongoDB
        const storedSettlement = await testDb.collection('settlements').findOne({ id: createdSettlement.id });
        assert.ok(storedSettlement !== null, 'Settlement must exist in DB');

        const updatedEntries = await testDb.collection('time-entries').find({ id: { $in: [te1Id, te2Id] } }).toArray();
        assert.strictEqual(updatedEntries.length, 2);
        assert.strictEqual(updatedEntries[0].settlementId, createdSettlement.id);
        assert.strictEqual(updatedEntries[1].settlementId, createdSettlement.id);

        const updatedAdvance = await testDb.collection('requests').findOne({ id: advId });
        assert.strictEqual(updatedAdvance.settlementId, createdSettlement.id);
    });

    await t.test('2. Real ACID Rollback on mid-transaction failure via failpoint', async () => {
        const workerId = 'emp-acid-rollback';
        const jobId = 'job-acid-rollback';
        const te1 = 'te-rb-1';
        const te2 = 'te-rb-2';
        const advId = 'req-rb-1';

        await testDb.collection('employees').insertOne({
            id: workerId,
            firstName: 'Marek',
            lastName: 'Rollback',
            hourlyRate: 60,
            isActive: true
        });

        await testDb.collection('jobs').insertOne({
            id: jobId,
            jobCode: 'J-RB-01',
            status: 'in_progress',
            actualLaborHours: 10,
            actualLaborCost: 600,
            settledLaborCost: 0
        });

        await testDb.collection('time-entries').insertMany([
            { id: te1, jobId, employeeId: workerId, workerType: 'employee', date: '2026-09-15', hours: 5, cost: 300, status: 'approved', isActive: true },
            { id: te2, jobId, employeeId: workerId, workerType: 'employee', date: '2026-09-16', hours: 5, cost: 300, status: 'approved', isActive: true }
        ]);

        await testDb.collection('requests').insertOne({
            id: advId,
            employeeId: workerId,
            type: 'zaliczka',
            amount: 100,
            status: 'zaakceptowany',
            isActive: true
        });

        const settlementsBeforeCount = await testDb.collection('settlements').countDocuments({});

        let res;
        try {
            // Set test failpoint to throw AFTER time-entries are updated in the transaction session
            setTestFailpoint('after_time_entries_updated');

            res = await request(app)
                .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1002')
                .send({
                    workerId,
                    workerType: 'employee',
                    periodFrom: '2026-09-01',
                    periodTo: '2026-09-30',
                    timeEntryIds: [te1, te2],
                    advanceIds: [advId]
                });
        } finally {
            // Always reset failpoint
            setTestFailpoint(null);
        }

        assert.strictEqual(res.status, 500, 'Must return 500 due to failpoint crash');
        assert.match(res.body.error, /FAILPOINT: Simulated crash after time-entries updated/);

        // Confirm 100% rollback in MongoDB across all collections:
        // A. No new settlement was persisted
        const settlementsAfterCount = await testDb.collection('settlements').countDocuments({});
        assert.strictEqual(settlementsAfterCount, settlementsBeforeCount, 'No settlement must be written');

        // B. te1 and te2 must NOT have settlementId (rolled back by transaction abort!)
        const storedEntries = await testDb.collection('time-entries').find({ id: { $in: [te1, te2] } }).toArray();
        assert.strictEqual(storedEntries[0].settlementId, undefined, 'te1 must remain unassigned after transaction rollback');
        assert.strictEqual(storedEntries[1].settlementId, undefined, 'te2 must remain unassigned after transaction rollback');

        // C. advId must NOT have settlementId
        const storedAdv = await testDb.collection('requests').findOne({ id: advId });
        assert.strictEqual(storedAdv.settlementId, undefined, 'Advance must remain unassigned after transaction rollback');
    });

    await t.test('3. CAS conflict on concurrent settlement aborts transaction and rolls back', async () => {
        const workerId = 'emp-acid-cas';
        const jobId = 'job-acid-cas';
        const te1 = 'te-cas-1';
        const te2 = 'te-cas-2';

        await testDb.collection('employees').insertOne({
            id: workerId,
            firstName: 'Kamil',
            lastName: 'CAS',
            hourlyRate: 50,
            isActive: true
        });

        await testDb.collection('jobs').insertOne({
            id: jobId,
            jobCode: 'J-CAS-01',
            status: 'in_progress',
            actualLaborHours: 10,
            actualLaborCost: 500
        });

        // te2 already has settlementId from concurrent process
        await testDb.collection('time-entries').insertMany([
            { id: te1, jobId, employeeId: workerId, workerType: 'employee', date: '2026-09-15', hours: 5, cost: 250, status: 'approved', isActive: true },
            { id: te2, jobId, employeeId: workerId, workerType: 'employee', date: '2026-09-16', hours: 5, cost: 250, status: 'approved', settlementId: 'prior-settlement-id', isActive: true }
        ]);

        const res = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1003')
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: [te1, te2]
            });

        assert.strictEqual(res.status, 409, 'Must return 409 Conflict');

        // Verify te1 remains untouched
        const storedTe1 = await testDb.collection('time-entries').findOne({ id: te1 });
        assert.strictEqual(storedTe1.settlementId, undefined, 'te1 must remain unassigned');
    });

    await t.test('4. Idempotency Key: replay identical payload returns 201 replay; mismatch returns 409', async () => {
        const workerId = 'emp-acid-idemp';
        const jobId = 'job-acid-idemp';
        const teId = 'te-acid-idemp-1';
        const idempKey = 'idemp-tx-test-key-999';

        await testDb.collection('employees').insertOne({
            id: workerId,
            firstName: 'Ewa',
            lastName: 'Idempotentna',
            hourlyRate: 70,
            isActive: true
        });

        await testDb.collection('jobs').insertOne({
            id: jobId,
            jobCode: 'J-IDEMP-01',
            status: 'in_progress',
            actualLaborHours: 5,
            actualLaborCost: 350
        });

        await testDb.collection('time-entries').insertOne({
            id: teId,
            jobId,
            employeeId: workerId,
            workerType: 'employee',
            date: '2026-09-22',
            hours: 5,
            cost: 350,
            status: 'approved',
            isActive: true
        });

        const payload = {
            workerId,
            workerType: 'employee',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            timeEntryIds: [teId],
            notes: 'Test idempotencji'
        };

        // First attempt with Idempotency-Key
        const res1 = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send(payload);

        assert.strictEqual(res1.status, 201);
        const settlementId1 = res1.body.settlement.id;

        // Second attempt with SAME Idempotency-Key and SAME payload
        const res2 = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send(payload);

        assert.strictEqual(res2.status, 201, 'Repeated call must return 201');
        assert.strictEqual(res2.body.settlement.id, settlementId1, 'Must return the EXACT same settlement');

        // Confirm only 1 settlement exists in database
        const settlements = await testDb.collection('settlements').find({ workerId }).toArray();
        assert.strictEqual(settlements.length, 1, 'Only one settlement must exist in DB');

        // Third attempt with SAME key but DIFFERENT notes -> 409 Conflict
        const res3 = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send({
                ...payload,
                notes: 'Zmieniona notatka' // mismatch!
            });

        assert.strictEqual(res3.status, 409, 'Reusing key with different notes must return 409');
    });

    await t.test('4B. [P2 REAL CONCURRENCY] Concurrent Promise.all requests with same Idempotency-Key both resolve to 201', async () => {
        const workerId = 'emp-acid-parallel';
        const jobId = 'job-acid-parallel';
        const teId = 'te-acid-parallel-1';
        const parallelKey = 'idemp-parallel-test-' + Date.now();

        await testDb.collection('employees').insertOne({
            id: workerId,
            firstName: 'Piotr',
            lastName: 'Równoległy',
            hourlyRate: 80,
            isActive: true
        });

        await testDb.collection('jobs').insertOne({
            id: jobId,
            jobCode: 'J-PARALLEL-01',
            status: 'in_progress',
            actualLaborHours: 6,
            actualLaborCost: 480
        });

        await testDb.collection('time-entries').insertOne({
            id: teId,
            jobId,
            employeeId: workerId,
            workerType: 'employee',
            date: '2026-09-25',
            hours: 6,
            cost: 480,
            status: 'approved',
            isActive: true
        });

        const parallelPayload = {
            workerId,
            workerType: 'employee',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            timeEntryIds: [teId],
            notes: 'Test równoległych żądań Promise.all'
        };

        // Fire TWO requests simultaneously with the EXACT SAME key and payload
        const [resA, resB] = await Promise.all([
            request(app)
                .post('/api/settlements/create-atomic')
                .set('Authorization', 'Bearer ' + adminToken)
                .set('Idempotency-Key', parallelKey)
                .send(parallelPayload),
            request(app)
                .post('/api/settlements/create-atomic')
                .set('Authorization', 'Bearer ' + adminToken)
                .set('Idempotency-Key', parallelKey)
                .send(parallelPayload)
        ]);

        assert.strictEqual(resA.status, 201, 'Request A must succeed with 201');
        assert.strictEqual(resB.status, 201, 'Request B must succeed with 201 (replaying committed result)');
        assert.strictEqual(resA.body.settlement.id, resB.body.settlement.id, 'Both parallel requests must return the exact same settlement ID');

        // Confirm only 1 settlement exists in database
        const storedSettlements = await testDb.collection('settlements').find({ workerId }).toArray();
        assert.strictEqual(storedSettlements.length, 1, 'Only one settlement must exist in DB despite concurrent execution');
    });

    await t.test('5. Transactional batch-update: commit and failpoint rollback', async () => {
        const jobId = 'job-acid-batch';
        const te1 = 'te-batch-tx-1';
        const te2 = 'te-batch-tx-2';

        await testDb.collection('jobs').insertOne({
            id: jobId,
            jobCode: 'J-BATCH-TX',
            status: 'in_progress',
            actualLaborHours: 10,
            actualLaborCost: 500
        });

        await testDb.collection('time-entries').insertMany([
            { id: te1, jobId, employeeId: 'emp-acid-1', hours: 5, cost: 250, status: 'submitted', updatedAt: '2026-09-01T10:00:00.000Z', isActive: true },
            { id: te2, jobId, employeeId: 'emp-acid-1', hours: 5, cost: 250, status: 'submitted', updatedAt: '2026-09-01T10:00:00.000Z', isActive: true }
        ]);

        // A. Successful transaction batch-update
        const resSuccess = await request(app)
            .post('/api/time-entries/batch-update')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                ids: [te1, te2],
                updates: { status: 'approved' }
            });

        assert.strictEqual(resSuccess.status, 200);
        assert.strictEqual(resSuccess.body.success, true);

        const updatedEntries = await testDb.collection('time-entries').find({ id: { $in: [te1, te2] } }).toArray();
        assert.strictEqual(updatedEntries[0].status, 'approved');
        assert.strictEqual(updatedEntries[1].status, 'approved');

        // B. Rollback verification on failpoint after bulkWrite
        let resFail;
        try {
            setTestFailpoint('after_batch_bulkwrite');

            resFail = await request(app)
                .post('/api/time-entries/batch-update')
                .set('Authorization', 'Bearer ' + adminToken)
                .send({
                    ids: [te1, te2],
                    updates: { status: 'admin_rejected' }
                });
        } finally {
            setTestFailpoint(null);
        }

        assert.strictEqual(resFail.status, 500);
        assert.match(resFail.body.error, /FAILPOINT: Simulated crash after batch bulkWrite/);

        // Confirm both entries STILL have status 'approved' (the transaction was 100% rolled back!)
        const rolledBackEntries = await testDb.collection('time-entries').find({ id: { $in: [te1, te2] } }).toArray();
        assert.strictEqual(rolledBackEntries[0].status, 'approved', 'te1 must retain approved status');
        assert.strictEqual(rolledBackEntries[1].status, 'approved', 'te2 must retain approved status');

        // Confirm job has NO aggregationPending: true
        const storedJob = await testDb.collection('jobs').findOne({ id: jobId });
        assert.strictEqual(storedJob.aggregationPending, false, 'Job must not have aggregationPending: true');
    });

    await t.test('6. Readiness gate rejects transactional operations when Replica Set is absent in production', async () => {
        await testDb.collection('employees').insertOne({
            id: 'admin-acid',
            email: 'admin@kostiq.pl',
            role: 'admin',
            isActive: true
        });
        // Temporarily set isReplicaSet to false
        setDb(testDb, true, mongoClient, false);
        const oldEnv = process.env.ALLOW_NON_TRANSACTIONAL;
        const oldNodeEnv = process.env.NODE_ENV;
        delete process.env.ALLOW_NON_TRANSACTIONAL;
        process.env.NODE_ENV = 'production'; // simulate production

        const resGate = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1004')
            .send({
                workerId: 'any',
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: ['any']
            });

        assert.strictEqual(resGate.status, 503, 'Must return 503 Service Unavailable');
        assert.strictEqual(resGate.body.code, 'TRANSACTIONS_REQUIRED');

        // Restore
        process.env.NODE_ENV = oldNodeEnv;
        if (oldEnv) process.env.ALLOW_NON_TRANSACTIONAL = oldEnv;
        setDb(testDb, true, mongoClient, true);
    });

    await t.test('7. [P1 DOMAIN] workerType mismatch or collision rejection (fail-closed)', async () => {
        const workerId = 'sub-contractor-dom-1';
        const teId = 'te-sub-dom-1';

        // Employee and subcontractor share the same ID
        await testDb.collection('employees').insertOne({
            id: workerId,
            firstName: 'Jan',
            lastName: 'Pracownik',
            hourlyRate: 50,
            isActive: true
        });

        await testDb.collection('subcontractors').insertOne({
            id: workerId,
            name: 'Stolarka Podwykonawca Sp. z o.o.',
            isActive: true
        });

        await testDb.collection('jobs').insertOne({
            id: 'job-sub-dom',
            jobCode: 'J-SUB-01',
            status: 'in_progress',
            actualLaborHours: 8,
            actualLaborCost: 400
        });

        // Time entry with workerType: 'subcontractor'
        await testDb.collection('time-entries').insertOne({
            id: teId,
            jobId: 'job-sub-dom',
            employeeId: workerId,
            workerType: 'subcontractor',
            date: '2026-09-12',
            hours: 8,
            cost: 400,
            status: 'approved',
            isActive: true
        });

        // Attempting to settle a subcontractor's entry as workerType: 'employee'
        const resMismatch = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1005')
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: [teId]
            });

        assert.strictEqual(resMismatch.status, 400);
        assert.match(resMismatch.body.error, /posiada typ wykonawcy 'subcontractor', podczas gdy rozliczenie tworzone jest dla 'employee'/);
    });

    await t.test('8. [P1 DOMAIN] Period validation: invalid calendar date, inverted range, and out-of-range entry rejected', async () => {
        const workerId = 'emp-period-test';
        const teId = 'te-period-out';

        await testDb.collection('employees').insertOne({
            id: workerId,
            firstName: 'Piotr',
            lastName: 'Okresowy',
            hourlyRate: 50,
            isActive: true
        });

        await testDb.collection('jobs').insertOne({
            id: 'job-period-test',
            jobCode: 'J-PERIOD',
            status: 'in_progress'
        });

        await testDb.collection('time-entries').insertOne({
            id: teId,
            jobId: 'job-period-test',
            employeeId: workerId,
            workerType: 'employee',
            date: '2026-10-05', // October 5th!
            hours: 5,
            cost: 250,
            status: 'approved',
            isActive: true
        });

        // 1. Invalid calendar date (February 31st)
        const resBadCal = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1006')
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-02-31',
                periodTo: '2026-09-30',
                timeEntryIds: [teId]
            });
        assert.strictEqual(resBadCal.status, 400);
        assert.match(resBadCal.body.error, /poprawną datą kalendarzową/);

        // 2. Inverted date range (periodFrom > periodTo)
        const resInverted = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1007')
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-30',
                periodTo: '2026-09-01',
                timeEntryIds: [teId]
            });
        assert.strictEqual(resInverted.status, 400);
        assert.match(resInverted.body.error, /nie może być późniejsza niż data końcowa/);

        // 3. Entry date out of period (entry is 2026-10-05, period is 2026-09-01 to 2026-09-30)
        const resOutOfRange = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1008')
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: [teId]
            });
        assert.strictEqual(resOutOfRange.status, 400);
        assert.match(resOutOfRange.body.error, /wykracza poza deklarowany okres rozliczenia/);
    });

    await t.test('9. [P1 DOMAIN] Overtime calculation: excludes fixed/m2 entries and applies per-day historical rates', async () => {
        const workerId = 'emp-ot-calc';
        const te1 = 'te-ot-day1';
        const te2 = 'te-ot-day2';
        const teFixed = 'te-ot-fixed';

        await testDb.collection('employees').insertOne({
            id: workerId,
            firstName: 'Tomasz',
            lastName: 'Nadgodziny',
            hourlyRate: 50,
            isActive: true
        });

        await testDb.collection('jobs').insertOne({
            id: 'job-ot-calc',
            jobCode: 'J-OT-CALC',
            status: 'in_progress',
            actualLaborHours: 30,
            actualLaborCost: 2200
        });

        // Day 1: 10 hours at 50 zł/h (hourly) -> 8h regular + 2h overtime @ 50 * 0.5 = 50 zł
        // Day 2: 10 hours at 70 zł/h (hourly, rate increase) -> 8h regular + 2h overtime @ 70 * 0.5 = 70 zł
        // Day 2: 10 hours fixed billingType: 'fixed', cost: 1000 zł -> MUST BE EXCLUDED from overtime calculation!
        await testDb.collection('time-entries').insertMany([
            { id: te1, jobId: 'job-ot-calc', employeeId: workerId, workerType: 'employee', date: '2026-09-15', hours: 10, cost: 500, hourlyRate: 50, billingType: 'hourly', status: 'approved', isActive: true },
            { id: te2, jobId: 'job-ot-calc', employeeId: workerId, workerType: 'employee', date: '2026-09-16', hours: 10, cost: 700, hourlyRate: 70, billingType: 'hourly', status: 'approved', isActive: true },
            { id: teFixed, jobId: 'job-ot-calc', employeeId: workerId, workerType: 'employee', date: '2026-09-16', hours: 10, cost: 1000, billingType: 'fixed', status: 'approved', isActive: true }
        ]);

        const res = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1009')
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: [te1, te2, teFixed]
            });

        assert.strictEqual(res.status, 201);
        const s = res.body.settlement;
        assert.strictEqual(s.totalHours, 30);
        assert.strictEqual(s.overtimeHours, 4); // 2h on day 1 + 2h on day 2 (fixed is excluded)
        assert.strictEqual(s.overtimePay, 120);  // 2*25 + 2*35 = 50 + 70 = 120 zł
        assert.strictEqual(s.grossAmount, 2320); // base (500 + 700 + 1000 = 2200) + overtime (120) = 2320
        assert.strictEqual(s.totalAmount, 2320);
    });

    await t.test('10. [P1 DOMAIN] Advance rejection for subcontractor and fail-closed non-finite/negative advance validation', async () => {
        const subId = 'sub-adv-test';
        const empId = 'emp-adv-test';
        const jobId = 'job-adv-test';
        const teSub = 'te-sub-adv';
        const teEmp = 'te-emp-adv';
        const advValid = 'req-adv-valid';
        const advNeg = 'req-adv-neg';
        const advNonFinite = 'req-adv-nan';

        await testDb.collection('subcontractors').insertOne({ id: subId, name: 'Podwykonawca BezZaliczki', isActive: true });
        await testDb.collection('employees').insertOne({ id: empId, firstName: 'Adam', lastName: 'Zaliczka', hourlyRate: 50, isActive: true });
        await testDb.collection('jobs').insertOne({ id: jobId, jobCode: 'J-ADV', status: 'in_progress' });

        await testDb.collection('time-entries').insertMany([
            { id: teSub, jobId, employeeId: subId, workerType: 'subcontractor', date: '2026-09-10', hours: 8, cost: 400, billingType: 'hourly', hourlyRate: 50, status: 'approved', isActive: true },
            { id: teEmp, jobId, employeeId: empId, workerType: 'employee', date: '2026-09-10', hours: 8, cost: 400, billingType: 'hourly', hourlyRate: 50, status: 'approved', isActive: true }
        ]);

        await testDb.collection('requests').insertMany([
            { id: advValid, employeeId: empId, type: 'zaliczka', amount: 150, status: 'zaakceptowany', isActive: true },
            { id: advNeg, employeeId: empId, type: 'zaliczka', amount: -200, status: 'zaakceptowany', isActive: true },
            { id: advNonFinite, employeeId: empId, type: 'zaliczka', amount: 'nie-liczba', status: 'zaakceptowany', isActive: true }
        ]);

        // A. Subcontractor attempting to deduct advances -> rejected with 400
        const resSubAdv = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1010')
            .send({
                workerId: subId,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: [teSub],
                advanceIds: [advValid]
            });
        assert.strictEqual(resSubAdv.status, 400);
        assert.match(resSubAdv.body.error, /mogą być rozliczane wyłącznie dla pracowników/);

        // B. Negative advance amount -> rejected with 400
        const resNegAdv = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1011')
            .send({
                workerId: empId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: [teEmp],
                advanceIds: [advNeg]
            });
        assert.strictEqual(resNegAdv.status, 400);
        assert.match(resNegAdv.body.error, /nieprawidłową lub ujemną kwotę/);

        // C. Corrupted non-finite advance amount -> rejected with 400
        const resNaNAdv = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1012')
            .send({
                workerId: empId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: [teEmp],
                advanceIds: [advNonFinite]
            });
        assert.strictEqual(resNaNAdv.status, 400);
        assert.match(resNaNAdv.body.error, /nieprawidłową lub ujemną kwotę/);
    });

    await t.test('11. [P1 DOMAIN] Fail-closed validation for non-finite or corrupted entry financial values (hours, cost, hourlyRate)', async () => {
        const empId = 'emp-corrupt-val';
        const jobId = 'job-corrupt-val';
        await testDb.collection('employees').insertOne({ id: empId, firstName: 'Karol', lastName: 'Wartości', hourlyRate: 60, isActive: true });
        await testDb.collection('jobs').insertOne({ id: jobId, jobCode: 'J-CORRUPT', status: 'in_progress' });

        // A. Non-finite / zero hours
        await testDb.collection('time-entries').insertOne({
            id: 'te-bad-hours',
            jobId,
            employeeId: empId,
            workerType: 'employee',
            date: '2026-09-10',
            hours: 0,
            cost: 0,
            hourlyRate: 60,
            billingType: 'hourly',
            status: 'approved',
            isActive: true
        });

        const resBadHours = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1013')
            .send({
                workerId: empId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: ['te-bad-hours']
            });
        assert.strictEqual(resBadHours.status, 400);
        assert.match(resBadHours.body.error, /musi posiadać dodatnią liczbę godzin|nieprawidłową lub nienumeryczną liczbę godzin/);

        // B. Negative cost
        await testDb.collection('time-entries').insertOne({
            id: 'te-bad-cost',
            jobId,
            employeeId: empId,
            workerType: 'employee',
            date: '2026-09-11',
            hours: 5,
            cost: -300,
            hourlyRate: 60,
            billingType: 'hourly',
            status: 'approved',
            isActive: true
        });

        const resBadCost = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1014')
            .send({
                workerId: empId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: ['te-bad-cost']
            });
        assert.strictEqual(resBadCost.status, 400);
        assert.match(resBadCost.body.error, /nieprawidłowy lub nienumeryczny koszt/);

        // C. Non-positive hourlyRate for hourly entry
        await testDb.collection('time-entries').insertOne({
            id: 'te-bad-rate',
            jobId,
            employeeId: empId,
            workerType: 'employee',
            date: '2026-09-12',
            hours: 5,
            cost: 300,
            hourlyRate: 0, // invalid 0 rate
            billingType: 'hourly',
            status: 'approved',
            isActive: true
        });

        const resBadRate = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1015')
            .send({
                workerId: empId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: ['te-bad-rate']
            });
        assert.strictEqual(resBadRate.status, 400);
        assert.match(resBadRate.body.error, /nieprawidłową stawkę/);
    });

    await t.test('12. [P2 DOMAIN] Robust pending/completed idempotency reservation lifecycle with ownerToken and expired takeover', async () => {
        const workerId = 'emp-idemp-lifecycle';
        const jobId = 'job-idemp-lifecycle';
        const teId = 'te-idemp-lc';
        const idempKey = 'idemp-lc-' + Date.now();

        await testDb.collection('employees').insertOne({ id: workerId, firstName: 'Stefan', lastName: 'Cykl', hourlyRate: 50, isActive: true });
        await testDb.collection('jobs').insertOne({ id: jobId, jobCode: 'J-LC', status: 'in_progress' });
        await testDb.collection('time-entries').insertOne({
            id: teId,
            jobId,
            employeeId: workerId,
            workerType: 'employee',
            date: '2026-09-15',
            hours: 8,
            cost: 400,
            hourlyRate: 50,
            billingType: 'hourly',
            status: 'approved',
            isActive: true
        });

        const res = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: [teId]
            });

        assert.strictEqual(res.status, 201);
        const record = await testDb.collection('idempotency_keys').findOne({ key: idempKey });
        assert.ok(record, 'Idempotency record must exist');
        assert.strictEqual(record.status, 'completed', 'Idempotency record must transition to completed status');
        assert.strictEqual(record.statusCode, 201);
        assert.ok(record.ownerToken, 'Record must have ownerToken');
        assert.ok(record.expiresAt, 'Record must have expiresAt TTL');
        assert.ok(record.responseBody.settlement);

        // B. Expired pending lease takeover
        const expiredKey = 'idemp-expired-' + Date.now();
        const teExpired = 'te-idemp-expired';
        await testDb.collection('time-entries').insertOne({
            id: teExpired,
            jobId,
            employeeId: workerId,
            workerType: 'employee',
            date: '2026-09-16',
            hours: 6,
            cost: 300,
            hourlyRate: 50,
            billingType: 'hourly',
            status: 'approved',
            isActive: true
        });

        // Seed an expired pending lease with stale ownerToken
        await testDb.collection('idempotency_keys').insertOne({
            id: 'stale-lease-id',
            key: expiredKey,
            endpoint: '/api/settlements/create-atomic',
            status: 'pending',
            ownerToken: 'stale-crashed-owner',
            createdAt: new Date(Date.now() - 60000),
            expiresAt: new Date(Date.now() - 10000) // expired 10s ago
        });

        const resTakeover = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', expiredKey)
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: [teExpired]
            });

        assert.strictEqual(resTakeover.status, 201, 'Expired pending lease must be atomically taken over');
        const updatedRecord = await testDb.collection('idempotency_keys').findOne({ key: expiredKey });
        assert.strictEqual(updatedRecord.status, 'completed');
        assert.notStrictEqual(updatedRecord.ownerToken, 'stale-crashed-owner', 'Owner token must be updated by winning request');
    });

    await t.test('13. [P1 DOMAIN] Validation failure (400) leaves NO pending idempotency document; immediate retry with corrected payload succeeds with same Idempotency-Key', async () => {
        const workerId = 'emp-val-retry';
        const jobId = 'job-val-retry';
        const teId = 'te-val-retry';
        const sharedIdempKey = 'idemp-val-retry-' + Date.now();

        await testDb.collection('employees').insertOne({ id: workerId, firstName: 'Piotr', lastName: 'Ponowienie', hourlyRate: 60, isActive: true });
        await testDb.collection('jobs').insertOne({ id: jobId, jobCode: 'J-VAL-RETRY', status: 'in_progress' });
        await testDb.collection('time-entries').insertOne({
            id: teId,
            jobId,
            employeeId: workerId,
            workerType: 'employee',
            date: '2026-09-20',
            hours: 8,
            cost: 480,
            hourlyRate: 60,
            billingType: 'hourly',
            status: 'approved',
            isActive: true
        });

        // 1. Submit invalid request (inverted period: periodFrom > periodTo)
        const invalidRes = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', sharedIdempKey)
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-30',
                periodTo: '2026-09-01', // invalid: from > to
                timeEntryIds: [teId]
            });

        assert.strictEqual(invalidRes.status, 400);
        assert.match(invalidRes.body.error, /nie może być późniejsza/);

        // 2. CRITICAL ASSERTION: No pending document exists in idempotency_keys
        const pendingDoc = await testDb.collection('idempotency_keys').findOne({ key: sharedIdempKey });
        assert.strictEqual(pendingDoc, null, 'No pending document must exist after a 400 validation error');

        // 3. Immediately retry with corrected valid payload using the EXACT SAME Idempotency-Key
        const validRes = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', sharedIdempKey)
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30', // corrected
                timeEntryIds: [teId]
            });

        assert.strictEqual(validRes.status, 201, 'Corrected request with same idempotency key must succeed with 201');
        assert.ok(validRes.body.settlement);

        // 4. Verify completed idempotency record is recorded
        const finalDoc = await testDb.collection('idempotency_keys').findOne({ key: sharedIdempKey });
        assert.ok(finalDoc);
        assert.strictEqual(finalDoc.status, 'completed');
    });

    await t.test('14. [P1 DOMAIN] Strict BSON/JS type check, billingType whitelist, and cost vs (hours * rate) consistency check', async () => {
        const empId = 'emp-strict-types';
        const jobId = 'job-strict-types';
        await testDb.collection('employees').insertOne({ id: empId, firstName: 'Marek', lastName: 'Typy', hourlyRate: 50, isActive: true });
        await testDb.collection('jobs').insertOne({ id: jobId, jobCode: 'J-STRICT', status: 'in_progress' });

        // A. String hours instead of number: rejected fail-closed
        await testDb.collection('time-entries').insertOne({
            id: 'te-str-hours',
            jobId,
            employeeId: empId,
            workerType: 'employee',
            date: '2026-09-10',
            hours: '8', // string!
            cost: 400,
            hourlyRate: 50,
            billingType: 'hourly',
            status: 'approved',
            isActive: true
        });

        const resStrHours = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1016')
            .send({
                workerId: empId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: ['te-str-hours']
            });
        assert.strictEqual(resStrHours.status, 400);
        assert.match(resStrHours.body.error, /nienumeryczną liczbę godzin/);

        // B. Null/empty cost: rejected fail-closed
        await testDb.collection('time-entries').insertOne({
            id: 'te-null-cost',
            jobId,
            employeeId: empId,
            workerType: 'employee',
            date: '2026-09-11',
            hours: 8,
            cost: null, // null!
            hourlyRate: 50,
            billingType: 'hourly',
            status: 'approved',
            isActive: true
        });

        const resNullCost = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1017')
            .send({
                workerId: empId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: ['te-null-cost']
            });
        assert.strictEqual(resNullCost.status, 400);
        assert.match(resNullCost.body.error, /nienumeryczny koszt/);

        // C. Unsupported billingType: rejected fail-closed
        await testDb.collection('time-entries').insertOne({
            id: 'te-bad-billingtype',
            jobId,
            employeeId: empId,
            workerType: 'employee',
            date: '2026-09-12',
            hours: 8,
            cost: 400,
            hourlyRate: 50,
            billingType: 'unknown_custom_tariff', // unsupported
            status: 'approved',
            isActive: true
        });

        const resBadBilling = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1018')
            .send({
                workerId: empId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: ['te-bad-billingtype']
            });
        assert.strictEqual(resBadBilling.status, 400);
        assert.match(resBadBilling.body.error, /nieznany typ rozliczenia/);

        // D. Hourly cost inconsistency: hours * hourlyRate != cost
        await testDb.collection('time-entries').insertOne({
            id: 'te-inconsistent-hourly-cost',
            jobId,
            employeeId: empId,
            workerType: 'employee',
            date: '2026-09-13',
            hours: 8,
            cost: 999, // 8 * 50 = 400 != 999
            hourlyRate: 50,
            billingType: 'hourly',
            status: 'approved',
            isActive: true
        });

        const resInconsistentCost = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1019')
            .send({
                workerId: empId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: ['te-inconsistent-hourly-cost']
            });
        assert.strictEqual(resInconsistentCost.status, 400);
        assert.match(resInconsistentCost.body.error, /niespójny koszt/);

        // E. m2 cost inconsistency: quantity * rate != cost
        await testDb.collection('time-entries').insertOne({
            id: 'te-inconsistent-m2-cost',
            jobId,
            employeeId: empId,
            workerType: 'employee',
            date: '2026-09-14',
            hours: 5,
            quantity: 10,
            rate: 25,
            cost: 500, // 10 * 25 = 250 != 500
            billingType: 'm2',
            status: 'approved',
            isActive: true
        });

        const resInconsistentM2 = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1020')
            .send({
                workerId: empId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: ['te-inconsistent-m2-cost']
            });
        assert.strictEqual(resInconsistentM2.status, 400);
        assert.match(resInconsistentM2.body.error, /niespójny koszt/);
    });

    await t.test('15. [P1 DOMAIN] Non-hourly entries (m2, mb, fixed) allow hours=0 while hourly strictly requires hours > 0', async () => {
        const workerId = 'emp-zero-hours';
        const jobId = 'job-zero-hours';
        await testDb.collection('employees').insertOne({ id: workerId, firstName: 'Marek', lastName: 'Akord', hourlyRate: 50, isActive: true });
        await testDb.collection('jobs').insertOne({ id: jobId, jobCode: 'J-ZERO', status: 'in_progress' });

        // Piecework m2 entry with hours: 0
        await testDb.collection('time-entries').insertOne({
            id: 'te-m2-zero',
            jobId,
            employeeId: workerId,
            workerType: 'employee',
            date: '2026-09-15',
            hours: 0,
            quantity: 15,
            rate: 20,
            cost: 300,
            billingType: 'm2',
            status: 'approved',
            isActive: true
        });

        // Fixed-cost lump-sum entry with hours: 0
        await testDb.collection('time-entries').insertOne({
            id: 'te-fixed-zero',
            jobId,
            employeeId: workerId,
            workerType: 'employee',
            date: '2026-09-16',
            hours: 0,
            cost: 700,
            billingType: 'fixed',
            status: 'approved',
            isActive: true
        });

        // Should successfully settle both non-hourly entries with hours=0
        const res = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1021')
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: ['te-m2-zero', 'te-fixed-zero']
            });

        assert.strictEqual(res.status, 201, 'Settlement with hours=0 for m2 and fixed entries must succeed');
        const s = res.body.settlement;
        assert.strictEqual(s.totalHours, 0);
        assert.strictEqual(s.grossAmount, 1000); // 300 + 700 = 1000 zł
        assert.strictEqual(s.totalAmount, 1000);
        assert.strictEqual(s.overtimeHours, 0);
        assert.strictEqual(s.overtimePay, 0);

        // Hourly with hours: 0 must still be rejected
        await testDb.collection('time-entries').insertOne({
            id: 'te-hourly-zero',
            jobId,
            employeeId: workerId,
            workerType: 'employee',
            date: '2026-09-17',
            hours: 0,
            cost: 0,
            hourlyRate: 50,
            billingType: 'hourly',
            status: 'approved',
            isActive: true
        });

        const resHourlyZero = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1022')
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: ['te-hourly-zero']
            });
        assert.strictEqual(resHourlyZero.status, 400);
        assert.match(resHourlyZero.body.error, /musi posiadać dodatnią liczbę godzin/);
    });

    await t.test('16. [P1 DOMAIN] Idempotency lease loss (matchedCount !== 1) immediately aborts transaction and rolls back changes', async () => {
        const workerId = 'emp-lease-loss';
        const jobId = 'job-lease-loss';
        const teId = 'te-lease-loss';
        const idempKey = 'idemp-loss-' + Date.now();

        await testDb.collection('employees').insertOne({ id: workerId, firstName: 'Leon', lastName: 'Utrata', hourlyRate: 60, isActive: true });
        await testDb.collection('jobs').insertOne({ id: jobId, jobCode: 'J-LOSS', status: 'in_progress', actualLaborHours: 8, actualLaborCost: 480, settledLaborCost: 0 });
        await testDb.collection('time-entries').insertOne({
            id: teId,
            jobId,
            employeeId: workerId,
            workerType: 'employee',
            date: '2026-09-18',
            hours: 8,
            cost: 480,
            hourlyRate: 60,
            billingType: 'hourly',
            status: 'approved',
            isActive: true
        });

        const { setTestFailpoint } = require('../server.js');
        setTestFailpoint('invalidate_lease_before_commit');

        try {
            const res = await request(app)
                .post('/api/settlements/create-atomic')
                .set('Authorization', 'Bearer ' + adminToken)
                .set('Idempotency-Key', idempKey)
                .send({
                    workerId,
                    workerType: 'employee',
                    periodFrom: '2026-09-01',
                    periodTo: '2026-09-30',
                    timeEntryIds: [teId]
                });

            assert.strictEqual(res.status, 409, 'Lease loss must return 409 Conflict');
            assert.match(res.body.error, /Utrata dzierżawy idempotencji/);

            // Verify full transaction rollback: time entry MUST NOT have settlementId
            const entryAfter = await testDb.collection('time-entries').findOne({ id: teId });
            assert.strictEqual(entryAfter.settlementId, undefined, 'Time entry must not have settlementId after transaction rollback');

            // Verify no settlement created
            const settlements = await testDb.collection('settlements').find({ workerId }).toArray();
            assert.strictEqual(settlements.length, 0, 'No settlement must exist after transaction rollback');
        } finally {
            setTestFailpoint(null);
        }
    });

    await t.test('17. [P2 DOMAIN] Strict CreateAtomicSettlementPayload schema: rejects extra fields, duplicate IDs, and invalid types', async () => {
        const workerId = 'emp-schema-check';
        const jobId = 'job-schema-check';
        await testDb.collection('employees').insertOne({ id: workerId, firstName: 'Anna', lastName: 'Schemat', hourlyRate: 50, isActive: true });
        await testDb.collection('jobs').insertOne({ id: jobId, jobCode: 'J-SCHEMA', status: 'in_progress' });
        await testDb.collection('time-entries').insertOne({
            id: 'te-schema-1',
            jobId,
            employeeId: workerId,
            workerType: 'employee',
            date: '2026-09-19',
            hours: 8,
            cost: 400,
            hourlyRate: 50,
            billingType: 'hourly',
            status: 'approved',
            isActive: true
        });

        // A. Reject extra unexpected field
        const resExtra = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1023')
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: ['te-schema-1'],
                unexpectedExtraField: 'malicious_or_accidental'
            });
        assert.strictEqual(resExtra.status, 400);
        assert.match(resExtra.body.error, /Niedozwolone dodatkowe pola/);

        // B. Reject duplicate timeEntryIds
        const resDupTe = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1024')
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: ['te-schema-1', 'te-schema-1'] // duplicate!
            });
        assert.strictEqual(resDupTe.status, 400);
        assert.match(resDupTe.body.error, /zawiera zduplikowane identyfikatory/);

        // C. Reject non-array advanceIds
        const resNonArrAdv = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1025')
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: ['te-schema-1'],
                advanceIds: 'not-an-array' // invalid type!
            });
        assert.strictEqual(resNonArrAdv.status, 400);
        assert.match(resNonArrAdv.body.error, /musi być tablicą identyfikatorów/);

        // D. Reject duplicate advanceIds
        const resDupAdv = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1026')
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: ['te-schema-1'],
                advanceIds: ['req-adv-1', 'req-adv-1'] // duplicate!
            });
        assert.strictEqual(resDupAdv.status, 400);
        assert.match(resDupAdv.body.error, /zawiera zduplikowane identyfikatory/);

        // E. Reject invalid settlement type
        const resInvalidType = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1027')
            .send({
                workerId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: ['te-schema-1'],
                type: 'crypto_barter' // invalid type
            });
        assert.strictEqual(resInvalidType.status, 400);
        assert.match(resInvalidType.body.error, /Nieprawidłowy typ rozliczenia/);
    });

    await t.test('18. [P1 DOMAIN] Contract settlement: atomic creation, contract validation, and job recalculation', async () => {
        const subId = 'sub-contract-test-1';
        const jobId = 'job-contract-test-1';
        const contractId = 'contract-test-1';
        const nowIso = new Date().toISOString();

        // 1. Seed subcontractor, job, and contract
        await testDb.collection('subcontractors').insertOne({
            id: subId,
            name: 'Stol-Drew Usługi',
            type: 'subcontractor',
            createdAt: nowIso
        });

        await testDb.collection('jobs').insertOne({
            id: jobId,
            name: 'Zlecenie Montażu Mebli',
            totalLaborCost: 0,
            actualLaborCost: 0,
            settledLaborCost: 0,
            createdAt: nowIso
        });

        await testDb.collection('subcontractor_contracts').insertOne({
            id: contractId,
            subcontractorId: subId,
            jobId: jobId,
            stageId: 'stage-montaz',
            description: 'Montaż stolarki i frontów',
            totalAmountNet: 10000,
            currency: 'PLN',
            createdAt: nowIso,
            updatedAt: nowIso
        });

        const idempKey = 'idemp-contract-succ-1';
        const payload = {
            workerId: subId,
            workerType: 'subcontractor',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            type: 'contract',
            contractId: contractId,
            jobId: jobId,
            stageId: 'stage-montaz',
            amount: 4000,
            notes: 'Część 1 za etap montażu'
        };

        // 2. Perform atomic settlement
        const res = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send(payload);

        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.settlement.type, 'contract');
        assert.strictEqual(res.body.settlement.contractId, contractId);
        assert.strictEqual(res.body.settlement.jobId, jobId);
        assert.strictEqual(res.body.settlement.stageId, 'stage-montaz');
        assert.strictEqual(res.body.settlement.totalAmount, 4000);
        assert.strictEqual(res.body.settlement.grossAmount, 4000);
        assert.strictEqual(res.body.settlement.totalHours, 0);

        // Verify in DB
        const saved = await testDb.collection('settlements').findOne({ id: res.body.settlement.id });
        assert.ok(saved);
        assert.strictEqual(saved.contractId, contractId);
        assert.strictEqual(saved.totalAmount, 4000);
        assert.strictEqual(saved.jobId, jobId);

        // 3. Retry with same idempotency key returns exact same settlement
        const retryRes = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send(payload);

        assert.strictEqual(retryRes.status, 201);
        assert.strictEqual(retryRes.body.settlement.id, res.body.settlement.id);
        const count = await testDb.collection('settlements').countDocuments({ contractId });
        assert.strictEqual(count, 1, 'Should NOT create duplicate settlement on retry');
    });

    await t.test('19. [P1 DOMAIN] Contract settlement: enforces cumulative limit and rejects subcontractor mismatch', async () => {
        const sub1 = 'sub-limit-1';
        const sub2 = 'sub-limit-2';
        const jobId = 'job-limit-1';
        const contractId = 'contract-limit-1';
        const nowIso = new Date().toISOString();

        await testDb.collection('subcontractors').insertMany([
            { id: sub1, name: 'Podwykonawca A', type: 'subcontractor', createdAt: nowIso },
            { id: sub2, name: 'Podwykonawca B', type: 'subcontractor', createdAt: nowIso }
        ]);

        await testDb.collection('subcontractor_contracts').insertOne({
            id: contractId,
            subcontractorId: sub1,
            jobId: jobId,
            totalAmountNet: 5000,
            currency: 'PLN',
            createdAt: nowIso
        });

        // A. Subcontractor mismatch: contract belongs to sub1, request is for sub2
        const resMismatch = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1028')
            .send({
                workerId: sub2,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: contractId,
                amount: 1000
            });
        assert.strictEqual(resMismatch.status, 400);
        assert.match(resMismatch.body.error, /należy do innego podwykonawcy/);

        // B. Settle 3500 (allowed, <= 5000)
        const resSettle1 = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1029')
            .send({
                workerId: sub1,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: contractId,
                amount: 3500
            });
        assert.strictEqual(resSettle1.status, 201);

        // C. Settle another 2000 (rejected: 3500 + 2000 = 5500 > 5000 limit)
        const resExceed = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1030')
            .send({
                workerId: sub1,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: contractId,
                amount: 2000
            });
        assert.strictEqual(resExceed.status, 400);
        assert.match(resExceed.body.error, /przekracza pozostały limit kontraktu/);

        // D. Settle remaining 1500 (allowed: 3500 + 1500 = 5000)
        const resSettle2 = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-auto-1031')
            .send({
                workerId: sub1,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: contractId,
                amount: 1500
            });
        assert.strictEqual(resSettle2.status, 201);
    });

    await t.test('20. [P1 DOMAIN] Idempotency canonical hash includes contractId, jobId, stageId, and amount', async () => {
        const subId = 'sub-hash-test';
        const nowIso = new Date().toISOString();

        await testDb.collection('subcontractors').insertOne({ id: subId, name: 'Sub Hash', type: 'subcontractor', createdAt: nowIso });
        await testDb.collection('subcontractor_contracts').insertMany([
            { id: 'c-hash-1', subcontractorId: subId, totalAmountNet: 10000, createdAt: nowIso },
            { id: 'c-hash-2', subcontractorId: subId, totalAmountNet: 10000, createdAt: nowIso }
        ]);

        const key = 'shared-idemp-key-test';

        // 1. First request with c-hash-1
        const res1 = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', key)
            .send({
                workerId: subId,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: 'c-hash-1',
                amount: 1000
            });
        assert.strictEqual(res1.status, 201);

        // 2. Second request with SAME key but DIFFERENT contractId ('c-hash-2')
        // MUST return 409 conflict, NOT silent success or corrupting association!
        const resDiffContract = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', key)
            .send({
                workerId: subId,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: 'c-hash-2',
                amount: 1000
            });
        assert.strictEqual(resDiffContract.status, 409);
        assert.match(resDiffContract.body.error, /innym payloadzie/);

        // 3. Third request with SAME key and SAME contractId but DIFFERENT amount (2000)
        const resDiffAmount = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', key)
            .send({
                workerId: subId,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: 'c-hash-1',
                amount: 2000
            });
        assert.strictEqual(resDiffAmount.status, 409);
        assert.match(resDiffAmount.body.error, /innym payloadzie/);
    });


    await t.test('21. [P1 DOMAIN] Mandatory Idempotency-Key: rejects missing, empty, or overly long keys', async () => {
        const subId = 'sub-idemp-req-test';
        await testDb.collection('subcontractors').insertOne({ id: subId, name: 'Sub Idemp', type: 'subcontractor' });
        await testDb.collection('subcontractor_contracts').insertOne({ id: 'c-idemp-req', subcontractorId: subId, totalAmountNet: 5000 });

        const validBody = {
            workerId: subId,
            workerType: 'subcontractor',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            type: 'contract',
            contractId: 'c-idemp-req',
            amount: 1000
        };

        // A. Missing key
        const resMissing = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .send(validBody);
        assert.strictEqual(resMissing.status, 400);
        assert.match(resMissing.body.error, /Idempotency-Key/);

        // B. Empty string key
        const resEmpty = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', '   ')
            .send(validBody);
        assert.strictEqual(resEmpty.status, 400);
        assert.match(resEmpty.body.error, /Idempotency-Key/);

        // C. Key > 128 chars
        const resTooLong = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'k'.repeat(129))
            .send(validBody);
        assert.strictEqual(resTooLong.status, 400);
        assert.match(resTooLong.body.error, /Idempotency-Key/);
    });

    await t.test('22. [P1 DOMAIN] Contract limit CAS: prevents write skew under parallel settlement requests', async () => {
        const subId = 'sub-parallel-race';
        const contractId = 'contract-parallel-race';
        const nowIso = new Date().toISOString();

        await testDb.collection('subcontractors').insertOne({ id: subId, name: 'Sub Race', type: 'subcontractor', createdAt: nowIso });
        await testDb.collection('subcontractor_contracts').insertOne({
            id: contractId,
            subcontractorId: subId,
            totalAmountNet: 5000,
            currency: 'PLN',
            createdAt: nowIso
        });

        // Launch 2 concurrent settlement requests for 3500 PLN each with DIFFERENT idempotency keys
        // (If limit was not protected by atomic CAS on contract, both could slip through under snapshot isolation)
        const req1 = request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-race-parallel-A')
            .send({
                workerId: subId,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: contractId,
                amount: 3500
            });

        const req2 = request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-race-parallel-B')
            .send({
                workerId: subId,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: contractId,
                amount: 3500
            });

        const [res1, res2] = await Promise.all([req1, req2]);
        const statuses = [res1.status, res2.status].sort();

        // Exactly one must succeed with 201, and the other must be rejected with 400 or 409
        assert.strictEqual(statuses[0], 201, 'One parallel request must succeed');
        assert.ok([400, 409].includes(statuses[1]), `Second parallel request must fail with 400 or 409 (got ${statuses[1]})`);

        // Verify database state: total amount settled must NOT exceed 5000
        const settlements = await testDb.collection('settlements').find({ contractId }).toArray();
        assert.strictEqual(settlements.length, 1, 'Only one settlement must exist in DB');
        assert.strictEqual(settlements[0].totalAmount, 3500);

        const updatedContract = await testDb.collection('subcontractor_contracts').findOne({ id: contractId });
        assert.strictEqual(updatedContract.settledAmountCents, 350000);
    });

    await t.test('23. [P1 DOMAIN] EUR contract settlements: converted to PLN in job labor costs using exchangeRate', async () => {
        const subId = 'sub-eur-test';
        const jobId = 'job-eur-test';
        const contractId = 'contract-eur-test';
        const nowIso = new Date().toISOString();

        await testDb.collection('subcontractors').insertOne({ id: subId, name: 'Sub EUR', type: 'subcontractor', createdAt: nowIso });
        await testDb.collection('jobs').insertOne({
            id: jobId,
            name: 'Job EUR Construction',
            actualLaborCost: 0,
            settledLaborCost: 0,
            createdAt: nowIso
        });
        await testDb.collection('subcontractor_contracts').insertOne({
            id: contractId,
            subcontractorId: subId,
            jobId: jobId,
            totalAmountNet: 2000,
            currency: 'EUR',
            createdAt: nowIso
        });

        // Settle 1000 EUR with explicit exchangeRate 4.50 PLN/EUR
        const res = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-eur-settle-1')
            .send({
                workerId: subId,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: contractId,
                amount: 1000,
                exchangeRate: 4.50
            });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.settlement.currency, 'EUR');
        assert.strictEqual(res.body.settlement.totalAmount, 1000);
        assert.strictEqual(res.body.settlement.exchangeRate, 4.50);
        assert.strictEqual(res.body.settlement.amountInPln, 4500);

        // Verify Job actualLaborCost is 4500 PLN (not 1000!)
        const updatedJob = await testDb.collection('jobs').findOne({ id: jobId });
        assert.strictEqual(updatedJob.actualLaborCost, 4500, 'actualLaborCost must be converted to base currency PLN');
    });

    await t.test('24. [P2 DOMAIN] HTTP DELETE settlement immediately synchronizes settledAmountCents on contract and releases limit', async () => {
        const subId = 'sub-soft-del';
        const contractId = 'contract-soft-del';
        const nowIso = new Date().toISOString();

        await testDb.collection('subcontractors').insertOne({ id: subId, name: 'Sub Soft Del', type: 'subcontractor', createdAt: nowIso });
        await testDb.collection('subcontractor_contracts').insertOne({
            id: contractId,
            subcontractorId: subId,
            totalAmountNet: 5000,
            currency: 'PLN',
            createdAt: nowIso
        });

        // 1. Settle 3500 PLN
        const res1 = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-soft-del-1')
            .send({
                workerId: subId,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: contractId,
                amount: 3500
            });
        assert.strictEqual(res1.status, 201);
        const settlement1Id = res1.body.settlement.id;

        // Verify contract has settledAmountCents = 350000
        const contractAfterSettle = await testDb.collection('subcontractor_contracts').findOne({ id: contractId });
        assert.strictEqual(contractAfterSettle.settledAmountCents, 350000);

        // 2. Settle 2000 PLN fails (3500 + 2000 = 5500 > 5000)
        const resExceed = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-soft-del-exceed')
            .send({
                workerId: subId,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: contractId,
                amount: 2000
            });
        assert.strictEqual(resExceed.status, 400);

        // 3. Real HTTP DELETE /api/settlements/:id
        const deleteRes = await request(app)
            .delete('/api/settlements/' + settlement1Id)
            .set('Authorization', 'Bearer ' + adminToken);
        assert.ok([200, 204].includes(deleteRes.status), `Expected 200 or 204 on delete, got ${deleteRes.status}`);

        // Verify contract settledAmountCents was immediately synchronized back to 0
        const contractAfterDelete = await testDb.collection('subcontractor_contracts').findOne({ id: contractId });
        assert.strictEqual(contractAfterDelete.settledAmountCents, 0, 'Contract settledAmountCents must be reset to 0 by afterMutation in settlements router');

        // 4. Settle 5000 PLN now SUCCEEDS (full limit restored)
        const resAfterDelete = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-soft-del-after')
            .send({
                workerId: subId,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: contractId,
                amount: 5000
            });
        assert.strictEqual(resAfterDelete.status, 201);
        assert.strictEqual(resAfterDelete.body.settlement.totalAmount, 5000);
    });

    await t.test('25. [P1 DOMAIN] CAS filter with $and: settling contract A NEVER modifies contract B of same subcontractor', async () => {
        const subId = 'sub-two-contracts';
        const contractA = 'contract-A-isolate';
        const contractB = 'contract-B-isolate';
        const nowIso = new Date().toISOString();

        await testDb.collection('subcontractors').insertOne({ id: subId, name: 'Sub Multi Contracts', type: 'subcontractor', createdAt: nowIso });
        await testDb.collection('subcontractor_contracts').insertMany([
            { id: contractA, subcontractorId: subId, totalAmountNet: 8000, version: 0, settledAmountCents: 0, createdAt: nowIso },
            { id: contractB, subcontractorId: subId, totalAmountNet: 9000, version: 0, settledAmountCents: 0, createdAt: nowIso }
        ]);

        // Settle contract A for 3000
        const res = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-isolate-contract-A')
            .send({
                workerId: subId,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: contractA,
                amount: 3000
            });
        assert.strictEqual(res.status, 201);

        // Verify contract A is updated
        const docA = await testDb.collection('subcontractor_contracts').findOne({ id: contractA });
        assert.strictEqual(docA.settledAmountCents, 300000);
        assert.strictEqual(docA.version, 1);

        // Verify contract B is 100% UNTOUCHED (CAS did NOT overwrite $or id filter)
        const docB = await testDb.collection('subcontractor_contracts').findOne({ id: contractB });
        assert.strictEqual(docB.settledAmountCents, 0, 'Contract B settledAmountCents must remain 0');
        assert.strictEqual(docB.version, 0, 'Contract B version must remain 0');
    });

    await t.test('26. [P1 DOMAIN] Fail-closed EUR currency handling: rejects settlement without explicit exchange rate', async () => {
        const subId = 'sub-eur-failclosed';
        const contractId = 'contract-eur-no-rate';
        const nowIso = new Date().toISOString();

        await testDb.collection('subcontractors').insertOne({ id: subId, name: 'Sub EUR Failclosed', type: 'subcontractor', createdAt: nowIso });
        await testDb.collection('subcontractor_contracts').insertOne({
            id: contractId,
            subcontractorId: subId,
            totalAmountNet: 5000,
            currency: 'EUR',
            // No exchangeRate on contract!
            createdAt: nowIso
        });

        // 1. Settle EUR without providing exchangeRate -> MUST FAIL with 400 (fail-closed, no silent 4.30)
        const resNoRate = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-eur-norate-fail')
            .send({
                workerId: subId,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: contractId,
                amount: 1000
            });
        assert.strictEqual(resNoRate.status, 400);
        assert.match(resNoRate.body.error, /wymagany jest jawny, utrwalony kurs wymiany waluty/);

        // 2. Settle EUR with explicit exchangeRate -> SUCCEEDS with 201
        const resWithRate = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-eur-rate-ok')
            .send({
                workerId: subId,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: contractId,
                amount: 1000,
                exchangeRate: 4.45
            });
        assert.strictEqual(resWithRate.status, 201);
        assert.strictEqual(resWithRate.body.settlement.currency, 'EUR');
        assert.strictEqual(resWithRate.body.settlement.exchangeRate, 4.45);
        assert.strictEqual(resWithRate.body.settlement.amountInPln, 4450);
    });

    await t.test('27. [P1 DOMAIN] Historical EUR recalculation fail-closed: flags job aggregationPending when legacy settlement lacks exchangeRate (no 4.30)', async () => {
        const jobId = 'job-hist-eur-norate';
        const settlementId = 'settlement-hist-legacy-eur';
        const nowIso = new Date().toISOString();

        await testDb.collection('jobs').insertOne({
            id: jobId,
            name: 'Historical EUR Job',
            status: 'in_progress',
            actualLaborCost: 0,
            aggregationPending: false,
            createdAt: nowIso
        });

        // Insert legacy settlement with currency='EUR' but NO amountInPln, NO baseAmount, NO exchangeRate, NO contract
        await testDb.collection('settlements').insertOne({
            id: settlementId,
            jobId: jobId,
            workerId: 'sub-legacy-1',
            workerType: 'subcontractor',
            type: 'contract',
            totalAmount: 1000,
            currency: 'EUR',
            status: 'closed',
            isActive: true,
            createdAt: nowIso
        });

        // Trigger recalculation through test helper or mutation
        const { recalculateJobLaborCosts } = require('../server');
        if (typeof recalculateJobLaborCosts === 'function') {
            await recalculateJobLaborCosts(jobId);
        }

        const jobAfterRecalc = await testDb.collection('jobs').findOne({ id: jobId });
        assert.strictEqual(jobAfterRecalc.aggregationPending, true, 'Job must be marked aggregationPending: true');
        assert.match(jobAfterRecalc.aggregationError, /nie posiada utrwalonego kursu wymiany ani kwoty w PLN/);
        assert.strictEqual(jobAfterRecalc.actualLaborCost, 0, 'Must NOT inject fictitious 4300 PLN cost from arbitrary 4.30');
    });

    await t.test('28. [P2 DOMAIN] Single exchangeRate normalization: identical precision in canonical hash, calculation, and document', async () => {
        const subId = 'sub-norm-rate';
        const contractId = 'contract-norm-rate';
        const nowIso = new Date().toISOString();

        await testDb.collection('subcontractors').insertOne({ id: subId, name: 'Sub Norm Rate', type: 'subcontractor', createdAt: nowIso });
        await testDb.collection('subcontractor_contracts').insertOne({
            id: contractId,
            subcontractorId: subId,
            totalAmountNet: 10000,
            currency: 'EUR',
            createdAt: nowIso
        });

        // Settle with precision beyond 4 decimal places (e.g. 4.28567)
        // Normalized rate should be 4.2857 everywhere (hash, calc, and saved settlement)
        const res = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-norm-rate-1')
            .send({
                workerId: subId,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: contractId,
                amount: 1000,
                exchangeRate: 4.28567
            });

        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.settlement.exchangeRate, 4.2857);
        assert.strictEqual(res.body.settlement.amountInPln, 4285.7);

        // A second request with same idempotency key but different rate (e.g. 4.35) MUST return 409 Conflict
        const resConflict = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-norm-rate-1')
            .send({
                workerId: subId,
                workerType: 'subcontractor',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                type: 'contract',
                contractId: contractId,
                amount: 1000,
                exchangeRate: 4.35
            });

        assert.strictEqual(resConflict.status, 409);
        assert.match(resConflict.body.error, /Idempotency Key Conflict/);
    });

    await t.test('29. [P1 DOMAIN] DELETE hourly settlement: unlinks time-entries and advances, preventing orphaned references and allowing re-settlement', async () => {
        const empId = 'emp-hourly-del';
        const jobId = 'job-hourly-del';
        const teId = 'te-hourly-del-1';
        const advId = 'adv-hourly-del-1';
        const nowIso = new Date().toISOString();

        await testDb.collection('employees').insertOne({
            id: empId,
            name: 'Worker For Delete',
            hourlyRate: 60,
            active: true,
            createdAt: nowIso
        });

        await testDb.collection('jobs').insertOne({
            id: jobId,
            name: 'Job For Hourly Delete',
            status: 'in_progress',
            actualLaborCost: 480,
            settledLaborCost: 0,
            createdAt: nowIso
        });

        await testDb.collection('time-entries').insertOne({
            id: teId,
            employeeId: empId,
            jobId: jobId,
            date: '2026-09-15',
            hours: 8,
            cost: 480,
            status: 'approved',
            billingType: 'hourly',
            isActive: true,
            createdAt: nowIso
        });

        await testDb.collection('requests').insertOne({
            id: advId,
            type: 'zaliczka',
            employeeId: empId,
            amount: 100,
            status: 'zaakceptowany',
            createdAt: nowIso
        });

        // 1. Create settlement via POST /api/settlements/create-atomic
        const createRes = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-hourly-del-create')
            .send({
                workerId: empId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: [teId],
                advanceIds: [advId]
            });

        assert.strictEqual(createRes.status, 201);
        const settlementId = createRes.body.settlement.id;

        // Verify time-entry and advance now have settlementId
        const teAfterCreate = await testDb.collection('time-entries').findOne({ id: teId });
        assert.strictEqual(teAfterCreate.settlementId, settlementId);

        const advAfterCreate = await testDb.collection('requests').findOne({ id: advId });
        assert.strictEqual(advAfterCreate.settlementId, settlementId);

        // 2. HTTP DELETE /api/settlements/:id
        const deleteRes = await request(app)
            .delete('/api/settlements/' + settlementId)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(deleteRes.status, 204);

        // Verify settlement document is deleted
        const settlementInDb = await testDb.collection('settlements').findOne({ id: settlementId });
        assert.strictEqual(settlementInDb, null, 'Settlement document must be deleted');

        // Verify time-entry settlementId is unset
        const teAfterDelete = await testDb.collection('time-entries').findOne({ id: teId });
        assert.strictEqual(teAfterDelete.settlementId, undefined, 'time-entry settlementId must be unlinked');

        // Verify advance settlementId is unset
        const advAfterDelete = await testDb.collection('requests').findOne({ id: advId });
        assert.strictEqual(advAfterDelete.settlementId, undefined, 'advance settlementId must be unlinked');

        // 3. Verify the unlinked time-entry and advance can be re-settled in a NEW settlement!
        const recreateRes = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-hourly-del-recreate')
            .send({
                workerId: empId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: [teId],
                advanceIds: [advId]
            });

        assert.strictEqual(recreateRes.status, 201, 'Unlinked time-entry and advance must be re-settleable without conflict');
        assert.strictEqual(recreateRes.body.settlement.totalAmount, 380); // 480 - 100 advance = 380
    });

    await t.test('30. [P1 DOMAIN] DELETE /api/settlements/:id fail-closed when Replica Set is absent or startSession() fails', async () => {
        const testSId = 'settlement-failclosed-test';
        const nowIso = new Date().toISOString();
        await testDb.collection('settlements').insertOne({
            id: testSId,
            workerId: 'emp-fc',
            workerType: 'employee',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            totalAmount: 500,
            status: 'open',
            createdAt: nowIso
        });

        const oldNodeEnv = process.env.NODE_ENV;
        const oldAllow = process.env.ALLOW_NON_TRANSACTIONAL;
        try {
            process.env.NODE_ENV = 'production';
            delete process.env.ALLOW_NON_TRANSACTIONAL;

            // 1. Without Replica Set (isReplicaSet = false) -> MUST FAIL with 503
            setDb(testDb, true, mongoClient, false);
            const resNoReplSet = await request(app)
                .delete('/api/settlements/' + testSId)
                .set('Authorization', 'Bearer ' + adminToken);

            assert.strictEqual(resNoReplSet.status, 503, 'Must reject with 503 when replica set is missing');
            assert.strictEqual(resNoReplSet.body.code, 'TRANSACTIONS_REQUIRED');

            // Settlement must remain untouched
            const inDbAfter1 = await testDb.collection('settlements').findOne({ id: testSId });
            assert.ok(inDbAfter1, 'Settlement must not be deleted when replica set is missing');

            // 2. With isReplicaSet = true BUT startSession() throws an error -> MUST FAIL with 503 (fail-closed, NO non-transactional fallback!)
            const mockFaultyClient = {
                startSession: () => {
                    throw new Error('Simulated startSession failure / pool exhaustion');
                }
            };
            setDb(testDb, true, mockFaultyClient, true);

            const resFaultySession = await request(app)
                .delete('/api/settlements/' + testSId)
                .set('Authorization', 'Bearer ' + adminToken);

            assert.strictEqual(resFaultySession.status, 503, 'Must reject with 503 when startSession() fails');
            assert.strictEqual(resFaultySession.body.code, 'TRANSACTIONS_REQUIRED');

            const inDbAfter2 = await testDb.collection('settlements').findOne({ id: testSId });
            assert.ok(inDbAfter2, 'Settlement must not be deleted when startSession fails');
        } finally {
            process.env.NODE_ENV = oldNodeEnv;
            if (oldAllow) process.env.ALLOW_NON_TRANSACTIONAL = oldAllow;
            setDb(testDb, true, mongoClient, true);
        }
    });

    await t.test('31. [P1 DOMAIN] DELETE relational guard: aborts with 409 if entries/advances belong to another settlement (no foreign unlinking)', async () => {
        const sToDeleteId = 'settlement-corrupt-declared';
        const otherSettlementId = 'settlement-legitimate-owner';
        const foreignTeId = 'te-stolen-1';
        const nowIso = new Date().toISOString();

        // Legitimate entry belongs to otherSettlementId
        await testDb.collection('time-entries').insertOne({
            id: foreignTeId,
            employeeId: 'emp-owner',
            settlementId: otherSettlementId,
            hours: 8,
            cost: 480,
            status: 'approved',
            createdAt: nowIso
        });

        // Corrupt settlement declares foreignTeId in its timeEntryIds
        await testDb.collection('settlements').insertOne({
            id: sToDeleteId,
            workerId: 'emp-corrupt',
            workerType: 'employee',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            timeEntryIds: [foreignTeId],
            totalAmount: 480,
            status: 'open',
            createdAt: nowIso
        });

        const deleteRes = await request(app)
            .delete('/api/settlements/' + sToDeleteId)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(deleteRes.status, 409, 'Must abort with 409 Conflict due to relational discrepancy');
        assert.match(deleteRes.body.error, /Rozbieżność relacji: wpisy czasu/);

        // Verify foreignTeId STILL belongs to otherSettlementId (was NOT unlinked!)
        const entryAfterAttempt = await testDb.collection('time-entries').findOne({ id: foreignTeId });
        assert.strictEqual(entryAfterAttempt.settlementId, otherSettlementId, 'Foreign entry must NEVER be unlinked by another settlement deletion');

        // Verify corrupt settlement was NOT deleted (transaction rolled back)
        const settlementStillExists = await testDb.collection('settlements').findOne({ id: sToDeleteId });
        assert.ok(settlementStillExists, 'Settlement must not be deleted when discrepancy is detected');
    });

    await t.test('32. [P1 DOMAIN] Block generic POST /api/settlements and restrict PATCH /api/settlements/:id (no bypassing domain logic)', async () => {
        // 1. Generic POST /api/settlements -> MUST return 405 Method Not Allowed
        const postRes = await request(app)
            .post('/api/settlements')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                workerId: 'emp-bypass',
                workerType: 'employee',
                totalAmount: 1000
            });

        assert.strictEqual(postRes.status, 405, 'Generic POST /api/settlements must be blocked with 405');
        assert.match(postRes.body.error, /Bezpośrednie tworzenie rozliczeń/);

        // 2. PATCH /api/settlements/:id attempting financial modification -> MUST return 400 Bad Request
        const sTestId = 'settlement-patch-test';
        await testDb.collection('settlements').insertOne({
            id: sTestId,
            workerId: 'emp-patch',
            workerType: 'employee',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            totalAmount: 500,
            status: 'open',
            notes: 'Initial notes',
            createdAt: new Date().toISOString()
        });

        const patchForbiddenRes = await request(app)
            .patch('/api/settlements/' + sTestId)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                totalAmount: 99999, // FORBIDDEN!
                grossAmount: 99999
            });

        assert.strictEqual(patchForbiddenRes.status, 400, 'PATCH modifying financial fields must be rejected');
        assert.match(patchForbiddenRes.body.error, /Modyfikacja pól finansowych i relacyjnych rozliczenia/);

        // 3. PATCH allowed fields (notes, status) -> SUCCEEDS
        const patchAllowedRes = await request(app)
            .patch('/api/settlements/' + sTestId)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                notes: 'Updated notes via patch',
                status: 'closed'
            });

        assert.strictEqual(patchAllowedRes.status, 200);
        assert.strictEqual(patchAllowedRes.body.notes, 'Updated notes via patch');
        assert.strictEqual(patchAllowedRes.body.status, 'closed');
        assert.strictEqual(patchAllowedRes.body.totalAmount, 500, 'Financial field must remain unchanged');
    });

    await t.test('33. [P1 DOMAIN] Authoritative server-side settlement recalculation (POST /api/settlements/:id/recalculate)', async () => {
        const empId = 'emp-recalc-1';
        const jobId = 'job-recalc-1';
        const teId1 = 'te-recalc-1';
        const teId2 = 'te-recalc-2';
        const advId = 'adv-recalc-1';
        const sId = 'settlement-recalc-1';
        const nowIso = new Date().toISOString();

        await testDb.collection('employees').insertOne({
            id: empId,
            name: 'Recalc Worker',
            hourlyRate: 50,
            active: true,
            createdAt: nowIso
        });

        await testDb.collection('jobs').insertOne({
            id: jobId,
            name: 'Recalc Job',
            status: 'in_progress',
            actualLaborCost: 750,
            settledLaborCost: 0,
            createdAt: nowIso
        });

        // Day 1: 10 hours (8 regular @ 50 = 400, 2 overtime @ 50*1.5 = 150) -> gross 550, base 500, otPay 50
        await testDb.collection('time-entries').insertOne({
            id: teId1,
            employeeId: empId,
            jobId: jobId,
            date: '2026-09-10',
            hours: 10,
            hourlyRate: 50,
            cost: 500,
            settlementId: sId,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        // Day 2: 5 hours @ 50 = 250 -> gross 250, base 250
        await testDb.collection('time-entries').insertOne({
            id: teId2,
            employeeId: empId,
            jobId: jobId,
            date: '2026-09-11',
            hours: 5,
            hourlyRate: 50,
            cost: 250,
            settlementId: sId,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        // Advance: 150 PLN
        await testDb.collection('requests').insertOne({
            id: advId,
            employeeId: empId,
            type: 'zaliczka',
            amount: 150,
            status: 'zaakceptowany',
            settlementId: sId,
            createdAt: nowIso
        });

        // Settlement initially created with out-of-date or placeholder values
        await testDb.collection('settlements').insertOne({
            id: sId,
            workerId: empId,
            workerType: 'employee',
            jobId: jobId,
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            timeEntryIds: [teId1, teId2],
            advanceIds: [advId],
            totalHours: 0,
            baseAmount: 0,
            overtimeHours: 0,
            overtimePay: 0,
            grossAmount: 0,
            advanceDeductions: 0,
            totalAmount: 0,
            status: 'open',
            createdAt: nowIso
        });

        // Trigger authoritative recalculation
        const recalcRes = await request(app)
            .post(`/api/settlements/${sId}/recalculate`)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(recalcRes.status, 200);
        // Total hours: 10 + 5 = 15
        assert.strictEqual(recalcRes.body.totalHours, 15);
        // Base cost: 500 + 250 = 750
        assert.strictEqual(recalcRes.body.baseAmount, 750);
        // Overtime: 2 hours (10 - 8 on day 1)
        assert.strictEqual(recalcRes.body.overtimeHours, 2);
        // Overtime pay: 2 * 50 * 0.5 = 50
        assert.strictEqual(recalcRes.body.overtimePay, 50);
        // Gross: 750 + 50 = 800
        assert.strictEqual(recalcRes.body.grossAmount, 800);
        // Advance: 150
        assert.strictEqual(recalcRes.body.advanceDeductions, 150);
        // Total: 800 - 150 = 650
        assert.strictEqual(recalcRes.body.totalAmount, 650);

        // Verify persisted in DB
        const savedInDb = await testDb.collection('settlements').findOne({ id: sId });
        assert.strictEqual(savedInDb.totalAmount, 650);
        assert.strictEqual(savedInDb.grossAmount, 800);
    });

    await t.test('34. [P1 DOMAIN] Settlements batch-import and migration bypasses are strictly blocked', async () => {
        // 1. POST /api/settlements/batch-import must return 405 Method Not Allowed
        const batchImportRes = await request(app)
            .post('/api/settlements/batch-import')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ items: [{ id: 's-batch-1', totalAmount: 1000 }] });

        assert.strictEqual(batchImportRes.status, 405);
        assert.match(batchImportRes.body.error, /Import wsadowy rozliczeń/);

        // 2. POST /api/migration/admin-record for 'settlements' must return 400 (not in ALLOWED_MIGRATION_COLLECTIONS)
        const migrationRes = await request(app)
            .post('/api/migration/admin-record')
            .set('Authorization', 'Bearer ' + adminToken)
            .send({
                collection: 'settlements',
                action: 'create',
                record: { id: 's-mig-1', totalAmount: 500 }
            });

        assert.strictEqual(migrationRes.status, 400);
        assert.match(migrationRes.body.error, /Niedozwolona lub nieobsługiwana kolekcja migracji: 'settlements'/);
    });

    await t.test('35. [P1 DOMAIN] Recalculation relational discrepancy guard aborts on foreign settlement links (409 Conflict)', async () => {
        const empId = 'emp-guard-1';
        const teIdOwned = 'te-guard-owned';
        const teIdForeign = 'te-guard-foreign';
        const advIdForeign = 'adv-guard-foreign';
        const sIdTarget = 'settlement-guard-target';
        const sIdForeign = 'settlement-guard-foreign';
        const nowIso = new Date().toISOString();

        await testDb.collection('employees').insertOne({
            id: empId,
            name: 'Guard Worker',
            hourlyRate: 60,
            active: true,
            createdAt: nowIso
        });

        // Entry properly owned by target settlement
        await testDb.collection('time-entries').insertOne({
            id: teIdOwned,
            employeeId: empId,
            date: '2026-09-15',
            hours: 8,
            hourlyRate: 60,
            cost: 480,
            settlementId: sIdTarget,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        // Entry owned by a FOREIGN settlement
        await testDb.collection('time-entries').insertOne({
            id: teIdForeign,
            employeeId: empId,
            date: '2026-09-16',
            hours: 8,
            hourlyRate: 60,
            cost: 480,
            settlementId: sIdForeign,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        // Target settlement that illicitly contains teIdForeign in its timeEntryIds
        await testDb.collection('settlements').insertOne({
            id: sIdTarget,
            workerId: empId,
            workerType: 'employee',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            timeEntryIds: [teIdOwned, teIdForeign],
            advanceIds: [],
            totalHours: 16,
            totalAmount: 960,
            status: 'open',
            createdAt: nowIso
        });

        // Attempting to recalculate must fail with 409 Conflict (discrepancy guard)
        const conflictRes = await request(app)
            .post(`/api/settlements/${sIdTarget}/recalculate`)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(conflictRes.status, 409);
        assert.match(conflictRes.body.error, /Rozbieżność relacji: wpisy czasu/);
        assert.match(conflictRes.body.error, new RegExp(sIdForeign));

        // Foreign entry must remain untouched (never hijacked)
        const foreignEntryAfter = await testDb.collection('time-entries').findOne({ id: teIdForeign });
        assert.strictEqual(foreignEntryAfter.settlementId, sIdForeign);

        // Advance foreign check: fix timeEntryIds but add foreign advanceId
        await testDb.collection('settlements').updateOne(
            { id: sIdTarget },
            { $set: { timeEntryIds: [teIdOwned], advanceIds: [advIdForeign] } }
        );

        await testDb.collection('requests').insertOne({
            id: advIdForeign,
            employeeId: empId,
            type: 'zaliczka',
            amount: 200,
            status: 'zaakceptowany',
            settlementId: sIdForeign,
            createdAt: nowIso
        });

        const conflictAdvRes = await request(app)
            .post(`/api/settlements/${sIdTarget}/recalculate`)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(conflictAdvRes.status, 409);
        assert.match(conflictAdvRes.body.error, /Rozbieżność relacji: zaliczki/);

        const foreignAdvAfter = await testDb.collection('requests').findOne({ id: advIdForeign });
        assert.strictEqual(foreignAdvAfter.settlementId, sIdForeign);
    });

    await t.test('36. [P1 DOMAIN] Calculation parity: create-atomic and recalculate produce 100% identical cent-level results', async () => {
        const empId = 'emp-parity-1';
        const teId1 = 'te-parity-1';
        const teId2 = 'te-parity-2';
        const teIdFixed = 'te-parity-fixed';
        const teIdM2 = 'te-parity-m2';
        const advId = 'adv-parity-1';
        const sId = 'settlement-parity-1';
        const idempKey = 'parity-key-' + Date.now();
        const nowIso = new Date().toISOString();

        await testDb.collection('employees').insertOne({
            id: empId,
            name: 'Parity Worker',
            hourlyRate: 50,
            active: true,
            createdAt: nowIso
        });

        // Day 1: 10h @ 45 zł (explicit hourlyRate) -> 8h regular = 360, 2h ot @ 45*1.5=135 -> gross 495, base 450, otPay 45
        await testDb.collection('time-entries').insertOne({
            id: teId1,
            employeeId: empId,
            date: '2026-09-20',
            hours: 10,
            billingType: 'hourly',
            hourlyRate: 45,
            cost: 450,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        // Day 2: 9h @ 60 zł -> 8h regular = 480, 1h ot @ 60*1.5=90 -> gross 570, base 540, otPay 30
        await testDb.collection('time-entries').insertOne({
            id: teId2,
            employeeId: empId,
            date: '2026-09-21',
            hours: 9,
            billingType: 'hourly',
            hourlyRate: 60,
            cost: 540,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        // Day 2: Fixed entry (must NOT be counted towards hourly overtime)
        await testDb.collection('time-entries').insertOne({
            id: teIdFixed,
            employeeId: empId,
            date: '2026-09-21',
            hours: 0,
            billingType: 'fixed',
            cost: 250,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        // Day 2: m2 entry (15 m2 @ 20 zł = 300 zł)
        await testDb.collection('time-entries').insertOne({
            id: teIdM2,
            employeeId: empId,
            date: '2026-09-21',
            hours: 0,
            billingType: 'm2',
            quantity: 15,
            rate: 20,
            cost: 300,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        // Advance: 200 zł
        await testDb.collection('requests').insertOne({
            id: advId,
            employeeId: empId,
            type: 'zaliczka',
            amount: 200,
            status: 'zaakceptowany',
            createdAt: nowIso
        });

        // 1. Create atomically
        const createRes = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send({
                id: sId,
                workerId: empId,
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: [teId1, teId2, teIdFixed, teIdM2],
                advanceIds: [advId]
            });

        assert.strictEqual(createRes.status, 201);
        const atomicDoc = createRes.body.settlement;

        // Verify mathematical expectations:
        // Total hours: 10 + 9 = 19
        assert.strictEqual(atomicDoc.totalHours, 19);
        // Base amount: 450 + 540 + 250 + 300 = 1540
        assert.strictEqual(atomicDoc.baseAmount, 1540);
        // Overtime hours: (10 - 8) + (9 - 8) = 3
        assert.strictEqual(atomicDoc.overtimeHours, 3);
        // Overtime pay: 2 * 45 * 0.5 + 1 * 60 * 0.5 = 45 + 30 = 75
        assert.strictEqual(atomicDoc.overtimePay, 75);
        // Gross amount: 1540 + 75 = 1615
        assert.strictEqual(atomicDoc.grossAmount, 1615);
        // Advance deductions: 200
        assert.strictEqual(atomicDoc.advanceDeductions, 200);
        // Total amount: 1615 - 200 = 1415
        assert.strictEqual(atomicDoc.totalAmount, 1415);

        // 2. Corrupt/zero out financial figures in DB to simulate discrepancy or recalculation requirement
        await testDb.collection('settlements').updateOne(
            { id: sId },
            {
                $set: {
                    totalHours: 0,
                    baseAmount: 0,
                    overtimeHours: 0,
                    overtimePay: 0,
                    grossAmount: 0,
                    advanceDeductions: 0,
                    totalAmount: 0
                }
            }
        );

        // 3. Trigger recalculate
        const recalcRes = await request(app)
            .post(`/api/settlements/${sId}/recalculate`)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(recalcRes.status, 200);
        const recalcDoc = recalcRes.body;

        // Exact parity assertion across all financial and operational fields
        assert.strictEqual(recalcDoc.totalHours, atomicDoc.totalHours);
        assert.strictEqual(recalcDoc.baseAmount, atomicDoc.baseAmount);
        assert.strictEqual(recalcDoc.overtimeHours, atomicDoc.overtimeHours);
        assert.strictEqual(recalcDoc.overtimePay, atomicDoc.overtimePay);
        assert.strictEqual(recalcDoc.grossAmount, atomicDoc.grossAmount);
        assert.strictEqual(recalcDoc.advanceDeductions, atomicDoc.advanceDeductions);
        assert.strictEqual(recalcDoc.totalAmount, atomicDoc.totalAmount);
    });

    await t.test('37. [P1 DOMAIN] Status state machine and fail-closed cancellation in PATCH /api/settlements/:id', async () => {
        const empId = 'emp-stat-1';
        const teId = 'te-stat-1';
        const sId = 'settlement-stat-1';
        const nowIso = new Date().toISOString();

        await testDb.collection('employees').insertOne({
            id: empId,
            name: 'Status Worker',
            hourlyRate: 50,
            active: true,
            createdAt: nowIso
        });

        await testDb.collection('time-entries').insertOne({
            id: teId,
            employeeId: empId,
            date: '2026-09-22',
            hours: 8,
            hourlyRate: 50,
            cost: 400,
            settlementId: sId,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        await testDb.collection('settlements').insertOne({
            id: sId,
            workerId: empId,
            workerType: 'employee',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            timeEntryIds: [teId],
            advanceIds: [],
            totalHours: 8,
            totalAmount: 400,
            status: 'open',
            createdAt: nowIso
        });

        // 1. open -> closed: OK
        const closeRes = await request(app)
            .patch(`/api/settlements/${sId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ status: 'closed' });
        assert.strictEqual(closeRes.status, 200);
        assert.strictEqual(closeRes.body.status, 'closed');

        // 2. closed -> open: OK
        const reopenRes = await request(app)
            .patch(`/api/settlements/${sId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ status: 'open' });
        assert.strictEqual(reopenRes.status, 200);
        assert.strictEqual(reopenRes.body.status, 'open');

        // 3. open -> exported: OK
        const exportRes = await request(app)
            .patch(`/api/settlements/${sId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ status: 'exported' });
        assert.strictEqual(exportRes.status, 200);
        assert.strictEqual(exportRes.body.status, 'exported');

        // 4. exported -> open: FORBIDDEN (400)
        const invalidExportToOpen = await request(app)
            .patch(`/api/settlements/${sId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ status: 'open' });
        assert.strictEqual(invalidExportToOpen.status, 400);
        assert.strictEqual(invalidExportToOpen.body.code, 'INVALID_STATUS_TRANSITION');

        // 5. exported -> closed: FORBIDDEN (400)
        const invalidExportToClosed = await request(app)
            .patch(`/api/settlements/${sId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ status: 'closed' });
        assert.strictEqual(invalidExportToClosed.status, 400);
        assert.strictEqual(invalidExportToClosed.body.code, 'INVALID_STATUS_TRANSITION');

        // 6. exported -> cancelled: OK (cancelling exported invoice)
        const cancelRes = await request(app)
            .patch(`/api/settlements/${sId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ status: 'cancelled' });
        assert.strictEqual(cancelRes.status, 200);
        assert.strictEqual(cancelRes.body.status, 'cancelled');

        // Entries must be unlinked after cancellation
        const entryAfterCancel = await testDb.collection('time-entries').findOne({ id: teId });
        assert.strictEqual(entryAfterCancel.settlementId, undefined);

        // 7. cancelled -> open: STRICTLY FORBIDDEN (terminal status, 400)
        const invalidCancelledToOpen = await request(app)
            .patch(`/api/settlements/${sId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ status: 'open' });
        assert.strictEqual(invalidCancelledToOpen.status, 400);
        assert.strictEqual(invalidCancelledToOpen.body.code, 'INVALID_STATUS_TRANSITION');

        // 8. cancelled -> closed: STRICTLY FORBIDDEN (400)
        const invalidCancelledToClosed = await request(app)
            .patch(`/api/settlements/${sId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ status: 'closed' });
        assert.strictEqual(invalidCancelledToClosed.status, 400);
        assert.strictEqual(invalidCancelledToClosed.body.code, 'INVALID_STATUS_TRANSITION');
    });

    await t.test('38. [P1 DOMAIN] Settlement status change recalculates settledLaborCost for all jobs linked by time-entries', async () => {
        const empId = 'emp-multijob-1';
        const jobAId = 'job-multijob-a';
        const jobBId = 'job-multijob-b';
        const teAId = 'te-multijob-a';
        const teBId = 'te-multijob-b';
        const sId = 'settlement-multijob-1';
        const nowIso = new Date().toISOString();

        await testDb.collection('employees').insertOne({
            id: empId,
            name: 'Multi-Job Worker',
            hourlyRate: 50,
            active: true,
            createdAt: nowIso
        });

        await testDb.collection('jobs').insertOne({
            id: jobAId,
            name: 'Job A',
            actualLaborCost: 250,
            settledLaborCost: 0,
            createdAt: nowIso
        });

        await testDb.collection('jobs').insertOne({
            id: jobBId,
            name: 'Job B',
            actualLaborCost: 200,
            settledLaborCost: 0,
            createdAt: nowIso
        });

        // Entry on Job A: 5h @ 50 = 250 zł
        await testDb.collection('time-entries').insertOne({
            id: teAId,
            employeeId: empId,
            jobId: jobAId,
            date: '2026-09-25',
            hours: 5,
            hourlyRate: 50,
            cost: 250,
            settlementId: sId,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        // Entry on Job B: 4h @ 50 = 200 zł
        await testDb.collection('time-entries').insertOne({
            id: teBId,
            employeeId: empId,
            jobId: jobBId,
            date: '2026-09-26',
            hours: 4,
            hourlyRate: 50,
            cost: 200,
            settlementId: sId,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        // Multi-job hourly settlement without its own jobId (null)
        await testDb.collection('settlements').insertOne({
            id: sId,
            workerId: empId,
            workerType: 'employee',
            jobId: null,
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            timeEntryIds: [teAId, teBId],
            advanceIds: [],
            totalHours: 9,
            totalAmount: 450,
            grossAmount: 450,
            baseAmount: 450,
            status: 'open',
            createdAt: nowIso
        });

        // 1. Initially (status: 'open') -> settledLaborCost on both jobs must be 0
        const jobABefore = await testDb.collection('jobs').findOne({ id: jobAId });
        const jobBBefore = await testDb.collection('jobs').findOne({ id: jobBId });
        assert.strictEqual(jobABefore.settledLaborCost, 0);
        assert.strictEqual(jobBBefore.settledLaborCost, 0);

        // 2. Change status to 'closed': both Job A and Job B must have settledLaborCost updated!
        const closeRes = await request(app)
            .patch(`/api/settlements/${sId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ status: 'closed' });
        assert.strictEqual(closeRes.status, 200);

        const jobAClosed = await testDb.collection('jobs').findOne({ id: jobAId });
        const jobBClosed = await testDb.collection('jobs').findOne({ id: jobBId });
        assert.strictEqual(jobAClosed.settledLaborCost, 250, 'Job A settledLaborCost must equal 250 after closing settlement');
        assert.strictEqual(jobBClosed.settledLaborCost, 200, 'Job B settledLaborCost must equal 200 after closing settlement');

        // 3. Reopen (closed -> open): both jobs must have settledLaborCost returned to 0!
        const reopenRes = await request(app)
            .patch(`/api/settlements/${sId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ status: 'open' });
        assert.strictEqual(reopenRes.status, 200);

        const jobAOpen = await testDb.collection('jobs').findOne({ id: jobAId });
        const jobBOpen = await testDb.collection('jobs').findOne({ id: jobBId });
        assert.strictEqual(jobAOpen.settledLaborCost, 0, 'Job A settledLaborCost must return to 0 after reopening settlement');
        assert.strictEqual(jobBOpen.settledLaborCost, 0, 'Job B settledLaborCost must return to 0 after reopening settlement');

        // 4. Cancel (open -> cancelled): entries unlinked, settledLaborCost remains 0
        const cancelRes = await request(app)
            .patch(`/api/settlements/${sId}`)
            .set('Authorization', 'Bearer ' + adminToken)
            .send({ status: 'cancelled' });
        assert.strictEqual(cancelRes.status, 200);

        const teAAfterCancel = await testDb.collection('time-entries').findOne({ id: teAId });
        const teBAfterCancel = await testDb.collection('time-entries').findOne({ id: teBId });
        assert.strictEqual(teAAfterCancel.settlementId, undefined);
        assert.strictEqual(teBAfterCancel.settlementId, undefined);

        const jobACancelled = await testDb.collection('jobs').findOne({ id: jobAId });
        const jobBCancelled = await testDb.collection('jobs').findOne({ id: jobBId });
        assert.strictEqual(jobACancelled.settledLaborCost, 0);
        assert.strictEqual(jobBCancelled.settledLaborCost, 0);
    });

    await t.test('39. [P1 DOMAIN] Recalculation strictly fails closed on corrupt financial records (no silent normalization)', async () => {
        const uid = Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        const empId = 'emp-corrupt-' + uid;
        const teIdBadCost = 'te-bad-cost-' + uid;
        const teIdBadHours = 'te-bad-hours-' + uid;
        const advIdBad = 'adv-bad-amount-' + uid;
        const sIdBadCost = 'settlement-bad-cost-' + uid;
        const sIdBadAdv = 'settlement-bad-adv-' + uid;
        const nowIso = new Date().toISOString();

        await testDb.collection('employees').insertOne({
            id: empId,
            name: 'Corrupt Worker',
            hourlyRate: 50,
            active: true,
            createdAt: nowIso
        });

        // 1. Time entry with negative cost in DB
        await testDb.collection('time-entries').insertOne({
            id: teIdBadCost,
            employeeId: empId,
            date: '2026-09-27',
            hours: 8,
            hourlyRate: 50,
            cost: -400,
            settlementId: sIdBadCost,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        await testDb.collection('settlements').insertOne({
            id: sIdBadCost,
            workerId: empId,
            workerType: 'employee',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            timeEntryIds: [teIdBadCost],
            advanceIds: [],
            totalHours: 8,
            totalAmount: 400,
            status: 'open',
            createdAt: nowIso
        });

        const recalcBadCostRes = await request(app)
            .post(`/api/settlements/${sIdBadCost}/recalculate`)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(recalcBadCostRes.status, 400);
        assert.match(recalcBadCostRes.body.error, /Koszt musi być nieujemną liczbą skończoną/);

        // 2. Advance with negative amount in DB
        await testDb.collection('time-entries').insertOne({
            id: teIdBadHours,
            employeeId: empId,
            date: '2026-09-28',
            hours: 8,
            hourlyRate: 50,
            cost: 400,
            settlementId: sIdBadAdv,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        await testDb.collection('requests').insertOne({
            id: advIdBad,
            employeeId: empId,
            type: 'zaliczka',
            amount: -150,
            status: 'zaakceptowany',
            settlementId: sIdBadAdv,
            createdAt: nowIso
        });

        await testDb.collection('settlements').insertOne({
            id: sIdBadAdv,
            workerId: empId,
            workerType: 'employee',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            timeEntryIds: [teIdBadHours],
            advanceIds: [advIdBad],
            totalHours: 8,
            totalAmount: 250,
            status: 'open',
            createdAt: nowIso
        });

        const recalcBadAdvRes = await request(app)
            .post(`/api/settlements/${sIdBadAdv}/recalculate`)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(recalcBadAdvRes.status, 400);
        assert.match(recalcBadAdvRes.body.error, /Kwota zaliczki musi być dodatnią liczbą skończoną/);
    });

    await t.test('40. [P1 DOMAIN] Recalculation strictly forbids altering exported settlements (accounting terminal state)', async () => {
        const empId = 'emp-export-recalc-1';
        const teId = 'te-export-recalc-1';
        const sId = 'settlement-export-recalc-1';
        const nowIso = new Date().toISOString();

        await testDb.collection('employees').insertOne({
            id: empId,
            name: 'Export Worker',
            hourlyRate: 50,
            active: true,
            createdAt: nowIso
        });

        await testDb.collection('time-entries').insertOne({
            id: teId,
            employeeId: empId,
            date: '2026-09-29',
            hours: 8,
            hourlyRate: 50,
            cost: 400,
            settlementId: sId,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        await testDb.collection('settlements').insertOne({
            id: sId,
            workerId: empId,
            workerType: 'employee',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            timeEntryIds: [teId],
            advanceIds: [],
            totalHours: 8,
            totalAmount: 400,
            status: 'exported',
            createdAt: nowIso
        });

        const recalcExportedRes = await request(app)
            .post(`/api/settlements/${sId}/recalculate`)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(recalcExportedRes.status, 400);
        assert.match(recalcExportedRes.body.error, /Nie można przeliczyć wyeksportowanego rozliczenia/);
    });


    await t.test('41. [P2 REAL CONCURRENCY] Concurrent status updates via Promise.all with barrier: CAS and transactional state machine prevent illegal transition (exported -> closed)', async () => {
        const uid = Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        const empId = 'emp-cas-status-' + uid;
        const sId = 'settlement-cas-status-' + uid;
        const nowIso = new Date().toISOString();

        await testDb.collection('employees').insertOne({
            id: empId,
            name: 'CAS Worker',
            hourlyRate: 50,
            active: true,
            createdAt: nowIso
        });

        await testDb.collection('settlements').insertOne({
            id: sId,
            workerId: empId,
            workerType: 'employee',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            timeEntryIds: [],
            advanceIds: [],
            totalHours: 0,
            totalAmount: 0,
            status: 'open',
            createdAt: nowIso
        });

        const { setTestBarrierHook } = require('../server.js');

        // Deterministic two-way barrier:
        // 1. Request B signals 'bReachedHook' when it enters executeMutation and reads 'open'
        // 2. Request B then pauses until test signals 'bCanProceed'
        let notifyBReached = null;
        const bReachedHook = new Promise(resolve => {
            notifyBReached = resolve;
        });

        let releaseB = null;
        const bCanProceed = new Promise(resolve => {
            releaseB = resolve;
        });

        setTestBarrierHook(async ({ updates }) => {
            if (updates.status === 'closed') {
                notifyBReached();
                await bCanProceed;
            }
        });

        try {
            // Launch Request B (open -> closed) in the background (calling .then(res => res) dispatches the HTTP request immediately)
            const reqBPromise = request(app)
                .patch(`/api/settlements/${sId}`)
                .set('Authorization', 'Bearer ' + adminToken)
                .send({ status: 'closed' })
                .then(res => res);

            // Deterministically wait until Request B has read currentDoc ('open') and reached barrier
            await bReachedHook;

            // While Request B is paused, run and fully commit Request A (open -> exported)
            const resA = await request(app)
                .patch(`/api/settlements/${sId}`)
                .set('Authorization', 'Bearer ' + adminToken)
                .send({ status: 'exported' });

            assert.strictEqual(resA.status, 200);
            assert.strictEqual(resA.body.status, 'exported');

            // Now release Request B to attempt its CAS write on { id, status: 'open' }
            releaseB();

            // Await Request B completion
            const resB = await reqBPromise;

            // Request B was concurrent and must fail with 400 (state machine on retry) or 409 (CAS conflict)
            assert.ok([400, 409].includes(resB.status), `Concurrent conflicting request must fail with 400 or 409, got ${resB.status}`);
            if (resB.status === 400) {
                assert.strictEqual(resB.body.code, 'INVALID_STATUS_TRANSITION');
                assert.match(resB.body.error, /Niedozwolone przejście statusu z 'exported' do 'closed'/);
            } else {
                assert.match(resB.body.error, /Błąd współbieżności CAS/);
            }

            // Verify document in DB is strictly 'exported' and was NEVER overwritten to 'closed'
            const finalDoc = await testDb.collection('settlements').findOne({ id: sId });
            assert.strictEqual(finalDoc.status, 'exported');
        } finally {
            setTestBarrierHook(null);
        }
    });

    await t.test('42. [P1 DOMAIN] PATCH /api/settlements/:id fails closed with 503 when transactions required and session unavailable in production', async () => {
        const uid = Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        const sIdA = 'settlement-failclosed-sess-err-' + uid;
        const sIdB = 'settlement-failclosed-sess-null-' + uid;
        const nowIso = new Date().toISOString();

        await testDb.collection('settlements').insertMany([
            {
                id: sIdA,
                workerId: 'emp-503-a',
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: [],
                advanceIds: [],
                totalHours: 0,
                totalAmount: 0,
                status: 'open',
                createdAt: nowIso
            },
            {
                id: sIdB,
                workerId: 'emp-503-b',
                workerType: 'employee',
                periodFrom: '2026-09-01',
                periodTo: '2026-09-30',
                timeEntryIds: [],
                advanceIds: [],
                totalHours: 0,
                totalAmount: 0,
                status: 'open',
                createdAt: nowIso
            }
        ]);

        const origNodeEnv = process.env.NODE_ENV;
        const origAllowNonTx = process.env.ALLOW_NON_TRANSACTIONAL;
        process.env.NODE_ENV = 'production';
        delete process.env.ALLOW_NON_TRANSACTIONAL;

        const { setTestFailpoint } = require('../server.js');

        try {
            // Case 1: startSession throws error
            setTestFailpoint('force_session_failure');
            const resA = await request(app)
                .patch(`/api/settlements/${sIdA}`)
                .set('Authorization', 'Bearer ' + adminToken)
                .send({ status: 'closed' });

            assert.strictEqual(resA.status, 503);
            assert.strictEqual(resA.body.code, 'TRANSACTIONS_REQUIRED');

            // Case 2: startSession returns null without error (reaches fallback gate)
            setTestFailpoint('session_returns_null');
            const resB = await request(app)
                .patch(`/api/settlements/${sIdB}`)
                .set('Authorization', 'Bearer ' + adminToken)
                .send({ status: 'closed' });

            assert.strictEqual(resB.status, 503);
            assert.strictEqual(resB.body.code, 'TRANSACTIONS_REQUIRED');
        } finally {
            setTestFailpoint(null);
            process.env.NODE_ENV = origNodeEnv;
            if (origAllowNonTx !== undefined) process.env.ALLOW_NON_TRANSACTIONAL = origAllowNonTx;
        }
    });

    await t.test('43. [P1 DOMAIN] Recalculation strictly fails closed (409) if any linked entry or advance with settlementId is inactive or unapproved', async () => {
        const uid = Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        const empId = 'emp-recalc-failclosed-' + uid;
        const teActiveId = 'te-active-' + uid;
        const teInactiveId = 'te-inactive-' + uid;
        const advPendingId = 'adv-pending-' + uid;
        const sIdEntry = 'settlement-entry-fail-' + uid;
        const sIdAdv = 'settlement-adv-fail-' + uid;
        const nowIso = new Date().toISOString();

        await testDb.collection('employees').insertOne({
            id: empId,
            name: 'Audit Worker',
            hourlyRate: 50,
            active: true,
            createdAt: nowIso
        });

        // 1. Time entry with settlementId that became inactive (isActive: false)
        await testDb.collection('time-entries').insertOne({
            id: teActiveId,
            employeeId: empId,
            date: '2026-09-20',
            hours: 8,
            hourlyRate: 50,
            cost: 400,
            billingType: 'hourly',
            settlementId: sIdEntry,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        await testDb.collection('time-entries').insertOne({
            id: teInactiveId,
            employeeId: empId,
            date: '2026-09-21',
            hours: 8,
            hourlyRate: 50,
            cost: 400,
            billingType: 'hourly',
            settlementId: sIdEntry,
            status: 'approved',
            isActive: false, // inactive!
            createdAt: nowIso
        });

        await testDb.collection('settlements').insertOne({
            id: sIdEntry,
            workerId: empId,
            workerType: 'employee',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            timeEntryIds: [teActiveId],
            advanceIds: [],
            totalHours: 8,
            totalAmount: 400,
            status: 'open',
            createdAt: nowIso
        });

        // Recalculating must detect the inactive entry with settlementId=sIdEntry and FAIL-CLOSED with 409
        const recalcEntryRes = await request(app)
            .post(`/api/settlements/${sIdEntry}/recalculate`)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(recalcEntryRes.status, 409);
        assert.match(recalcEntryRes.body.error, /Niespójność danych rozliczenia: powiązane wpisy czasu/);
        assert.match(recalcEntryRes.body.error, /isActive: false/);

        // 2. Advance with settlementId that is not 'zaakceptowany' (e.g. 'oczekujący')
        await testDb.collection('requests').insertOne({
            id: advPendingId,
            employeeId: empId,
            type: 'zaliczka',
            amount: 100,
            status: 'oczekujący', // unapproved!
            settlementId: sIdAdv,
            createdAt: nowIso
        });

        await testDb.collection('settlements').insertOne({
            id: sIdAdv,
            workerId: empId,
            workerType: 'employee',
            periodFrom: '2026-09-01',
            periodTo: '2026-09-30',
            timeEntryIds: [],
            advanceIds: [advPendingId],
            totalHours: 0,
            totalAmount: 0,
            status: 'open',
            createdAt: nowIso
        });

        const recalcAdvRes = await request(app)
            .post(`/api/settlements/${sIdAdv}/recalculate`)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(recalcAdvRes.status, 409);
        assert.match(recalcAdvRes.body.error, /Niespójność danych rozliczenia: powiązane zaliczki/);
        assert.match(recalcAdvRes.body.error, /oczekujący/);
    });

    await t.test('44. [P2 & P3 DOMAIN] Calendar date validation rejects invalid calendar date (2026-02-31) and trailing junk text (2026-10-03XYZ) with 400', async () => {
        const uid = Date.now() + '-' + Math.random().toString(36).substring(2, 7);
        const empId = 'emp-cal-date-' + uid;
        const teInvalidDate = 'te-bad-date-' + uid;
        const teTrailingText = 'te-trailing-text-' + uid;
        const sId = 'settlement-bad-date-' + uid;
        const sIdTrailing = 'settlement-trailing-date-' + uid;
        const nowIso = new Date().toISOString();

        await testDb.collection('employees').insertOne({
            id: empId,
            name: 'Calendar Worker',
            hourlyRate: 50,
            active: true,
            createdAt: nowIso
        });

        // 1. Date 2026-02-31 is structurally YYYY-MM-DD but does not exist in the calendar
        await testDb.collection('time-entries').insertOne({
            id: teInvalidDate,
            employeeId: empId,
            date: '2026-02-31',
            hours: 8,
            hourlyRate: 50,
            cost: 400,
            billingType: 'hourly',
            settlementId: sId,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        await testDb.collection('settlements').insertOne({
            id: sId,
            workerId: empId,
            workerType: 'employee',
            periodFrom: '2026-02-01',
            periodTo: '2026-02-28',
            timeEntryIds: [teInvalidDate],
            advanceIds: [],
            totalHours: 8,
            totalAmount: 400,
            status: 'open',
            createdAt: nowIso
        });

        // A. Recalculation must reject with 400
        const recalcRes = await request(app)
            .post(`/api/settlements/${sId}/recalculate`)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(recalcRes.status, 400);
        assert.match(recalcRes.body.error, /nieprawidłową lub nieistniejącą w kalendarzu datę/);

        // B. create-atomic must also reject with 400
        const createRes = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-bad-cal-date-' + uid)
            .send({
                workerId: empId,
                workerType: 'employee',
                periodFrom: '2026-02-01',
                periodTo: '2026-02-28',
                timeEntryIds: [teInvalidDate]
            });

        assert.strictEqual(createRes.status, 400);
        assert.match(createRes.body.error, /nieprawidłową lub nieistniejącą w kalendarzu datę/);

        // 2. [P3 TEST] Trailing junk text (e.g. 2026-10-03XYZ) must NOT be silently sliced and accepted
        await testDb.collection('time-entries').insertOne({
            id: teTrailingText,
            employeeId: empId,
            date: '2026-10-03XYZ', // trailing junk!
            hours: 8,
            hourlyRate: 50,
            cost: 400,
            billingType: 'hourly',
            settlementId: sIdTrailing,
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        await testDb.collection('settlements').insertOne({
            id: sIdTrailing,
            workerId: empId,
            workerType: 'employee',
            periodFrom: '2026-10-01',
            periodTo: '2026-10-31',
            timeEntryIds: [teTrailingText],
            advanceIds: [],
            totalHours: 8,
            totalAmount: 400,
            status: 'open',
            createdAt: nowIso
        });

        const recalcTrailingRes = await request(app)
            .post(`/api/settlements/${sIdTrailing}/recalculate`)
            .set('Authorization', 'Bearer ' + adminToken);

        assert.strictEqual(recalcTrailingRes.status, 400);
        assert.match(recalcTrailingRes.body.error, /nieprawidłową lub nieistniejącą w kalendarzu datę/);

        const createTrailingRes = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-trailing-date-' + uid)
            .send({
                workerId: empId,
                workerType: 'employee',
                periodFrom: '2026-10-01',
                periodTo: '2026-10-31',
                timeEntryIds: [teTrailingText]
            });

        assert.strictEqual(createTrailingRes.status, 400);
        assert.match(createTrailingRes.body.error, /nieprawidłową lub nieistniejącą w kalendarzu datę/);

        // 3. [P3 TEST] Corrupted ISO timestamp with invalid time/offset (e.g. 2026-10-03T99:99:99Z) rejected with 400
        const teCorruptIso = 'te-corrupt-iso-' + uid;
        await testDb.collection('time-entries').insertOne({
            id: teCorruptIso,
            employeeId: empId,
            date: '2026-10-03T99:99:99Z', // invalid hours/minutes/seconds
            hours: 8,
            hourlyRate: 50,
            cost: 400,
            billingType: 'hourly',
            status: 'approved',
            isActive: true,
            createdAt: nowIso
        });

        const createIsoRes = await request(app)
            .post('/api/settlements/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', 'idemp-corrupt-iso-' + uid)
            .send({
                workerId: empId,
                workerType: 'employee',
                periodFrom: '2026-10-01',
                periodTo: '2026-10-31',
                timeEntryIds: [teCorruptIso]
            });

        assert.strictEqual(createIsoRes.status, 400);
        assert.match(createIsoRes.body.error, /nieprawidłową lub nieistniejącą w kalendarzu datę/);
    });

    await t.test('45. [P1 DOMAIN ACID] POST /api/jobs/create-atomic: atomic numbering, stage items insert, and real rollback on failpoint', async () => {
        const uid = Date.now();
        const year = new Date().getFullYear();
        const idempKey = 'idemp-job-atomic-' + uid;

        // Ensure client exists in testDb
        await testDb.collection('clients').updateOne(
            { id: 'client-acid-job' },
            { $set: { id: 'client-acid-job', name: 'Klient ACID Test', isActive: true } },
            { upsert: true }
        );

        const validPayload = {
            job: {
                id: 'job-atomic-' + uid,
                name: 'ACID Szklany Biurowiec',
                clientId: 'client-acid-job',
                status: 'planned',
                revenuePlannedNet: 80000,
                stages: [
                    { id: 'stage-acid-1', name: 'Pomiary i Projekt', plannedRevenueNet: 10000, plannedCostNet: 4000 },
                    { id: 'stage-acid-2', name: 'Produkcja i Montaż', plannedRevenueNet: 70000, plannedCostNet: 35000 }
                ]
            },
            stageItems: [
                { id: 'stage-item-acid-1', stageId: 'stage-acid-2', constructionName: 'Fasada Słupek-Rygiel', quantityInStage: 10 },
                { id: 'stage-item-acid-2', stageId: 'stage-acid-2', constructionName: 'Drzwi Automatyczne', quantityInStage: 2 }
            ],
            idempotencyKey: idempKey
        };

        // 1. Success path: commits Job, stageItems, sequence number and idempotency key
        const successRes = await request(app)
            .post('/api/jobs/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send(validPayload);

        assert.strictEqual(successRes.status, 201);
        assert.strictEqual(successRes.body.success, true);
        assert.strictEqual(successRes.body.job.id, 'job-atomic-' + uid);
        assert.strictEqual(successRes.body.job.editVersion, 1);
        assert.strictEqual(successRes.body.job.isActive, true);
        assert.strictEqual(successRes.body.job.actualLaborHours, 0);
        assert.strictEqual(successRes.body.job.actualLaborCost, 0);
        assert.match(successRes.body.job.jobCode, new RegExp('^CF-' + year + '-\\d{3}$'));
        assert.strictEqual(successRes.body.stageItemsCount, 2);

        // Verify in DB
        const savedJob = await testDb.collection('jobs').findOne({ id: 'job-atomic-' + uid });
        assert.ok(savedJob, 'Job must be committed to MongoDB');
        assert.strictEqual(savedJob.name, 'ACID Szklany Biurowiec');
        assert.strictEqual(savedJob.editVersion, 1);

        const savedItems = await testDb.collection('jobStageItems').find({ jobId: 'job-atomic-' + uid }).toArray();
        assert.strictEqual(savedItems.length, 2, 'Stage items must be committed to MongoDB');

        const idempRec = await testDb.collection('idempotency_keys').findOne({ endpoint: '/api/jobs/create-atomic', key: idempKey });
        assert.ok(idempRec);
        assert.strictEqual(idempRec.status, 'completed');

        // 2. Real ACID Rollback on mid-transaction crash (failpoint after_job_insert)
        const failedIdempKey = 'idemp-job-fail-' + uid;
        const failedJobId = 'job-atomic-fail-' + uid;
        const failPayload = {
            job: {
                id: failedJobId,
                name: 'ACID Zlecenie Skazane na Rollback',
                clientId: 'client-acid-job',
                status: 'planned'
            },
            stageItems: [
                { id: 'stage-item-fail-' + uid, stageId: 'stage-x', constructionName: 'Brakujący Element', quantityInStage: 1 }
            ],
            idempotencyKey: failedIdempKey
        };

        setTestFailpoint('after_job_insert');
        try {
            const failRes = await request(app)
                .post('/api/jobs/create-atomic')
                .set('Authorization', 'Bearer ' + adminToken)
                .set('Idempotency-Key', failedIdempKey)
                .send(failPayload);

            assert.strictEqual(failRes.status, 500);
            assert.match(failRes.body.error, /FAILPOINT: Simulated crash after job insert/);

            // Verify total rollback in MongoDB
            const shouldNotExistJob = await testDb.collection('jobs').findOne({ id: failedJobId });
            assert.strictEqual(shouldNotExistJob, null, 'Job must NOT exist after aborted transaction (clean ACID rollback)');

            const shouldNotExistItems = await testDb.collection('jobStageItems').find({ jobId: failedJobId }).toArray();
            assert.strictEqual(shouldNotExistItems.length, 0, 'Stage items must NOT exist after aborted transaction');
        } finally {
            setTestFailpoint(null);
        }

        // 3. Idempotency Replay (identical payload -> cached 201)
        const replayRes = await request(app)
            .post('/api/jobs/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send(validPayload);

        assert.strictEqual(replayRes.status, 201);
        assert.strictEqual(replayRes.body.job.id, 'job-atomic-' + uid);
        assert.strictEqual(replayRes.body.job.jobCode, successRes.body.job.jobCode);

        // 4. Idempotency Conflict (different payload with same key -> 409)
        const conflictRes = await request(app)
            .post('/api/jobs/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send({
                ...validPayload,
                job: { ...validPayload.job, name: 'Inna Nazwa - Wykrycie Konfliktu Idempotencji' }
            });

        assert.strictEqual(conflictRes.status, 409);
        assert.match(conflictRes.body.error, /Klucz idempotencji został już użyty dla żądania o innym payloadzie/);

        // 5. Canonical Hash Invariance: identical payload with shuffled key order returns 201 cached replay
        const shuffledPayload = {
            idempotencyKey: idempKey,
            stageItems: [ ...validPayload.stageItems ],
            job: {
                revenuePlannedNet: validPayload.job.revenuePlannedNet,
                stages: validPayload.job.stages,
                status: validPayload.job.status,
                clientId: validPayload.job.clientId,
                name: validPayload.job.name,
                id: validPayload.job.id
            }
        };

        const shuffledReplayRes = await request(app)
            .post('/api/jobs/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send(shuffledPayload);

        assert.strictEqual(shuffledReplayRes.status, 201);
        assert.strictEqual(shuffledReplayRes.body.job.id, 'job-atomic-' + uid);
        assert.strictEqual(shuffledReplayRes.body.job.jobCode, successRes.body.job.jobCode);

        // 6. StageItems or Notes change triggers 409 conflict
        const stageItemConflictRes = await request(app)
            .post('/api/jobs/create-atomic')
            .set('Authorization', 'Bearer ' + adminToken)
            .set('Idempotency-Key', idempKey)
            .send({
                ...validPayload,
                stageItems: [
                    {
                        id: 'stage-item-acid-1',
                        stageId: 'stage-acid-2',
                        constructionName: 'Fasada Słupek-Rygiel - ZMIANA',
                        quantityInStage: 99
                    }
                ]
            });
        assert.strictEqual(stageItemConflictRes.status, 409);
        assert.match(stageItemConflictRes.body.error, /Klucz idempotencji został już użyty dla żądania o innym payloadzie/);
    });

    await t.test('46. [P1 DOMAIN] Counter synchronization from existing jobs and unique jobCode index enforcement', async () => {
        // Use dedicated test year 2025 to cleanly verify cold-start counter synchronization
        const testYear = 2025;
        const testCodePrefix = `CF-${testYear}-`;

        // 1. Seed existing jobs CF-2025-001 ... CF-2025-005
        const seededJobs = [];
        for (let i = 1; i <= 5; i++) {
            seededJobs.push({
                id: `job-seed-${testYear}-${i}`,
                jobCode: `${testCodePrefix}${String(i).padStart(3, '0')}`,
                name: `Istniejące Zlecenie ${i}`,
                clientId: 'client-acid-job',
                status: 'planned',
                createdAt: `${testYear}-01-10T10:00:00Z`,
                updatedAt: `${testYear}-01-10T10:00:00Z`,
                isActive: true,
                editVersion: 1
            });
        }
        await testDb.collection('jobs').insertMany(seededJobs);

        // 2. Delete any existing counter doc for testYear
        await testDb.collection('counters').deleteOne({ _id: `job_${testYear}` });

        // 3. Ensure indexes and run synchronization
        await reconcileDuplicatesAndEnsureIndexes(testDb);

        // Verify counter document is now synchronized to at least 5
        const counterDoc = await testDb.collection('counters').findOne({ _id: `job_${testYear}` });
        assert.ok(counterDoc);
        assert.ok(counterDoc.seq >= 5, `Expected counter seq >= 5, got ${counterDoc.seq}`);

        // 4. Test Unique Index enforcement directly on MongoDB
        // Attempting to manually insert an active job with an already taken jobCode must fail with E11000 duplicate key error
        let dupErr = null;
        try {
            await testDb.collection('jobs').insertOne({
                id: 'job-manual-dup-check',
                jobCode: `${testCodePrefix}001`,
                name: 'Zduplikowany kod zlecenia',
                clientId: 'client-acid-job',
                status: 'planned',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isActive: true,
                editVersion: 1
            });
        } catch (err) {
            dupErr = err;
        }

        assert.ok(dupErr, 'Unique index on jobCode must reject duplicate jobCode insert');
        assert.ok(dupErr.code === 11000 || dupErr.message.includes('11000'), 'Error code must be E11000 duplicate key error');
    });

    await t.test('47. [P1 DOMAIN ACID] POST /api/jobs/batch-import rolls back and aborts with 500 when counter update fails', async () => {
        const failJobId = 'job-batch-fail-counter-1';
        const failJobCode = 'CF-2026-888';

        // Ensure failJobId does not exist initially
        await testDb.collection('jobs').deleteOne({ id: failJobId });

        const { setTestFailpoint } = require('../server.js');
        setTestFailpoint('batch_job_counter_failure');
        try {
            const res = await request(app)
                .post('/api/jobs/batch-import')
                .set('Authorization', 'Bearer ' + adminToken)
                .send({
                    items: [
                        { id: failJobId, name: 'Zlecenie z Awarią Licznika', clientId: 'client-acid-job', jobCode: failJobCode }
                    ]
                });

            assert.strictEqual(res.status, 500, 'Batch import must return 500 on counter update failure');
            assert.match(res.body.errors ? res.body.errors.join(' ') : (res.body.error || ''), /Simulated counter update failure/);

            // ACID Verification: Because of transaction rollback, the job was NOT inserted!
            const docInDb = await testDb.collection('jobs').findOne({ id: failJobId });
            assert.strictEqual(docInDb, null, 'Job document must NOT be persisted in database after counter failure rollback');

            // Counter was NOT updated to 888
            const counterDoc = await testDb.collection('counters').findOne({ _id: 'job_2026' });
            if (counterDoc) {
                assert.ok((counterDoc.seq || 0) < 888, 'Counter sequence must not be bumped to 888');
            }
        } finally {
            setTestFailpoint(null);
            await testDb.collection('jobs').deleteOne({ id: failJobId });
        }
    });

    await t.test('48. [P1 DOMAIN ACID] POST /api/jobs/batch-import in production fails closed with 503 TRANSACTIONS_REQUIRED when Replica Set / session is unavailable, zero writes performed', async () => {
        const origNodeEnv = process.env.NODE_ENV;
        const origAllowNonTx = process.env.ALLOW_NON_TRANSACTIONAL;
        process.env.NODE_ENV = 'production';
        delete process.env.ALLOW_NON_TRANSACTIONAL;

        const { setTestFailpoint } = require('../server.js');
        const failJob1Id = 'job-batch-fail-closed-1';
        const failJob2Id = 'job-batch-fail-closed-2';

        try {
            // Case 1: startSession throws error
            setTestFailpoint('force_session_failure');
            const resA = await request(app)
                .post('/api/jobs/batch-import')
                .set('Authorization', 'Bearer ' + adminToken)
                .send({
                    items: [
                        { id: failJob1Id, name: 'Zlecenie Bez RS 1', clientId: 'client-acid-job' },
                        { id: failJob2Id, name: 'Zlecenie Bez RS 2', clientId: 'client-acid-job' }
                    ]
                });

            assert.strictEqual(resA.status, 503, 'Must return 503 when session start fails in production');
            assert.strictEqual(resA.body.code, 'TRANSACTIONS_REQUIRED');

            // Zero writes verified in DB
            const docA1 = await testDb.collection('jobs').findOne({ id: failJob1Id });
            const docA2 = await testDb.collection('jobs').findOne({ id: failJob2Id });
            assert.strictEqual(docA1, null, 'Job 1 must NOT be saved on 503 fail-closed');
            assert.strictEqual(docA2, null, 'Job 2 must NOT be saved on 503 fail-closed');

            // Case 2: startSession returns null
            setTestFailpoint('session_returns_null');
            const resB = await request(app)
                .post('/api/jobs/batch-import')
                .set('Authorization', 'Bearer ' + adminToken)
                .send({
                    items: [
                        { id: failJob1Id, name: 'Zlecenie Bez RS 1', clientId: 'client-acid-job' },
                        { id: failJob2Id, name: 'Zlecenie Bez RS 2', clientId: 'client-acid-job' }
                    ]
                });

            assert.strictEqual(resB.status, 503, 'Must return 503 when session is null in production');
            assert.strictEqual(resB.body.code, 'TRANSACTIONS_REQUIRED');

            // Zero writes verified in DB
            const docB1 = await testDb.collection('jobs').findOne({ id: failJob1Id });
            const docB2 = await testDb.collection('jobs').findOne({ id: failJob2Id });
            assert.strictEqual(docB1, null, 'Job 1 must NOT be saved on 503 fail-closed');
            assert.strictEqual(docB2, null, 'Job 2 must NOT be saved on 503 fail-closed');
        } finally {
            setTestFailpoint(null);
            process.env.NODE_ENV = origNodeEnv;
            if (origAllowNonTx !== undefined) process.env.ALLOW_NON_TRANSACTIONAL = origAllowNonTx;
            await testDb.collection('jobs').deleteMany({ id: { $in: [failJob1Id, failJob2Id] } });
        }
    });

    await t.test('49. [P1 DOMAIN ACID] POST /api/jobs/batch-import with 2 jobs where second hits E11000 duplicate key triggers full rollback (409, succeeded: 0, first job not persisted, counter untouched)', async () => {
        const existingJobId = 'job-acid-batch-existing';
        const existingJobCode = 'CF-2026-950';

        const newJob1Id = 'job-acid-batch-new-1';
        const newJob1Code = 'CF-2026-951';

        const conflictingJob2Id = 'job-acid-batch-conflicting-2';
        const conflictingJob2Code = existingJobCode; // Duplicate jobCode triggers E11000 on unique index

        // Clean slate
        await testDb.collection('jobs').deleteMany({
            id: { $in: [existingJobId, newJob1Id, conflictingJob2Id] }
        });

        // 1. Seed existing job in database with existingJobCode
        await testDb.collection('jobs').insertOne({
            id: existingJobId,
            jobCode: existingJobCode,
            name: 'Istniejące Zlecenie w Bazie',
            clientId: 'client-acid-job',
            status: 'planned',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: true,
            editVersion: 1
        });

        // Record initial counter state for 2026
        const initialCounterDoc = await testDb.collection('counters').findOne({ _id: 'job_2026' });
        const initialSeq = initialCounterDoc ? (initialCounterDoc.seq || 0) : 0;

        try {
            // 2. Send batch with 2 jobs: Job 1 is new/valid, Job 2 has conflicting jobCode
            const res = await request(app)
                .post('/api/jobs/batch-import')
                .set('Authorization', 'Bearer ' + adminToken)
                .send({
                    items: [
                        { id: newJob1Id, jobCode: newJob1Code, name: 'Nowe Zlecenie 1', clientId: 'client-acid-job' },
                        { id: conflictingJob2Id, jobCode: conflictingJob2Code, name: 'Zlecenie Konfliktujące z Istniejącym Kodem', clientId: 'client-acid-job' }
                    ]
                });

            // 3. Must return 409 BATCH_IMPORT_VERSION_CONFLICT with succeeded: 0
            assert.strictEqual(res.status, 409, 'Batch import with duplicate key conflict must return 409');
            assert.strictEqual(res.body.code, 'BATCH_IMPORT_VERSION_CONFLICT');
            assert.strictEqual(res.body.status, 'failed');
            assert.strictEqual(res.body.succeeded, 0, 'Transactional batch write must have succeeded: 0 after rollback');
            assert.strictEqual(res.body.failed, 2, 'Both items marked as failed');
            assert.deepStrictEqual(res.body.succeededIds, []);
            assert.deepStrictEqual(res.body.failedIds, [newJob1Id, conflictingJob2Id]);

            // 4. ACID Verification: Rollback means Job 1 was NOT inserted into MongoDB!
            const job1InDb = await testDb.collection('jobs').findOne({ id: newJob1Id });
            assert.strictEqual(job1InDb, null, 'Job 1 must NOT exist in database due to full transaction rollback!');

            const job2InDb = await testDb.collection('jobs').findOne({ id: conflictingJob2Id });
            assert.strictEqual(job2InDb, null, 'Job 2 must NOT exist in database');

            // 5. Counter sequence must NOT be bumped to 951
            const postCounterDoc = await testDb.collection('counters').findOne({ _id: 'job_2026' });
            const postSeq = postCounterDoc ? (postCounterDoc.seq || 0) : 0;
            assert.strictEqual(postSeq, initialSeq, `Counter seq must remain untouched at ${initialSeq}, got ${postSeq}`);

            // 6. Existing job in database is untouched
            const existingInDb = await testDb.collection('jobs').findOne({ id: existingJobId });
            assert.ok(existingInDb);
            assert.strictEqual(existingInDb.name, 'Istniejące Zlecenie w Bazie');
            assert.strictEqual(existingInDb.editVersion, 1);
        } finally {
            await testDb.collection('jobs').deleteMany({
                id: { $in: [existingJobId, newJob1Id, conflictingJob2Id] }
            });
        }
    });
});
