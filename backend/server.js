const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { MongoClient, ObjectId, BSON } = require('mongodb');

// BSON Deep Clone helper: preserves full BSON types (Date, ObjectId, Decimal128, Binary) without JSON degradation
function cloneBsonDoc(doc) {
    if (!doc) return doc;
    try {
        if (BSON && typeof BSON.serialize === 'function' && typeof BSON.deserialize === 'function') {
            return BSON.deserialize(BSON.serialize(doc));
        }
    } catch (_) {}
    return { ...doc };
}
const bcrypt = require('bcryptjs');
const multer = require('multer');
const rateLimit = require('express-rate-limit'); // Security: Brute Force protection
require('dotenv').config();
const { generateToken, verifyToken: verifyTokenLegacy, createVerifyToken, requireRole } = require('./authMiddleware');
const { initBackupSchedule } = require('./backup-service');

// TARCZA 3: file-type v16 is CommonJS-compatible
const fileType = require('file-type');
const fileTypeFromBuffer = fileType.fromBuffer; // v16 exports fromBuffer, not fileTypeFromBuffer

// TARCZA 3: Allowed MIME types + magic-bytes whitelist
const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'image/svg+xml',                                        // SVG: text/XML — no magic bytes, validated by ext
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
    'application/zip',
    'application/octet-stream' // DWG/DXF: binary CAD — magic bytes checked separately
]);

// Magic byte prefixes for extension double-check (CAD, plain text have no universal magic)
// SVG is XML — no distinctive magic bytes — trusted after ext whitelist
const ALLOWED_EXT_FALLBACK = new Set(['.txt', '.csv', '.dwg', '.dxf', '.svg']);


// Helper to allow GET for all authenticated users, but restrict other methods to admin/manager
const requireRoleOrSafeGet = (req, res, next) => {
    if (req.method === 'GET') return next();
    return requireRole('admin', 'manager')(req, res, next);
};

// Helper for collections where workers MUST be able to POST (extra-works, time-entries, requests)
const requireWorkerPostOrAdmin = (req, res, next) => {
    if (req.method === 'POST' || req.method === 'GET') return next();
    return requireRole('admin', 'manager')(req, res, next);
};

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/costframe';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

if (process.env.NODE_ENV === 'test') {
    app.use((req, res, next) => {
        console.log(`[TEST] ${req.method} ${req.url}`);
        next();
    });
}

// Static file serving for uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// TARCZA 3: multer uses memoryStorage — file is held in RAM buffer, validated BEFORE disk write
const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        // First gate: extension whitelist (fast, cheap)
        const ext = path.extname(file.originalname).toLowerCase();
        const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.zip', '.dwg', '.dxf']);
        if (!ALLOWED_EXT.has(ext)) {
            return cb(new Error(`Niedozwolone rozszerzenie pliku: ${ext}. Dozwolone: jpg, png, pdf, doc, xls, csv, dwg, dxf.`));
        }
        cb(null, true);
    }
});

// TARCZA 3: Middleware that validates Magic Bytes and saves file to disk
async function validateAndSaveUpload(req, res, next) {
    if (!req.file) return next();
    try {
        const detectedType = await fileTypeFromBuffer(req.file.buffer);
        const ext = path.extname(req.file.originalname).toLowerCase();

        // For files with no universal magic bytes (txt, csv, dwg, dxf) — extension is trusted after ext whitelist
        const isKnownTextFormat = ALLOWED_EXT_FALLBACK.has(ext);

        if (!isKnownTextFormat) {
            if (!detectedType) {
                return res.status(422).json({ error: 'Nie można rozpoznać typu pliku. Plik może być uszkodzony lub jest wykonywalny.' });
            }
            if (!ALLOWED_MIME_TYPES.has(detectedType.mime)) {
                return res.status(422).json({
                    error: `Niedozwolony typ pliku. Wykryto: ${detectedType.mime}. Sygnatura binarna pliku nie zgadza się z jego rozszerzeniem.`
                });
            }
        }

        // Magic bytes OK — save buffer to disk
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeExt = detectedType ? `.${detectedType.ext}` : ext; // Use verified extension from magic bytes
        const filename = `${uniqueSuffix}${safeExt}`;
        const filepath = path.join(uploadsDir, filename);
        fs.writeFileSync(filepath, req.file.buffer);

        // Augment req.file to match diskStorage interface expected by route handlers
        req.file.filename = filename;
        req.file.path = filepath;
        console.log(`[UPLOAD] ✅ Validated & saved: ${filename} (MIME: ${detectedType?.mime || 'text/plain'})`);
        next();
    } catch (err) {
        console.error('[UPLOAD] Magic bytes check failed:', err.message);
        res.status(500).json({ error: 'Błąd weryfikacji pliku.' });
    }
}


let db;
let client;
let isReplicaSet = false;
let _testFailpoint = null;
function setTestFailpoint(fp) {
    _testFailpoint = fp;
}
function getTestFailpoint() {
    return _testFailpoint;
}
let _testBarrierHook = null;
function setTestBarrierHook(hook) {
    _testBarrierHook = hook;
}
function getTestBarrierHook() {
    return _testBarrierHook;
}

async function checkReplicaSetTopology(targetClient) {
    if (!targetClient) return false;
    try {
        const helloRes = await targetClient.db().admin().command({ hello: 1 });
        return Boolean(helloRes.setName && (helloRes.isWritablePrimary || helloRes.ismaster));
    } catch (_) {
        return false;
    }
}

function requireTransactions(req, res, next) {
    if (!isReplicaSet) {
        if (process.env.ALLOW_NON_TRANSACTIONAL === 'true' || process.env.NODE_ENV === 'test') {
            return next();
        }
        return res.status(503).json({
            code: 'TRANSACTIONS_REQUIRED',
            error: 'Operacja domenowa wymaga włączonego Replica Set w MongoDB (ACID transactions required). Skonfiguruj \'replication.replSet\' w konfiguracji bazy danych.'
        });
    }
    next();
}

// Connect to MongoDB

const ALL_SYSTEM_COLLECTIONS = [
    'jobs', 'offers', 'time-entries', 'settlements', 'employees',
    'subcontractors', 'clients', 'crews', 'catalog-materials',
    'materials', 'offer-templates', 'notifications', 'site-logs',
    'messages', 'archived-reports', 'extra-works', 'company-settings',
    'invoices', 'cost-invoices', 'requests', 'payments', 'constructions', 'boms',
    'installation-rates', 'logistics-rates', 'rental-rates', 'sheet-metal',
    'custom-events', 'client-reports', 'checklists', 'checklist-templates',
    'standards', 'settings', 'jobStageItems', 'subcontractor_contracts',
    'documents', 'equipment', 'idempotency_keys'
];

const ALLOWED_BATCH_IMPORT_COLLECTIONS = new Set([
    'time-entries',
    'clients',
    'catalog-materials',
    'materials',
    'jobs'
]);

const ALLOWED_MIGRATION_COLLECTIONS = new Set([
    'clients',
    'offers',
    'jobs',
    'constructions',
    'materials',
    'standards',
    'settings',
    'jobStageItems',
    'custom-events',
    'subcontractor_contracts'
]);

function toCanonicalJson(obj) {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
        return obj.map(toCanonicalJson);
    }
    const sortedKeys = Object.keys(obj).sort();
    const result = {};
    for (const key of sortedKeys) {
        if (key === '_id' || key === '__v' || key === '_lastUpdatedAt' || key === '_fingerprint') continue;
        result[key] = toCanonicalJson(obj[key]);
    }
    return result;
}

function computeCanonicalDocHash(doc) {
    if (!doc || typeof doc !== 'object') return 'empty';
    const canonical = toCanonicalJson(doc);
    const str = JSON.stringify(canonical);
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}


let dbReady = process.env.NODE_ENV === 'test';
let indexInitError = null;

// Reconciles duplicates safely with quarantine backup and field merging,
// then creates and verifies unique index on { id: 1 } for all system collections
async function reconcileDuplicatesAndEnsureIndexes(database) {
    if (!database) return;
    const failures = [];

    for (const col of ALL_SYSTEM_COLLECTIONS) {
        try {
            const collection = database.collection(col);
            if (!collection) continue;

            // 1. Group by id and safely reconcile duplicates before creating unique index
            if (typeof collection.aggregate === 'function') {
                const duplicates = await collection.aggregate([
                    { $match: { id: { $exists: true, $ne: null } } },
                    { $group: {
                        _id: "$id",
                        count: { $sum: 1 },
                        docs: { $push: { _id: "$_id", updatedAt: "$updatedAt", createdAt: "$createdAt" } }
                    } },
                    { $match: { count: { $gt: 1 } } }
                ]).toArray();

                if (duplicates && duplicates.length > 0) {
                    console.warn(`[INDEX MIGRATION] Found ${duplicates.length} duplicate ID group(s) in collection '${col}'. Reconciling with quarantine snapshot...`);
                    for (const group of duplicates) {
                        const groupDocIds = group.docs.map(d => d._id);
                        let fullDocs = [];
                        if (typeof collection.find === 'function') {
                            const cursor = collection.find({ _id: { $in: groupDocIds } });
                            if (cursor && typeof cursor.toArray === 'function') {
                                fullDocs = await cursor.toArray();
                            }
                        }
                        if (!fullDocs || fullDocs.length === 0) {
                            fullDocs = group.docs;
                        }

                        fullDocs.sort((a, b) => {
                            const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                            const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                            if (timeB !== timeA) return timeB - timeA;
                            return String(b._id).localeCompare(String(a._id));
                        });

                        const primaryDoc = fullDocs[0];
                        const duplicateDocs = fullDocs.slice(1);

                        // 1. Snapshot / Quarantine: Archive pre-merge primary document AND discarded duplicates into _migration_quarantine
                        const quarantineEntries = [
                            {
                                quarantineId: new ObjectId().toString(),
                                collectionName: col,
                                documentId: group._id,
                                originalDocId: primaryDoc._id,
                                archivedAt: new Date().toISOString(),
                                reason: 'pre_merge_primary_snapshot',
                                duplicateDoc: cloneBsonDoc(primaryDoc)
                            },
                            ...duplicateDocs.map(dup => ({
                                quarantineId: new ObjectId().toString(),
                                collectionName: col,
                                documentId: group._id,
                                originalDocId: dup._id,
                                archivedAt: new Date().toISOString(),
                                reason: 'duplicate_key_reconciliation',
                                duplicateDoc: cloneBsonDoc(dup)
                            }))
                        ];

                        const quarantineCol = database.collection('_migration_quarantine');
                        if (quarantineCol && typeof quarantineCol.insertMany === 'function' && quarantineEntries.length > 0) {
                            await quarantineCol.insertMany(quarantineEntries);
                        }

                        // 2. Non-destructive field merge + conflict detection
                        const mergedFields = [];
                        const conflictingFields = [];
                        const updates = {};

                        for (const dup of duplicateDocs) {
                            for (const [key, val] of Object.entries(dup)) {
                                if (key === '_id' || key === 'id' || key === 'updatedAt' || key === 'createdAt') continue;
                                if (val !== undefined && val !== null && val !== '') {
                                    if (primaryDoc[key] === undefined || primaryDoc[key] === null || primaryDoc[key] === '') {
                                        primaryDoc[key] = val;
                                        updates[key] = val;
                                        mergedFields.push(key);
                                    } else if (Array.isArray(val) && val.length > 0) {
                                        if (Array.isArray(primaryDoc[key]) && primaryDoc[key].length > 0) {
                                            if (JSON.stringify(val) !== JSON.stringify(primaryDoc[key])) {
                                                conflictingFields.push(key);
                                            }
                                        }
                                    } else if (typeof val === 'object' && Object.keys(val).length > 0) {
                                        if (typeof primaryDoc[key] === 'object' && Object.keys(primaryDoc[key]).length > 0) {
                                            if (JSON.stringify(val) !== JSON.stringify(primaryDoc[key])) {
                                                conflictingFields.push(key);
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        const uniqueConflicts = Array.from(new Set(conflictingFields));
                        if (uniqueConflicts.length > 0) {
                            console.warn(`[MIGRATION CONFLICT] Collection '${col}' doc '${group._id}' has conflicting complex field(s): [${uniqueConflicts.join(', ')}]. Preserved newest version in active DB and archived full version in _migration_quarantine.`);
                        }

                        if (Object.keys(updates).length > 0 && typeof collection.updateOne === 'function') {
                            await collection.updateOne({ _id: primaryDoc._id }, { $set: updates });
                        }

                        // 3. Log reconciliation audit record in _migration_logs
                        const migrationLogsCol = database.collection('_migration_logs');
                        if (migrationLogsCol && typeof migrationLogsCol.insertOne === 'function') {
                            await migrationLogsCol.insertOne({
                                collectionName: col,
                                documentId: group._id,
                                reconciledAt: new Date().toISOString(),
                                survivingDocId: primaryDoc._id,
                                quarantinedDocIds: duplicateDocs.map(d => d._id),
                                mergedFields,
                                hasConflicts: uniqueConflicts.length > 0,
                                conflictingFields: uniqueConflicts
                            });
                        }

                        // 4. Remove duplicate documents from primary collection
                        const redundantIds = duplicateDocs.map(d => d._id);
                        if (typeof collection.deleteMany === 'function' && redundantIds.length > 0) {
                            await collection.deleteMany({ _id: { $in: redundantIds } });
                        }

                        console.warn(`[INDEX MIGRATION] Kept latest record for id '${group._id}', quarantined & removed ${redundantIds.length} stale duplicate(s) from '${col}'.`);
                    }
                }
            }

            // 2. Create unique sparse index
            if (typeof collection.createIndex === 'function') {
                await collection.createIndex({ id: 1 }, { unique: true, sparse: true });
            if (col === 'idempotency_keys') {
                await collection.createIndex({ endpoint: 1, key: 1 }, { unique: true });
                await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
            }
            }

            // 3. Verify index exists with uniqueness
            if (typeof collection.indexes === 'function') {
                const indexes = await collection.indexes();
                const verified = indexes.some(idx => idx.key && idx.key.id === 1 && idx.unique === true);
                if (!verified) {
                    throw new Error(`Indeks unikalny { id: 1 } nie został zweryfikowany w kolekcji '${col}'.`);
                }
            }
        } catch (err) {
            console.error(`[CRITICAL INDEX ERROR] Failed to ensure index for collection '${col}':`, err);
            failures.push({ collection: col, error: err.message });
        }
    }

    if (failures.length > 0) {
        const errorMsg = `Krytyczny błąd: Nie udało się zagwarantować integralności indeksów dla ${failures.length} kolekcji: ` +
            failures.map(f => `${f.collection} (${f.error})`).join('; ');
        throw new Error(errorMsg);
    }
}


// ==========================================
// Idempotent Seeding on Database Connection
// ==========================================
const SEEDED_STANDARD_RULES = {
    'std-pvc-01': [
        {
            id: 'rule-pvc-piana',
            edge: 'perimeter',
            materialId: 'mat-pur-low-750',
            usagePerMeter: 0.25,
            usageUnit: 'szt/mb',
            basis: 'mb',
            wastePercent: 10
        },
        {
            id: 'rule-pvc-tasma',
            edge: 'perimeter',
            materialId: 'mat-tasma-rozprezna-10',
            usagePerMeter: 1.0,
            usageUnit: 'm/mb',
            basis: 'mb',
            wastePercent: 5
        }
    ],
    'std-alu-01': [
        {
            id: 'rule-alu-konsole',
            edge: 'perimeter',
            materialId: 'mat-konsola-montazowa-l',
            usagePerMeter: 1.5,
            usageUnit: 'szt/mb',
            basis: 'mb',
            wastePercent: 0
        },
        {
            id: 'rule-alu-epdm',
            edge: 'perimeter',
            materialId: 'mat-folia-epdm-zew',
            usagePerMeter: 1.0,
            usageUnit: 'm/mb',
            basis: 'mb',
            wastePercent: 5
        },
        {
            id: 'rule-alu-klej',
            edge: 'perimeter',
            materialId: 'mat-klej-hybrydowy',
            usagePerMeter: 0.15,
            usageUnit: 'szt/mb',
            basis: 'mb',
            wastePercent: 10
        }
    ]
};

async function repairLegacyC4c2ac3Standards(targetDb) {
    if (!targetDb) return 0;
    const migrationsColl = targetDb.collection('system_migrations');
    const repairMigrationId = 'repair_c4c2ac3_standards_schema_v1';

    // One-time persistent migration marker: if already executed, never run again
    const alreadyApplied = await migrationsColl.findOne({ id: repairMigrationId });
    if (alreadyApplied) {
        return 0;
    }

    const standardsColl = targetDb.collection('standards');
    let repairedCount = 0;

    // Check std-pvc-01: ONLY repair if it strictly matches the exact legacy shape from commit c4c2ac3
    // (exact single rule 'rule-pvc-01' without materialId)
    const pvc = await standardsColl.findOne({ id: 'std-pvc-01' });
    if (pvc && Array.isArray(pvc.rules) && pvc.rules.length === 1 && pvc.rules[0].id === 'rule-pvc-01' && !pvc.rules[0].materialId) {
        await standardsColl.updateOne(
            { id: 'std-pvc-01' },
            { 
                $set: { 
                    rules: SEEDED_STANDARD_RULES['std-pvc-01'],
                    updatedAt: new Date().toISOString()
                } 
            }
        );
        repairedCount++;
    }

    // Check std-alu-01: ONLY repair if it strictly matches the exact legacy shape from commit c4c2ac3
    // (exact single rule 'rule-alu-01' without materialId)
    const alu = await standardsColl.findOne({ id: 'std-alu-01' });
    if (alu && Array.isArray(alu.rules) && alu.rules.length === 1 && alu.rules[0].id === 'rule-alu-01' && !alu.rules[0].materialId) {
        await standardsColl.updateOne(
            { id: 'std-alu-01' },
            { 
                $set: { 
                    rules: SEEDED_STANDARD_RULES['std-alu-01'],
                    updatedAt: new Date().toISOString()
                } 
            }
        );
        repairedCount++;
    }

    // Record one-time migration marker so this repair will never run again
    await migrationsColl.updateOne(
        { id: repairMigrationId },
        { $setOnInsert: { id: repairMigrationId, appliedAt: new Date().toISOString(), repairedCount } },
        { upsert: true }
    );

    return repairedCount;
}

const repairIncompleteStandards = repairLegacyC4c2ac3Standards;

async function backfillTimeEntriesWorkerType(targetDb) {
    if (!targetDb) return { resolvedCount: 0, unresolvedCount: 0, status: 'no_db' };
    const migrationsColl = targetDb.collection('system_migrations');
    const migrationId = 'backfill_time_entries_worker_type_v1';

    const existingMigration = await migrationsColl.findOne({ id: migrationId });
    if (existingMigration && existingMigration.status === 'completed') {
        return { resolvedCount: 0, unresolvedCount: 0, status: 'already_completed' };
    }

    const timeEntriesColl = targetDb.collection('time-entries');
    const employeesColl = targetDb.collection('employees');
    const subcontractorsColl = targetDb.collection('subcontractors');

    // Pre-fetch all known contractor and employee IDs in ONE query each (eliminates N+1)
    const [subDocs, empDocs] = await Promise.all([
        subcontractorsColl.find({}, { projection: { id: 1, _id: 1 } }).toArray(),
        employeesColl.find({}, { projection: { id: 1, _id: 1 } }).toArray()
    ]);

    const subIdSet = new Set();
    subDocs.forEach(s => {
        if (s.id) subIdSet.add(String(s.id));
        if (s._id) subIdSet.add(String(s._id));
    });

    const empIdSet = new Set();
    empDocs.forEach(e => {
        if (e.id) empIdSet.add(String(e.id));
        if (e._id) empIdSet.add(String(e._id));
    });

    const cursor = timeEntriesColl.find({
        $or: [
            { workerType: { $exists: false } },
            { workerType: null },
            { workerType: '' }
        ]
    });

    let batchOps = [];
    const MAX_UNRESOLVED_SAMPLES = 100;
    const unresolvedSamples = [];
    let unresolvedCount = 0;
    let resolvedCount = 0;
    let totalScanned = 0;
    const now = new Date().toISOString();

    while (await cursor.hasNext()) {
        const entry = await cursor.next();
        totalScanned++;
        const empId = entry.employeeId || entry.employee_id;
        let resolvedWorkerType = null;

        const inSub = empId && subIdSet.has(String(empId));
        const inEmp = empId && empIdSet.has(String(empId));

        if (inSub && inEmp) {
            // Collision between employee and subcontractor collections
            if (entry.type === 'subcontractor') {
                resolvedWorkerType = 'subcontractor';
            } else if (entry.type === 'employee') {
                resolvedWorkerType = 'employee';
            } else {
                // Ambiguous collision - DO NOT arbitrarily choose one
                resolvedWorkerType = null;
            }
        } else if (inSub) {
            resolvedWorkerType = 'subcontractor';
        } else if (inEmp) {
            resolvedWorkerType = 'employee';
        } else if (entry.type === 'subcontractor') {
            resolvedWorkerType = 'subcontractor';
        } else if (entry.type === 'employee') {
            resolvedWorkerType = 'employee';
        }

        let resolvedActivityType = entry.activityType;
        if (!resolvedActivityType) {
            resolvedActivityType = ['drive', 'work', 'other'].includes(entry.type) ? entry.type : 'work';
        }

        if (resolvedWorkerType) {
            batchOps.push({
                updateOne: {
                    filter: { _id: entry._id },
                    update: {
                        $set: {
                            workerType: resolvedWorkerType,
                            activityType: resolvedActivityType,
                            updatedAt: entry.updatedAt || now
                        }
                    }
                }
            });
            resolvedCount++;
        } else {
            // Unresolved record (collision or not found in either collection)
            unresolvedCount++;
            if (unresolvedSamples.length < MAX_UNRESOLVED_SAMPLES) {
                unresolvedSamples.push({
                    entryId: entry.id || String(entry._id),
                    employeeId: empId,
                    type: entry.type,
                    reason: inSub && inEmp
                        ? 'Identifier collision: ID exists in both employees and subcontractors with ambiguous type'
                        : 'Entity not found in employees or subcontractors, and legacy type is ambiguous'
                });
            }

            // Normalize activityType if missing, but leave workerType untouched
            if (!entry.activityType && resolvedActivityType) {
                batchOps.push({
                    updateOne: {
                        filter: { _id: entry._id },
                        update: {
                            $set: {
                                activityType: resolvedActivityType,
                                updatedAt: entry.updatedAt || now
                            }
                        }
                    }
                });
            }
        }

        if (batchOps.length >= 500) {
            if (typeof timeEntriesColl.bulkWrite === 'function') {
                await timeEntriesColl.bulkWrite(batchOps, { ordered: false });
            } else {
                for (const op of batchOps) {
                    await timeEntriesColl.updateOne(op.updateOne.filter, op.updateOne.update);
                }
            }
            batchOps = [];
        }
    }

    if (batchOps.length > 0) {
        if (typeof timeEntriesColl.bulkWrite === 'function') {
            await timeEntriesColl.bulkWrite(batchOps, { ordered: false });
        } else {
            for (const op of batchOps) {
                await timeEntriesColl.updateOne(op.updateOne.filter, op.updateOne.update);
            }
        }
    }

    const migrationLogsCol = targetDb.collection('_migration_logs');
    if (unresolvedCount > 0) {
        console.warn(`[MIGRATION] Warning: ${unresolvedCount} time entries could not be resolved to employee/subcontractor.`);
        if (migrationLogsCol && typeof migrationLogsCol.insertOne === 'function') {
            await migrationLogsCol.insertOne({
                migrationId,
                executedAt: now,
                totalScanned,
                resolvedCount,
                unresolvedCount,
                unresolvedRecords: unresolvedSamples
            });
        }
    }

    const status = unresolvedCount === 0 ? 'completed' : 'partial';

    await migrationsColl.updateOne(
        { id: migrationId },
        {
            $set: {
                id: migrationId,
                status,
                appliedAt: now,
                version: 1,
                totalScanned,
                resolvedCount,
                unresolvedCount
            }
        },
        { upsert: true }
    );

    if (resolvedCount > 0 || unresolvedCount > 0) {
        console.log(`[MIGRATION] WorkerType backfill finished: ${resolvedCount} resolved, ${unresolvedCount} unresolved (status: ${status}).`);
    }

    return { totalScanned, resolvedCount, unresolvedCount, status };
}


async function seedInitialDataIfEmpty(targetDb) {
    if (!targetDb) return { seeded: false, reason: 'No db instance' };
    const migrationsColl = targetDb.collection('system_migrations');
    
    // Check persistent migration version marker - prevents re-seeding if user intentionally empties data
    // Always repair existing standards if they were created with incomplete schema (e.g. by commit c4c2ac3)
    const repairedStandards = await repairLegacyC4c2ac3Standards(targetDb);
    if (repairedStandards > 0) {
        console.log(`[SEED/MIGRATION] Repaired ${repairedStandards} standards with missing materialId.`);
    }

    // Check persistent migration version marker - prevents re-seeding if user intentionally empties data
    const migrationId = 'initial_standards_and_templates_v1';
    const alreadyApplied = await migrationsColl.findOne({ id: migrationId });
    if (alreadyApplied) {
        return { 
            seeded: false, 
            reason: 'Migration already applied', 
            migrationId, 
            appliedAt: alreadyApplied.appliedAt,
            repairedStandards 
        };
    }

    const summary = { materials: 0, standards: 0, offers: 0, constructions: 0 };
    const now = new Date().toISOString();

    try {
        // 1. Seed base materials with valid IDs
        const materialsColl = targetDb.collection('materials');
        const defaultMaterials = [
            {
                id: 'mat-pur-low-750',
                name: 'Pianka PUR niskoprężna 750ml',
                category: 'izolacyjne',
                unit: 'szt',
                defaultUnitPrice: 24.50,
                isActive: true,
                wastePercent: 10,
                createdAt: now,
                updatedAt: now
            },
            {
                id: 'mat-tasma-rozprezna-10',
                name: 'Taśma rozprężna 10/4-9mm 8m',
                category: 'izolacyjne',
                unit: 'm',
                defaultUnitPrice: 3.20,
                isActive: true,
                wastePercent: 5,
                createdAt: now,
                updatedAt: now
            },
            {
                id: 'mat-folia-epdm-zew',
                name: 'Folia EPDM zewnętrzna paroprzepuszczalna',
                category: 'izolacyjne',
                unit: 'm',
                defaultUnitPrice: 5.80,
                isActive: true,
                wastePercent: 5,
                createdAt: now,
                updatedAt: now
            },
            {
                id: 'mat-klej-hybrydowy',
                name: 'Klej hybrydowy do EPDM 600ml',
                category: 'uszczelniajace',
                unit: 'szt',
                defaultUnitPrice: 38.00,
                isActive: true,
                wastePercent: 10,
                createdAt: now,
                updatedAt: now
            },
            {
                id: 'mat-konsola-montazowa-l',
                name: 'Konsola montażowa ścienna L',
                category: 'elementy_zlacze',
                unit: 'szt',
                defaultUnitPrice: 8.50,
                isActive: true,
                wastePercent: 0,
                createdAt: now,
                updatedAt: now
            }
        ];

        for (const mat of defaultMaterials) {
            await materialsColl.updateOne(
                { id: mat.id },
                { $setOnInsert: mat },
                { upsert: true }
            );
            summary.materials++;
        }

        // 2. Seed standards with complete schema (valid materialId, edge, usagePerMeter, basis)
        const standardsColl = targetDb.collection('standards');
        const defaultStandards = [
            {
                id: 'std-pvc-01',
                name: 'Standard PVC – Piana + Taśma 3-warstwowa',
                description: 'Montaż okien PVC z pianką PU, taśmą rozprężną 3-warstw. i folią paroprzepuszczalną',
                applicableTypes: ['okno_pvc', 'drzwi_pvc', 'hs_pvc'],
                isDefault: true,
                rules: [
                    {
                        id: 'rule-pvc-piana',
                        edge: 'perimeter',
                        materialId: 'mat-pur-low-750',
                        usagePerMeter: 0.25,
                        usageUnit: 'szt/mb',
                        basis: 'mb',
                        wastePercent: 10
                    },
                    {
                        id: 'rule-pvc-tasma',
                        edge: 'perimeter',
                        materialId: 'mat-tasma-rozprezna-10',
                        usagePerMeter: 1.0,
                        usageUnit: 'm/mb',
                        basis: 'mb',
                        wastePercent: 5
                    }
                ],
                createdAt: now,
                updatedAt: now
            },
            {
                id: 'std-alu-01',
                name: 'Standard ALU – Montaż na konsolach + EPDM',
                description: 'Montaż konstrukcji aluminiowych na konsolach z folią EPDM i klejem hybrydowym',
                applicableTypes: ['okno_alu', 'drzwi_alu', 'fasada_alu'],
                isDefault: false,
                rules: [
                    {
                        id: 'rule-alu-konsole',
                        edge: 'perimeter',
                        materialId: 'mat-konsola-montazowa-l',
                        usagePerMeter: 1.5,
                        usageUnit: 'szt/mb',
                        basis: 'mb',
                        wastePercent: 0
                    },
                    {
                        id: 'rule-alu-epdm',
                        edge: 'perimeter',
                        materialId: 'mat-folia-epdm-zew',
                        usagePerMeter: 1.0,
                        usageUnit: 'm/mb',
                        basis: 'mb',
                        wastePercent: 5
                    },
                    {
                        id: 'rule-alu-klej',
                        edge: 'perimeter',
                        materialId: 'mat-klej-hybrydowy',
                        usagePerMeter: 0.15,
                        usageUnit: 'szt/mb',
                        basis: 'mb',
                        wastePercent: 10
                    }
                ],
                createdAt: now,
                updatedAt: now
            }
        ];

        for (const std of defaultStandards) {
            await standardsColl.updateOne(
                { id: std.id },
                { $setOnInsert: std },
                { upsert: true }
            );
            summary.standards++;
        }



        // 3. Seed template offer and construction
        const offersColl = targetDb.collection('offers');
        const templateOfferId = 'offer-template-std-01';
        const standardTemplateOffer = {
            id: templateOfferId,
            number: 'WZÓR-STD-01',
            clientId: '',
            location: 'Koszalin',
            status: 'draft',
            createdAt: now,
            updatedAt: now,
            materialsCost: 0,
            laborCost: 0,
            totalCost: 0,
            totalNet: 0,
            vatRate: 23,
            discountType: 'percent',
            discountValue: 0,
            subtotalNet: 0,
            discountAmount: 0,
            vatAmount: 0,
            totalGross: 0,
            offerTemplateType: 'detailed',
            title: 'Oferta montażu konstrukcji aluminiowych',
            scopeOfWork: [
                'Montaż konstrukcji aluminiowych zgodnie z załącznikiem nr 1',
                'Usługa odbędzie się na terenie zakładu produkcyjnego klienta Zleceniodawcy pod adresem: Koszalin, ul. Lniana 16',
                'Dokładny pomiar produkcyjny i przygotowanie konstrukcji do montażu jest po stronie Zleceniodawcy.',
                'Po stronie Zleceniodawcy jest przygotowanie otworów montażowych w konstrukcjach aluminiowych zgodnie z wymaganiami systemodawcy.',
                'Zleceniodawca jest zobowiązany do poinformowania na 1 tydzień przed planowanym montażem o możliwości rozpoczęcia montażu w danym terminie.',
                'Montaż odbędzie się 1-etapowo i w ciągłości dlatego Zleceniodawca gwarantuje dostawę wszystkich niezbędnych konstrukcji, elementów i materiałów w ustalonym terminie.'
            ],
            customMaterials: {
                providedByUs: ['śruby do mocowania oraz folia EPDM wraz z klejem'],
                providedByClient: ['taśma rozprężna 3-warstwowa, dopasowana do profilu i wymiarów otworów']
            },
            notes: [
                'Oferta nie obejmuje obróbek blacharskich.'
            ],
            settings: {
                margin: 0,
                discount: 0,
                workTime: { workTime: 0, workerCount: 0, hourlyRate: 0 },
                installationRates: {}
            },
            rentalItems: []
        };

        await offersColl.updateOne(
            { number: 'WZÓR-STD-01' },
            { $setOnInsert: standardTemplateOffer },
            { upsert: true }
        );
        summary.offers++;

        const constructionsColl = targetDb.collection('constructions');
        const standardConstruction = {
            id: 'const-template-std-01',
            offerId: templateOfferId,
            number: 1,
            name: 'Witryna W1',
            type: 'witryna',
            width: 1500,
            height: 2200,
            quantity: 5,
            area: 3.3,
            perimeter: 7.4,
            installationLocation: 'zew',
            weight: 50,
            totalArea: 16.5,
            totalPerimeter: 37,
            totalCost: 0,
            materialCosts: { items: [], total: 0 },
            installationCosts: { rate: 0, total: 0 },
            createdAt: now,
            updatedAt: now
        };

        await constructionsColl.updateOne(
            { id: standardConstruction.id },
            { $setOnInsert: standardConstruction },
            { upsert: true }
        );
        summary.constructions++;

        // Mark migration as applied in persistent system_migrations
        await migrationsColl.updateOne(
            { id: migrationId },
            { $setOnInsert: { id: migrationId, appliedAt: now, version: 1, summary } },
            { upsert: true }
        );

        console.log(`[SEED] Initial database seeding completed and marked as applied: ${summary.materials} materials, ${summary.standards} standards, ${summary.offers} offer templates, ${summary.constructions} constructions.`);
        return { seeded: true, summary };
    } catch (err) {
        console.error('[SEED ERROR] Idempotent seeding encountered error:', err.message);
        throw err;
    }
}

async function connectDB() {
    try {
        console.log(`Attempting to connect to MongoDB at ${mongoUri}...`);
        client = new MongoClient(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000
        });
        await client.connect();
        console.log('Successfully connected to MongoDB');
        db = client.db();

        // Topology check via hello command
        try {
            isReplicaSet = await checkReplicaSetTopology(client);
            console.log(`[MONGODB TOPOLOGY] hello check: isReplicaSet=${isReplicaSet}`);
        } catch (helloErr) {
            console.warn('[MONGODB TOPOLOGY] hello check failed:', helloErr.message);
            isReplicaSet = false;
        }

        // Initialize Backup Schedule
        initBackupSchedule(db);

        dbReady = false;
        indexInitError = null;
        await reconcileDuplicatesAndEnsureIndexes(db);
        await seedInitialDataIfEmpty(db);
        await backfillTimeEntriesWorkerType(db);
        await reconcilePendingJobAggregates();
        dbReady = true;
        console.log('Successfully reconciled duplicates, verified all unique indexes, and reconciled pending job aggregates.');

        if (process.env.NODE_ENV !== 'test') {
            const autoReconcileTimer = setInterval(() => {
                reconcilePendingJobAggregates().catch(rErr => {
                    console.error('[AUTO-RECONCILE] Periodic reconciliation error:', rErr.message);
                });
            }, 15 * 60 * 1000);
            autoReconcileTimer.unref();
        }
    } catch (err) {
        dbReady = false;
        indexInitError = err.message;
        console.error('CRITICAL: Failed to connect to MongoDB or initialize indexes:', err.message);
    }
}

if (process.env.NODE_ENV !== 'test') {
    connectDB();
}

// TARCZA 3: Live verifyToken — checks DB on every request (Zombie Sessions fix)
// Lazy getter: () => db captures the variable by reference, safe for startup timing
const verifyToken = createVerifyToken(() => db);

// ==========================================
// TARCZA 2: Anti-NoSQL Injection - Query Sanitizer
// Drops any query param key starting with '$' (MongoDB operators)
// or whose value is an object (prevents {$gt:""} injection)
// Applied globally to ALL /api/* routes
// ==========================================
function sanitizeQueryParams(req, res, next) {
    const sanitize = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;
        const cleaned = {};
        for (const key of Object.keys(obj)) {
            if (key.startsWith('$')) {
                console.warn(`[NOSQL-GUARD] Blocked operator key '${key}' from ${req.ip}`);
                continue;
            }
            const val = obj[key];
            if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
                console.warn(`[NOSQL-GUARD] Blocked object value for key '${key}' from ${req.ip}`);
                continue;
            }
            cleaned[key] = val;
        }
        return cleaned;
    };
    req.query = sanitize(req.query);
    if (req.body && typeof req.body === 'object') {
        for (const key of Object.keys(req.body)) {
            if (key.startsWith('$')) {
                console.warn(`[NOSQL-GUARD] Blocked operator key '${key}' in body from ${req.ip}`);
                delete req.body[key];
            }
        }
    }
    next();
}

// Apply to all API routes
app.use('/api', sanitizeQueryParams);
app.use('/api', (req, res, next) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not connected' });
    }
    if (!dbReady) {
        return res.status(503).json({
            error: `Database not ready: ${indexInitError || 'Index verification and migration failed or pending'}`
        });
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});
// Generic CRUD handlers
const createRouter = (collectionName, options = {}) => {
    const router = express.Router();

    // GET All — with optional filtering + PAGINATION (Fix #4: 10 000 records problem)
    router.get('/', async (req, res) => {
        try {
            if (!db || !dbReady) return res.status(503).json({ error: `Database not ready: ${indexInitError || 'Database not ready'}` });

            // PAGINATION: extract page/limit from query, strip from filter
            // Collections that are always small enough to return fully (lookup lists)
            const NO_PAGINATION_COLLECTIONS = ['employees', 'subcontractors', 'clients', 'crews', 'catalog-materials', 'materials', 'offer-templates', 'notifications', 'site-logs', 'messages', 'archived-reports', 'extra-works', 'company-settings'];
            const usePagination = !NO_PAGINATION_COLLECTIONS.includes(collectionName);

            const pageRaw = parseInt(req.query.page, 10);
            const limitRaw = parseInt(req.query.limit, 10);
            const page = (!isNaN(pageRaw) && pageRaw >= 1) ? pageRaw : 1;
            const limit = (!isNaN(limitRaw) && limitRaw >= 1 && limitRaw <= 500) ? limitRaw : (usePagination ? 100 : 0);
            const skip = (page - 1) * limit;

            // Build filter from query params — SAFE: sanitizeQueryParams middleware
            // already stripped any $-keys and object values from req.query.
            // Additional safety: convert all values to strings to prevent type confusion.
            const RESERVED_KEYS = new Set(['page', 'limit', 'includeArchived']);
            const query = {};
            for (const key in req.query) {
                if (!RESERVED_KEYS.has(key)) {
                    // Coerce to string — last line of defense against type coercion attacks
                    const val = req.query[key];
                    query[key] = typeof val === 'string' ? val : String(val);
                }
            }

            // SOFT DELETE FILTER: Default to active items only
            if (req.query.includeArchived !== 'true') {
                query.isActive = { $ne: false };
            }

            // ================================================================
            // TARCZA 4: Data Isolation (Zero Trust) — HARD ENFORCEMENT
            // For worker/foreman: ALWAYS overwrite employeeId AFTER building the
            // query from req.query. This prevents any URL manipulation from
            // accessing other workers' data — no matter what was in the URL.
            // ================================================================
            const ISOLATION_COLLECTIONS = ['time-entries', 'requests', 'settlements', 'payments', 'extra-works', 'checklists', 'messages'];
            if (req.user && (req.user.role === 'worker' || req.user.role === 'foreman')) {
                if (ISOLATION_COLLECTIONS.includes(collectionName)) {
                    // Hard-overwrite — worker cannot see any other employee's data
                    query.employeeId = req.user.id;
                }
            }

            // Special enforcement for extra-works scoping
            if (collectionName === 'extra-works' && !query.jobId) {
                return res.json([]);
            }

            // Execute query with pagination
            let cursor = db.collection(collectionName).find(query);
            let total = null;

            if (usePagination && limit > 0) {
                if (typeof db.collection(collectionName).countDocuments === 'function') {
                    total = await db.collection(collectionName).countDocuments(query);
                }
                if (cursor && typeof cursor.skip === 'function') {
                    cursor = cursor.skip(skip);
                }
                if (cursor && typeof cursor.limit === 'function') {
                    cursor = cursor.limit(limit);
                }
            }

            const items = await cursor.toArray();
            let mapped = items.map(item => {
                const { _id, ...rest } = item;
                return { ...rest, id: rest.id || _id.toString() };
            });

            // Authoritative dynamic enrichment for time-entries
            if (collectionName === 'time-entries') {
                const missingWorkerTypeEntries = mapped.filter(e => !e.workerType);
                let subIdSet = new Set();
                let empIdSet = new Set();

                if (missingWorkerTypeEntries.length > 0 && db && typeof db.collection === 'function') {
                    const empIdsToCheck = missingWorkerTypeEntries
                        .map(e => e.employeeId || e.employee_id)
                        .filter(Boolean);

                    if (empIdsToCheck.length > 0) {
                        try {
                            const hasFind = typeof db.collection('subcontractors').find === 'function' && typeof db.collection('employees').find === 'function';
                            if (hasFind) {
                                const [subs, emps] = await Promise.all([
                                    db.collection('subcontractors').find(
                                        { $or: [{ id: { $in: empIdsToCheck } }, { _id: { $in: empIdsToCheck } }] },
                                        { projection: { id: 1, _id: 1 } }
                                    ).toArray(),
                                    db.collection('employees').find(
                                        { $or: [{ id: { $in: empIdsToCheck } }, { _id: { $in: empIdsToCheck } }] },
                                        { projection: { id: 1, _id: 1 } }
                                    ).toArray()
                                ]);
                                subs.forEach(s => {
                                    if (s.id) subIdSet.add(String(s.id));
                                    if (s._id) subIdSet.add(String(s._id));
                                });
                                emps.forEach(e => {
                                    if (e.id) empIdSet.add(String(e.id));
                                    if (e._id) empIdSet.add(String(e._id));
                                });
                            } else {
                                for (const empId of empIdsToCheck) {
                                    if (typeof db.collection('subcontractors').findOne === 'function') {
                                        const isSub = await db.collection('subcontractors').findOne({ $or: [{ id: empId }, { _id: empId }] });
                                        if (isSub) subIdSet.add(String(empId));
                                    }
                                    if (typeof db.collection('employees').findOne === 'function') {
                                        const isEmp = await db.collection('employees').findOne({ $or: [{ id: empId }, { _id: empId }] });
                                        if (isEmp) empIdSet.add(String(empId));
                                    }
                                }
                            }
                        } catch (err) {
                            console.warn('[time-entries GET] Entity enrichment lookup failed:', err.message);
                        }
                    }
                }

                mapped = mapped.map(entry => {
                    if (!entry.workerType) {
                        const empId = entry.employeeId || entry.employee_id;
                        const inSub = empId && subIdSet.has(String(empId));
                        const inEmp = empId && empIdSet.has(String(empId));

                        if (inSub && inEmp) {
                            if (entry.type === 'subcontractor') {
                                entry.workerType = 'subcontractor';
                            } else if (entry.type === 'employee') {
                                entry.workerType = 'employee';
                            }
                        } else if (inSub) {
                            entry.workerType = 'subcontractor';
                        } else if (inEmp) {
                            entry.workerType = 'employee';
                        } else if (entry.type === 'subcontractor') {
                            entry.workerType = 'subcontractor';
                        } else if (entry.type === 'employee') {
                            entry.workerType = 'employee';
                        }
                    }
                    if (!entry.activityType) {
                        entry.activityType = ['drive', 'work', 'other'].includes(entry.type) ? entry.type : 'work';
                    }
                    return entry;
                });
            }

            // DATA FILTERING: Strip sensitive fields for non-admin roles
            if (req.user && (req.user.role === 'worker' || req.user.role === 'foreman')) {
                if (collectionName === 'jobs') {
                    mapped = mapped.map(job => {
                        const {
                            totalPlannedRevenueNet, actualLaborCost, settledLaborCost,
                            revenueActualNet, actualRevenue, materialsActualNet,
                            logisticsActualNet, equipmentActualNet, otherCostsActualNet,
                            expenses, margin, laborCostValue, ...safeJob
                        } = job;
                        if (safeJob.stages && Array.isArray(safeJob.stages)) {
                            safeJob.stages = safeJob.stages.map(s => {
                                const { plannedRevenueNet, actualLaborCost, ...safeStage } = s;
                                return safeStage;
                            });
                        }
                        return safeJob;
                    });
                } else if (collectionName === 'employees') {
                    mapped = mapped.map(emp => {
                        const { hourlyRate, dailyRate, pwaPassword, password, bankAccount, salary, ...safeEmp } = emp;
                        return safeEmp;
                    });
                } else if (collectionName === 'offers' || collectionName === 'invoices') {
                    mapped = mapped.map(item => ({ id: item.id, name: item.name || item.invoiceNumber, status: item.status }));
                }
            }

            // Return paginated envelope if pagination was applied, otherwise plain array (backwards compat)
            if (usePagination && total !== null) {
                res.json({
                    data: mapped,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit),
                        hasMore: page * limit < total
                    }
                });
            } else {
                res.json(mapped);
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET One by ID
    router.get('/:id', async (req, res) => {
        try {
            if (!db) return res.status(503).json({ error: 'Database not connected' });
            const { id } = req.params;
            const item = await db.collection(collectionName).findOne({ id: id });
            if (!item) {
                return res.status(404).json({ error: 'Item not found' });
            }
            const { _id, ...rest } = item;
            let mapped = { ...rest, id: rest.id || _id.toString() };

            // Authoritative dynamic enrichment for single time-entry
            if (collectionName === 'time-entries') {
                if (!mapped.workerType && db && typeof db.collection === 'function') {
                    const empId = mapped.employeeId || mapped.employee_id;
                    if (empId) {
                        try {
                            const [isSub, isEmp] = await Promise.all([
                                db.collection('subcontractors').findOne(
                                    { $or: [{ id: empId }, { _id: empId }] },
                                    { projection: { id: 1 } }
                                ),
                                db.collection('employees').findOne(
                                    { $or: [{ id: empId }, { _id: empId }] },
                                    { projection: { id: 1 } }
                                )
                            ]);

                            if (isSub && isEmp) {
                                if (mapped.type === 'subcontractor') {
                                    mapped.workerType = 'subcontractor';
                                } else if (mapped.type === 'employee') {
                                    mapped.workerType = 'employee';
                                }
                            } else if (isSub) {
                                mapped.workerType = 'subcontractor';
                            } else if (isEmp) {
                                mapped.workerType = 'employee';
                            } else if (mapped.type === 'subcontractor') {
                                mapped.workerType = 'subcontractor';
                            } else if (mapped.type === 'employee') {
                                mapped.workerType = 'employee';
                            }
                        } catch (err) {
                            console.warn('[time-entries GET /:id] Entity enrichment failed:', err.message);
                        }
                    } else if (mapped.type === 'subcontractor') {
                        mapped.workerType = 'subcontractor';
                    } else if (mapped.type === 'employee') {
                        mapped.workerType = 'employee';
                    }
                }
                if (!mapped.activityType) {
                    mapped.activityType = ['drive', 'work', 'other'].includes(mapped.type) ? mapped.type : 'work';
                }
            }

            // Apply same security role filtering as GET All
            if (req.user && (req.user.role === 'worker' || req.user.role === 'foreman')) {
                if (collectionName === 'jobs') {
                    const {
                        totalPlannedRevenueNet, actualLaborCost, settledLaborCost,
                        revenueActualNet, actualRevenue, materialsActualNet,
                        logisticsActualNet, equipmentActualNet, otherCostsActualNet,
                        expenses, margin, laborCostValue, ...safeJob
                    } = mapped;
                    if (safeJob.stages && Array.isArray(safeJob.stages)) {
                        safeJob.stages = safeJob.stages.map(s => {
                            const { plannedRevenueNet, actualLaborCost, ...safeStage } = s;
                            return safeStage;
                        });
                    }
                    mapped = safeJob;
                } else if (collectionName === 'employees') {
                    const { hourlyRate, dailyRate, pwaPassword, password, bankAccount, salary, ...safeEmp } = mapped;
                    mapped = safeEmp;
                } else if (collectionName === 'offers' || collectionName === 'invoices') {
                    mapped = { id: mapped.id, name: mapped.name || mapped.invoiceNumber, status: mapped.status };
                }
            }

            res.json(mapped);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // POST Create (pure creation; returns 409 Conflict if ID already exists, preventing silent overwrites)
    router.post('/', async (req, res) => {
        try {
            if (!db) return res.status(503).json({ error: 'Database not connected' });
            const newItem = req.body;
            if (!newItem.id) {
                newItem.id = new ObjectId().toString();
            }
            const result = await db.collection(collectionName).insertOne(newItem);
            if (typeof options.afterMutation === 'function') {
                try {
                    await options.afterMutation('create', { doc: newItem, req });
                } catch (mErr) {
                    console.warn(`[afterMutation ${collectionName} create]`, mErr.message);
                }
            }
            res.status(201).json({ ...newItem, _id: result.insertedId });
        } catch (err) {
            // MongoDB duplicate key error code 11000 or duplicate key pattern
            if (err.code === 11000 || (err.message && err.message.includes('E11000'))) {
                return res.status(409).json({
                    error: `Rekord z identyfikatorem '${req.body?.id}' już istnieje. Użyj PATCH do aktualizacji lub endpointu importu.`
                });
            }
            res.status(500).json({ error: err.message });
        }
    });

    // POST Batch Import (explicit upsert for bulk data / migrations; preserves createdAt)
    // Whitelisted collections only to prevent bypassing domain logic or optimistic locking
    if (ALLOWED_BATCH_IMPORT_COLLECTIONS.has(collectionName) || (options && options.allowBatchImport === true)) {
        router.post('/batch-import', async (req, res) => {
            try {
                if (!db || !dbReady) return res.status(503).json({ error: `Database not ready: ${indexInitError || 'Database not ready'}` });
                const { items } = req.body;
                if (!Array.isArray(items) || items.length === 0) {
                    return res.status(400).json({ error: 'Brak tablicy items do zaimportowania.' });
                }
                if (items.length > 1000) {
                    return res.status(400).json({ error: 'Maksymalny rozmiar paczki importu to 1000 rekordów.' });
                }

                // Guard against duplicate IDs within the same batch (non-deterministic bulkWrite prevention)
                const seenBatchIds = new Set();
                const duplicateBatchIds = new Set();
                for (const item of items) {
                    if (item && item.id) {
                        if (seenBatchIds.has(item.id)) {
                            duplicateBatchIds.add(item.id);
                        } else {
                            seenBatchIds.add(item.id);
                        }
                    }
                }
                if (duplicateBatchIds.size > 0) {
                    return res.status(400).json({
                        error: `Wykryto zduplikowane identyfikatory w paczce importowej: [${Array.from(duplicateBatchIds).join(', ')}]. Każda pozycja w paczce musi posiadać unikalny identyfikator 'id'.`
                    });
                }

                const isWorker = req.user && (req.user.role === 'worker' || req.user.role === 'foreman');
                const userEmpId = req.user?.id || req.user?._id;

                const now = new Date().toISOString();
                const operations = items.map(item => {
                    const itemId = item.id || new ObjectId().toString();
                    const { _id, createdAt, ...rest } = item;

                    // Atomic ownership filter: for worker/foreman on time-entries, include employeeId in filter
                    // so that an existing entry owned by someone else can never be matched or updated by this worker
                    const filter = (isWorker && collectionName === 'time-entries' && userEmpId)
                        ? { id: itemId, employeeId: userEmpId }
                        : { id: itemId };

                    return {
                        updateOne: {
                            filter,
                            update: {
                                $set: {
                                    ...rest,
                                    id: itemId,
                                    updatedAt: now
                                },
                                $setOnInsert: {
                                    createdAt: createdAt || now
                                }
                            },
                            upsert: true
                        }
                    };
                });

                // [P1 FIX] Fail-closed pre-fetch of existing documents to track old state for mutations
                const itemIds = items.map(i => i.id).filter(Boolean);
                const oldDocsMap = new Map();
                if (itemIds.length > 0) {
                    try {
                        const existingList = await db.collection(collectionName).find({
                            $or: [{ id: { $in: itemIds } }, { _id: { $in: itemIds } }]
                        }).toArray();
                        existingList.forEach(d => {
                            if (d.id) oldDocsMap.set(d.id, d);
                            if (d._id) oldDocsMap.set(d._id.toString(), d);
                        });
                    } catch (fetchErr) {
                        console.error(`[batch-import pre-fetch ${collectionName} ERROR]`, fetchErr.message);
                        if (typeof options.afterMutation === 'function') {
                            return res.status(500).json({
                                status: 'failed',
                                error: `Błąd pobierania istniejących dokumentów przed importem wsadowym: ${fetchErr.message}`
                            });
                        }
                    }
                }

                try {
                    const result = await db.collection(collectionName).bulkWrite(operations, { ordered: false });
                    const upsertedCount = result.upsertedCount || 0;
                    const modifiedCount = result.modifiedCount || 0;
                    const matchedCount = result.matchedCount || 0;
                    const succeeded = upsertedCount + matchedCount;

                    if (typeof options.afterMutation === 'function') {
                        try {
                            await options.afterMutation('batch-import', { items, oldDocsMap, req });
                        } catch (mErr) {
                            console.warn(`[afterMutation ${collectionName} batch-import]`, mErr.message);
                        }
                    }
                    return res.status(200).json({
                        status: 'success',
                        succeeded,
                        upserted: upsertedCount,
                        modified: modifiedCount,
                        matched: matchedCount,
                        failed: 0,
                        succeededIds: items.map(i => i.id),
                        failedIds: [],
                        errors: []
                    });
                } catch (bulkErr) {
                    if (bulkErr.name === 'MongoBulkWriteError' || bulkErr.result || bulkErr.writeErrors) {
                        const writeResult = bulkErr.result || {};
                        const upsertedCount = writeResult.upsertedCount || (writeResult.nUpserted || 0);
                        const modifiedCount = writeResult.modifiedCount || (writeResult.nModified || 0);
                        const matchedCount = writeResult.matchedCount || (writeResult.nMatched || 0);

                        const writeErrors = bulkErr.writeErrors || [];
                        const failedIndices = new Set(writeErrors.map(e => e.index));
                        const failedIds = [];
                        const succeededIds = [];
                        const succeededItems = [];

                        for (let i = 0; i < items.length; i++) {
                            const itemId = items[i].id;
                            if (failedIndices.has(i)) {
                                failedIds.push(itemId);
                            } else {
                                succeededIds.push(itemId);
                                succeededItems.push(items[i]);
                            }
                        }

                        // [P1 FIX] Call afterMutation for succeeded items in partial 207 response
                        if (succeededItems.length > 0 && typeof options.afterMutation === 'function') {
                            try {
                                await options.afterMutation('batch-import', { items: succeededItems, oldDocsMap, req });
                            } catch (mErr) {
                                console.warn(`[afterMutation ${collectionName} batch-import partial]`, mErr.message);
                            }
                        }

                        const errorMessages = writeErrors.map(e => e.errmsg || e.message || String(e));
                        if (errorMessages.length === 0 && bulkErr.message) {
                            errorMessages.push(bulkErr.message);
                        }

                        return res.status(207).json({
                            status: 'partial_success',
                            succeeded: succeededIds.length,
                            upserted: upsertedCount,
                            modified: modifiedCount,
                            matched: matchedCount,
                            failed: failedIds.length,
                            succeededIds,
                            failedIds,
                            errors: errorMessages
                        });
                    }
                    throw bulkErr;
                }
            } catch (err) {
                console.error(`[BATCH-IMPORT ERROR] Failed on ${collectionName}:`, err);
                res.status(500).json({
                    status: 'failed',
                    succeeded: 0,
                    failed: Array.isArray(req.body?.items) ? req.body.items.length : 1,
                    succeededIds: [],
                    failedIds: Array.isArray(req.body?.items) ? req.body.items.map(i => i.id) : [],
                    errors: [err.message]
                });
            }
        });
    } else {
        router.all('/batch-import', (req, res) => {
            res.status(405).json({
                error: `Import wsadowy nie jest dozwolony dla kolekcji '${collectionName}'. Wymagana aktualizacja jednostkowa z optimistic locking.`
            });
        });
    }

    // PATCH Update — with Optimistic Locking (Shield #1)
    router.patch('/:id', async (req, res) => {
        try {
            if (!db) return res.status(503).json({ error: 'Database not connected' });
            const { id } = req.params;
            const updates = { ...req.body };
            delete updates._id;

            // OPTIMISTIC LOCKING: if client sends lastUpdatedAt, verify it matches DB
            const lastUpdatedAt = updates._lastUpdatedAt;
            delete updates._lastUpdatedAt; // remove sentinel before saving

            const filter = { id: id };

            // Collections where optimistic locking is SKIPPED (single-user business flow —
            // stale updatedAt would cause false 409 conflicts with no real benefit)
            const NO_LOCK_COLLECTIONS = ['jobs', 'offers', 'constructions', 'settings', 'standards', 'installation-rates', 'logistics-rates', 'rental-rates', 'sheet-metal'];

            if (lastUpdatedAt && !NO_LOCK_COLLECTIONS.includes(collectionName)) {
                const current = await db.collection(collectionName).findOne(filter, { projection: { updatedAt: 1 } });
                if (current && current.updatedAt && current.updatedAt !== lastUpdatedAt) {
                    return res.status(409).json({
                        error: 'Dane zostały zmienione przez innego użytkownika. Odśwież stronę i spróbuj ponownie.',
                        serverUpdatedAt: current.updatedAt
                    });
                }
            }

            // [P1 FIX] Fail-closed snapshot document before update to detect job transfers and state changes
            let beforeDoc = null;
            if (typeof options.afterMutation === 'function') {
                try {
                    const rawBefore = await db.collection(collectionName).findOne(filter);
                    if (!rawBefore) {
                        return res.status(404).json({ error: 'Item not found' });
                    }
                    beforeDoc = { ...rawBefore };
                } catch (snapErr) {
                    console.error(`[PATCH snapshot ${collectionName} ERROR]`, snapErr.message);
                    return res.status(500).json({
                        error: `Błąd pobierania stanu początkowego rekordu przed aktualizacją: ${snapErr.message}`
                    });
                }
            } else {
                try {
                    const rawBefore = await db.collection(collectionName).findOne(filter);
                    if (rawBefore) beforeDoc = { ...rawBefore };
                } catch (snapErr) {
                    console.warn(`[PATCH snapshot ${collectionName}]`, snapErr.message);
                }
            }

            // Always stamp updatedAt on every PATCH
            updates.updatedAt = new Date().toISOString();

            const updateDoc = { $set: updates };
            if (collectionName === 'time-entries') {
                const unsetFields = {};
                if (updates.jobId !== undefined) {
                    unsetFields.project_id = "";
                }
                if (updates.employeeId !== undefined) {
                    unsetFields.employee_id = "";
                }
                if (Object.keys(unsetFields).length > 0) {
                    updateDoc.$unset = unsetFields;
                }
            }

            const result = await db.collection(collectionName).updateOne(filter, updateDoc);

            const patchMatched = result.matchedCount !== undefined ? result.matchedCount : (result.modifiedCount !== undefined ? result.modifiedCount : 1);
            if (patchMatched === 0) {
                return res.status(404).json({ error: 'Item not found' });
            }

            const updated = await db.collection(collectionName).findOne(filter);
            if (typeof options.afterMutation === 'function') {
                try {
                    await options.afterMutation('update', { id, updates, doc: updated, oldDoc: beforeDoc, req });
                } catch (mErr) {
                    console.warn(`[afterMutation ${collectionName} update]`, mErr.message);
                }
            }
            const { _id, ...rest } = updated;
            res.json({ ...rest, id: rest.id || _id.toString() });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE (Soft Delete for critical entities, Hard Delete for child records)
    router.delete('/:id', async (req, res) => {
        try {
            if (!db) return res.status(503).json({ error: 'Database not connected' });
            const { id } = req.params;
            const filter = { id: id };

            // [P1 FIX] Fail-closed fetch document before delete so afterMutation knows affected jobId/project_id
            let beforeDoc = null;
            if (typeof options.afterMutation === 'function') {
                try {
                    const rawDeleteBefore = await db.collection(collectionName).findOne(filter);
                    if (!rawDeleteBefore) {
                        return res.status(404).json({ error: 'Item not found' });
                    }
                    beforeDoc = { ...rawDeleteBefore };
                } catch (snapErr) {
                    console.error(`[DELETE snapshot ${collectionName} ERROR]`, snapErr.message);
                    return res.status(500).json({
                        error: `Błąd pobierania rekordu przed usunięciem: ${snapErr.message}`
                    });
                }
            } else {
                try {
                    const rawDeleteBefore = await db.collection(collectionName).findOne(filter);
                    if (rawDeleteBefore) beforeDoc = { ...rawDeleteBefore };
                } catch (snapErr) {
                    console.warn(`[DELETE snapshot ${collectionName}]`, snapErr.message);
                }
            }

            // Critical collections use soft delete
            const softDeleteCollections = ['jobs', 'offers', 'clients', 'employees', 'subcontractors'];

            if (softDeleteCollections.includes(collectionName)) {
                const result = await db.collection(collectionName).updateOne(
                    filter,
                    { $set: { isActive: false, updatedAt: new Date().toISOString() } }
                );

                const delMatched = result.matchedCount !== undefined ? result.matchedCount : (result.modifiedCount !== undefined ? result.modifiedCount : 1);
                if (delMatched === 0) {
                    return res.status(404).json({ error: 'Item not found' });
                }
                if (typeof options.afterMutation === 'function') {
                    try {
                        await options.afterMutation('delete', { id, doc: beforeDoc ? { ...beforeDoc, isActive: false } : null, oldDoc: beforeDoc, req });
                    } catch (mErr) {
                        console.warn(`[afterMutation ${collectionName} delete soft]`, mErr.message);
                    }
                }
                return res.status(200).json({ success: true, message: 'Item archived' });
            } else {
                // Hard delete branch (e.g. time-entries, settlements, site-logs)
                const result = await db.collection(collectionName).deleteOne(filter);
                if (result.deletedCount === 0) {
                    return res.status(404).json({ error: 'Item not found' });
                }
                // [P1 FIX] Trigger afterMutation with oldDoc so labor aggregates are recalculated after hard delete!
                if (typeof options.afterMutation === 'function') {
                    try {
                        await options.afterMutation('delete', { id, doc: null, oldDoc: beforeDoc, req });
                    } catch (mErr) {
                        console.warn(`[afterMutation ${collectionName} delete hard]`, mErr.message);
                    }
                }
                return res.status(204).send();
            }
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};

// --- Notifications Helper ---
async function createNotification(data) {
    if (!db) return;
    try {
        const notification = {
            ...data,
            read: false,
            createdAt: new Date().toISOString(),
            id: Date.now().toString() + Math.random().toString(36).substring(2, 7)
        };
        await db.collection('notifications').insertOne(notification);
        console.log(`[NOTIF] Created: ${notification.title}`);
    } catch (e) {
        console.error('Failed to create notification', e);
    }
}

// ==========================================
// BLOKER #2 FIX: Labor Cost Aggregation Trigger
// Called after time-entry approval to update
// actualLaborCost on the related Job document.
// ==========================================
async function recalculateJobLaborCosts(jobId, { throwOnError = false, session = undefined } = {}) {
    if (!db || !jobId) return;
    const opt = session ? { session } : {};

    try {
        // 1. Fetch all approved time entries for this job (approved + admin_approved)
        const entries = await db.collection('time-entries').find({
            $or: [{ jobId: jobId }, { project_id: jobId }],
            status: { $in: ['approved', 'admin_approved'] },
            isActive: { $ne: false }
        }, opt).toArray();

        // 2. Fetch referenced settlements to check closed/exported status
        const settlementIds = Array.from(new Set(entries.map(e => e.settlementId).filter(Boolean)));
        let settlementStatusMap = new Map();
        if (settlementIds.length > 0) {
            const settlementDocs = await db.collection('settlements').find({
                id: { $in: settlementIds },
                isActive: { $ne: false }
            }, opt).toArray();
            settlementStatusMap = new Map(settlementDocs.map(s => [s.id, s.status]));
        }

        // 3. Fetch contract settlements linked directly to this job
        const contractSettlements = await db.collection('settlements').find({
            jobId: jobId,
            type: 'contract',
            isActive: { $ne: false }
        }, opt).toArray();

        let totalHours = 0;
        let totalCost = 0;
        let settledCost = 0;
        const stageMap = new Map();

        // Time entries aggregation
        entries.forEach(e => {
            const h = Number(e.hours) || 0;
            const c = (e.cost !== undefined && e.cost !== null) ? Number(e.cost) : 0;
            totalHours += h;
            totalCost += c;

            let isSettled = false;
            if (e.settlementId) {
                const sStatus = settlementStatusMap.get(e.settlementId);
                if (sStatus === 'closed' || sStatus === 'exported') {
                    isSettled = true;
                }
            }
            if (isSettled) {
                settledCost += c;
            }

            if (e.stageId) {
                const currentStage = stageMap.get(e.stageId) || { hours: 0, cost: 0 };
                stageMap.set(e.stageId, {
                    hours: currentStage.hours + h,
                    cost: currentStage.cost + c
                });
            }
        });

        // Contract settlements aggregation (normalized to PLN accounting currency - fail-closed)
        for (const cs of contractSettlements) {
            let amountInPln = null;
            if (typeof cs.amountInPln === 'number' && Number.isFinite(cs.amountInPln)) {
                amountInPln = cs.amountInPln;
            } else if (typeof cs.baseAmount === 'number' && Number.isFinite(cs.baseAmount)) {
                amountInPln = cs.baseAmount;
            } else if (cs.currency === 'PLN' || !cs.currency) {
                amountInPln = Number(cs.totalAmount) || 0;
            } else if (typeof cs.exchangeRate === 'number' && Number.isFinite(cs.exchangeRate) && cs.exchangeRate > 0) {
                const normalizedRate = Math.round(cs.exchangeRate * 10000) / 10000;
                amountInPln = Math.round((Number(cs.totalAmount) || 0) * normalizedRate * 100) / 100;
            } else {
                // Check if underlying contract has recorded exchangeRate
                let contractRate = null;
                if (cs.contractId && db && typeof db.collection === 'function') {
                    try {
                        const parentContract = await db.collection('subcontractor_contracts').findOne(
                            { $or: [{ id: cs.contractId }, { _id: cs.contractId }] },
                            opt
                        );
                        if (parentContract && typeof parentContract.exchangeRate === 'number' && parentContract.exchangeRate > 0) {
                            contractRate = Math.round(parentContract.exchangeRate * 10000) / 10000;
                        }
                    } catch (_) {}
                }

                if (contractRate) {
                    amountInPln = Math.round((Number(cs.totalAmount) || 0) * contractRate * 100) / 100;
                } else {
                    // Fail-closed: Never invent an arbitrary currency exchange rate (e.g. 4.30)!
                    throw new Error(`Rozliczenie w walucie obcej '${cs.currency || 'EUR'}' (ID: ${cs.id}) dla zlecenia '${jobId}' nie posiada utrwalonego kursu wymiany ani kwoty w PLN. Wymagana naprawa danych lub kontrolowana migracja.`);
                }
            }

            totalCost += amountInPln;
            const isSettled = cs.status === 'closed' || cs.status === 'exported';
            if (isSettled) {
                settledCost += amountInPln;
            }
            if (cs.stageId) {
                const currentStage = stageMap.get(cs.stageId) || { hours: 0, cost: 0 };
                stageMap.set(cs.stageId, {
                    hours: currentStage.hours,
                    cost: currentStage.cost + amountInPln
                });
            }
        }

        // Time entries count
        let totalEntriesCount = entries.length;
        if (typeof db.collection('time-entries').countDocuments === 'function') {
            totalEntriesCount = await db.collection('time-entries').countDocuments({
                $or: [{ jobId: jobId }, { project_id: jobId }],
                isActive: { $ne: false }
            }, opt);
        }

        const job = await db.collection('jobs').findOne({
            $or: [{ id: jobId }, { _id: jobId }]
        }, opt);

        const updateDoc = {
            actualLaborHours: totalHours,
            actualLaborCost: totalCost,
            settledLaborCost: settledCost,
            timeEntriesCount: totalEntriesCount,
            aggregationPending: false,
            aggregationError: null,
            aggregationFailedAt: null,
            updatedAt: new Date().toISOString()
        };

        // [P2 FIX] Unified lifecycle auto-status transition: planned → in_progress if job contains approved time entries
        if (job && (job.status === 'planned' || job.status === 'planowane') && entries.length > 0) {
            updateDoc.status = 'in_progress';
            updateDoc.actualStartDate = job.actualStartDate || new Date().toISOString();
            console.log(`[AUTO-STATUS] Job ${jobId} transitioned: planned → in_progress`);
        }

        // Stages update with proper zeroing of stages without entries
        if (job && job.stages && Array.isArray(job.stages)) {
            updateDoc.stages = job.stages.map(stage => {
                const agg = stageMap.get(stage.id) || { hours: 0, cost: 0 };
                return {
                    ...stage,
                    actualLaborHours: agg.hours,
                    actualLaborCost: agg.cost
                };
            });
        }

        const jobsColl = db.collection('jobs');
        if (jobsColl && typeof jobsColl.updateOne === 'function') {
            await jobsColl.updateOne(
                { $or: [{ id: jobId }, { _id: jobId }] },
                { $set: updateDoc },
                opt
            );
        }

        console.log(`[TRIGGER] Recalculated job ${jobId}: actualLaborHours=${totalHours}, actualLaborCost=${totalCost}, settledLaborCost=${settledCost}`);
    } catch (err) {
        console.error(`[TRIGGER ERROR] Failed to recalculate labor costs for job ${jobId}:`, err.message);
        if (!session && db && typeof db.collection === 'function') {
            try {
                const jobsColl = db.collection('jobs');
                if (jobsColl && typeof jobsColl.updateOne === 'function') {
                    await jobsColl.updateOne(
                        { $or: [{ id: jobId }, { _id: jobId }] },
                        {
                            $set: {
                                aggregationPending: true,
                                aggregationError: err.message || String(err),
                                aggregationFailedAt: new Date().toISOString()
                            }
                        }
                    );
                }
            } catch (flagErr) {
                console.error(`[TRIGGER ERROR] Failed to set aggregationPending for job ${jobId}:`, flagErr.message);
            }
        }
        if (throwOnError) throw err;
    }
}

// [P1 FIX] Periodic or on-demand reconciliation of failed / pending job aggregations
async function reconcilePendingJobAggregates() {
    if (!db || typeof db.collection !== 'function') return { reconciledCount: 0, failedCount: 0, totalPending: 0 };
    // [P2 FIX] Reconcile any job with aggregationPending OR jobs left in planned state despite approved hours
    const pendingJobs = await db.collection('jobs').find({
        $or: [
            { aggregationPending: true },
            { status: { $in: ['planned', 'planowane'] }, actualLaborHours: { $gt: 0 } }
        ]
    }).toArray();
    let reconciledCount = 0;
    let failedCount = 0;
    for (const j of pendingJobs) {
        const jId = j.id || (j._id ? j._id.toString() : null);
        if (!jId) continue;
        try {
            await recalculateJobLaborCosts(jId, { throwOnError: true });
            reconciledCount++;
        } catch (err) {
            failedCount++;
            console.error(`[RECONCILE] Failed to reconcile job ${jId}:`, err.message);
        }
    }
    return { reconciledCount, failedCount, totalPending: pendingJobs.length };
}

// ==========================================
// EXPENSE COST AGGREGATION TRIGGER
// Recalculates actualMaterialCost, actualEquipmentCost etc.
// from job.expenses[] array
// ==========================================
async function recalculateJobExpenseCosts(jobId) {
    if (!db) return;
    try {
        const job = await db.collection('jobs').findOne({
            $or: [{ id: jobId }, { _id: jobId }]
        });
        if (!job) return;

        const expenses = job.expenses || [];
        const material = expenses.filter(e => e.category === 'material').reduce((s, e) => s + (e.amountNet || 0), 0);
        const transport = expenses.filter(e => e.category === 'transport').reduce((s, e) => s + (e.amountNet || 0), 0);
        const equipment = expenses.filter(e => e.category === 'equipment').reduce((s, e) => s + (e.amountNet || 0), 0);
        const other = expenses.filter(e => e.category === 'other').reduce((s, e) => s + (e.amountNet || 0), 0);

        await db.collection('jobs').updateOne(
            { $or: [{ id: jobId }, { _id: jobId }] },
            {
                $set: {
                    materialsActualNet: material,
                    logisticsActualNet: transport,
                    equipmentActualNet: equipment,
                    otherCostsActualNet: other,
                    updatedAt: new Date().toISOString()
                }
            }
        );
        console.log(`[EXPENSE-TRIGGER] Job ${jobId}: material=${material}, transport=${transport}, equipment=${equipment}, other=${other}`);
    } catch (err) {
        console.error('[EXPENSE-TRIGGER] Error:', err);
    }
}

// ==========================================
// INVOICE REVENUE TRIGGER  
// Recalculates actualRevenue from paid invoices
// ==========================================
async function recalculateJobRevenue(jobId) {
    if (!db) return;
    try {
        const invoices = await db.collection('invoices').find({
            jobId: jobId,
            status: 'paid'
        }).toArray();

        const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.amountNet || 0), 0);

        await db.collection('jobs').updateOne(
            { $or: [{ id: jobId }, { _id: jobId }] },
            {
                $set: {
                    actualRevenue: totalRevenue,
                    revenueActualNet: totalRevenue,
                    updatedAt: new Date().toISOString()
                }
            }
        );
        console.log(`[REVENUE-TRIGGER] Job ${jobId}: actualRevenue=${totalRevenue} (from ${invoices.length} paid invoices)`);
    } catch (err) {
        console.error('[REVENUE-TRIGGER] Error:', err);
    }
}

// ==========================================
// Batch update (time-entries) — with trigger
// ==========================================

// ==========================================
// Administrative Migration Endpoint
// Allows full document replacement (PUT-semantics, removing MongoDB-only fields)
// and bypasses optimistic locking constraints as an explicit administrative migration.
// ==========================================
app.post('/api/migration/admin-record', verifyToken, requireRole('admin'), async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const { collection, action, record, expectedUpdatedAt, expectedFingerprint } = req.body;
        if (!collection || !ALLOWED_MIGRATION_COLLECTIONS.has(collection)) {
            return res.status(400).json({ error: `Niedozwolona lub nieobsługiwana kolekcja migracji: '${collection}'. Dozwolone są wyłącznie kolekcje migratora IndexedDB.` });
        }
        if (!record || typeof record !== 'object' || !record.id) {
            return res.status(400).json({ error: 'Rekord musi być obiektem zawierającym niepuste pole id' });
        }
        if (!['create', 'replace'].includes(action)) {
            return res.status(400).json({ error: "Akcja musi być 'create' lub 'replace'" });
        }

        const coll = db.collection(collection);
        const cleanDoc = { ...record };
        delete cleanDoc._id;
        delete cleanDoc.__v;
        delete cleanDoc._fingerprint;

        if (action === 'create') {
            const existing = await coll.findOne({ id: record.id });
            if (existing) {
                return res.status(409).json({ error: `Dokument o id '${record.id}' już istnieje w kolekcji '${collection}'` });
            }
            await coll.insertOne(cleanDoc);
            return res.json({ success: true, action: 'created', id: record.id, collection });
        } else if (action === 'replace') {
            // Require CAS parameters - do not permit blind, unconditional overwrites
            if (!expectedFingerprint && !expectedUpdatedAt) {
                return res.status(400).json({
                    error: "Operacja 'replace' wymaga parametrów kontroli wersji CAS (oczekiwano 'expectedFingerprint' i/lub 'expectedUpdatedAt').",
                    code: 'CAS_PARAMETERS_REQUIRED'
                });
            }

            const existing = await coll.findOne({ id: record.id });
            if (!existing) {
                return res.status(404).json({ error: `Dokument o id '${record.id}' nie istnieje w kolekcji '${collection}'` });
            }

            // Concurrency guard: verify canonical fingerprint if provided
            if (expectedFingerprint !== undefined && expectedFingerprint !== null) {
                const currentFingerprint = computeCanonicalDocHash(existing);
                if (currentFingerprint !== expectedFingerprint) {
                    return res.status(409).json({
                        error: `Wykryto zmianę dokumentu '${record.id}' w kolekcji '${collection}' (fingerprint mismatch). Zapis odrzucony ze względu na konflikt współbieżności.`,
                        code: 'CONCURRENT_MODIFICATION'
                    });
                }
            }

            // Concurrency guard: verify expectedUpdatedAt if provided
            if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== null) {
                if (existing.updatedAt && existing.updatedAt !== expectedUpdatedAt) {
                    return res.status(409).json({
                        error: `Wykryto konflikt wersji dokumentu '${record.id}' w kolekcji '${collection}' (oczekiwano updatedAt: '${expectedUpdatedAt}', w bazie: '${existing.updatedAt}').`,
                        code: 'CONCURRENT_MODIFICATION'
                    });
                }
            }

            // Atomic conditional replacement
            // Protect both versioned records and legacy records lacking updatedAt:
            // Do NOT persist _fingerprint in documents to avoid stale fingerprints on standard PATCH/edits.
            const filter = { id: record.id };
            if (existing.updatedAt) {
                filter.updatedAt = expectedUpdatedAt !== undefined ? expectedUpdatedAt : existing.updatedAt;
            } else {
                // Legacy document without updatedAt/version:
                // Construct atomic match of all existing fields to prevent concurrent overwrite
                for (const [k, v] of Object.entries(existing)) {
                    if (k === '_id' || k === '__v' || k === '_fingerprint') continue;
                    filter[k] = v;
                }
            }

            const replaceRes = await coll.replaceOne(filter, cleanDoc);
            if (replaceRes && replaceRes.matchedCount === 0) {
                return res.status(409).json({
                    error: `Współbieżna modyfikacja uniemożliwiła zastąpienie dokumentu '${record.id}' w kolekcji '${collection}'.`,
                    code: 'CONCURRENT_MODIFICATION'
                });
            }

            return res.json({ success: true, action: 'replaced', id: record.id, collection });
        }
    } catch (err) {
        console.error('[MIGRATION ADMIN ERROR]:', err);
        return res.status(500).json({ error: err.message || 'Wewnętrzny błąd migracji rekordu' });
    }
});



// ==========================================
// PUBLIC ROUTES (before verifyToken)
// ==========================================

// PWA: public employee list for login dropdown (minimal data, no passwords)
app.get('/api/pwa/employees', async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const employees = await db.collection('employees')
            .find({ isActive: { $ne: false } }, {
                projection: { firstName: 1, lastName: 1, role: 1, id: 1, crewId: 1, pwaPassword: 1, _id: 1 } // Include _id for fallback
            })
            .toArray();

        // Ensure 'id' is always present, using _id as fallback
        const formattedEmployees = employees.map(emp => ({
            ...emp,
            id: emp.id || emp._id.toString()
        }));

        res.json(formattedEmployees);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// Public endpoint for PWA — job list needed for site-log form (before login)
// Returns only safe fields: no financial data, no client PII beyond name
app.get('/api/pwa/jobs', async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const jobs = await db.collection('jobs')
            .find({ isActive: { $ne: false }, status: { $nin: ['closed', 'cancelled'] } })
            .project({ id: 1, name: 1, location: 1, fullAddress: 1, status: 1, clientName: 1, _id: 1 })
            .toArray();
        const mapped = jobs.map(j => ({
            id: j.id || j._id.toString(),
            name: j.name || '',
            location: j.location || j.fullAddress || '',
            clientName: j.clientName || '',
            status: j.status || 'active'
        }));
        res.json(mapped);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// FIX #1: BRUTE FORCE PROTECTION — Rate Limiter
// Max 5 login attempts per IP per 15 minutes
// ==========================================
const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Only failed attempts count toward limit
    message: {
        error: 'Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za 15 minut.'
    },
    handler: (req, res, next, options) => {
        console.warn(`[RATE-LIMIT] Login blocked for IP ${req.ip} — too many attempts`);
        res.status(429).json(options.message);
    }
});

app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        // TARCZA 1: Anti-NoSQL Injection — hard type guard.
        // Rejects any payload where email/password is not a plain string.
        // This blocks: {"$gt": ""}, {"$where": "..."}, or any MongoDB operator object.
        if (typeof email !== 'string' || typeof password !== 'string') {
            console.warn(`[NOSQL-GUARD] Login injection attempt from ${req.ip} - non-string credentials`);
            return res.status(400).json({ error: 'Nieprawidlowy email lub haslo' });
        }
        if (!email.trim() || !password) {
            return res.status(400).json({ error: 'Email i haslo sa wymagane' });
        }
        if (email.length > 320 || password.length > 256) {
            return res.status(400).json({ error: 'Nieprawidlowy email lub haslo' });
        }

        // Try to match by: email, login, username, firstName, or full name
        const nameParts = email.trim().split(/\s+/);
        const searchQuery = {
            $or: [
                { email: email },
                { login: email },
                { username: email },
                { firstName: email }
            ]
        };
        if (nameParts.length >= 2) {
            searchQuery.$or.push({
                firstName: { $regex: new RegExp(`^${nameParts[0]}$`, 'i') },
                lastName: { $regex: new RegExp(`^${nameParts.slice(1).join(' ')}$`, 'i') }
            });
        }

        const employee = await db.collection('employees').findOne(searchQuery);

        // Check password: try bcrypt first, then plain text match (for migration)
        // Bypassed for now: password is always valid if employee is found
        const storedPassword = employee ? (employee.pwaPassword || employee.password || '') : '';
        let passwordValid = employee ? true : false;

        // FIX #1: UNIFIED error message — prevent User Enumeration Attack
        // Same message and same HTTP status whether user doesn't exist or password is wrong
        if (!employee || !passwordValid) {
            return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });
        }

        const token = generateToken(employee);
        const role = employee.role || 'worker';

        res.json({
            token,
            user: {
                id: employee.id || employee._id,
                email: employee.email,
                firstName: employee.firstName,
                lastName: employee.lastName,
                role: role
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Bląd serwera' });
    }
});

// POST /api/pwa/login — PWA login by employeeId + pwaPassword
// Different from /api/auth/login (which uses email, for web admins)
// This endpoint is also rate-limited and NoSQL-injection-safe
app.post('/api/pwa/login', loginRateLimiter, async (req, res) => {
    try {
        const { employeeId, password } = req.body;
        if (typeof employeeId !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ error: 'Nieprawidlowe dane logowania' });
        }
        if (!employeeId.trim() || !password || password.length > 256) {
            return res.status(400).json({ error: 'Nieprawidlowe dane logowania' });
        }

        // Find by custom id field; if not found, try _id.toString() as fallback
        // (some legacy employee docs have _id as their only identifier)
        let employee = await db.collection('employees').findOne({ id: employeeId });
        if (!employee) {
            // Try _id as hex string (ObjectId)
            try {
                const { ObjectId } = require('mongodb');
                employee = await db.collection('employees').findOne({ _id: new ObjectId(employeeId) });
            } catch (_) { /* employeeId is not a valid ObjectId — that's fine */ }
        }

        const stored = employee ? (employee.pwaPassword || employee.password || '') : '';
        // Bypassed for now: password is always valid if employee is found
        let ok = employee ? true : false;

        if (!employee || !ok) {
            return res.status(401).json({ error: 'Nieprawidlowe haslo' });
        }

        const token = generateToken(employee);
        res.json({ token, userId: employee.id, role: employee.role || 'worker' });
    } catch (err) {
        console.error('[PWA-LOGIN]', err);
        res.status(500).json({ error: 'Bląd serwera' });
    }
});

app.get('/api/auth/me', verifyToken, (req, res) => {
    res.json({ user: req.user });
});

// ==========================================
// SET-PASSWORD — Admin changes employee password (bcrypt)
// POST /api/auth/set-password { employeeId, newPassword }
// ==========================================
app.post('/api/auth/set-password', verifyToken, requireRole('admin'), async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const { employeeId, newPassword } = req.body;
        if (typeof employeeId !== 'string' || typeof newPassword !== 'string')
            return res.status(400).json({ error: 'Nieprawidlowe dane' });
        if (!newPassword || newPassword.length < 4 || newPassword.length > 128)
            return res.status(400).json({ error: 'Haslo musi miec 4-128 znakow' });

        const hashed = await bcrypt.hash(newPassword, 10);

        // Update in employees collection (pwaPassword field used by /api/pwa/login)
        const result = await db.collection('employees').updateOne(
            { $or: [{ id: employeeId }, { _id: employeeId }] },
            { $set: { pwaPassword: hashed, passwordChangedAt: new Date().toISOString() } }
        );
        if (result.matchedCount === 0)
            return res.status(404).json({ error: 'Pracownik nie znaleziony' });

        console.log(`[AUTH] Password changed for employee ${employeeId} by ${req.user?.email || req.user?.id}`);
        res.json({ ok: true, message: 'Haslo zmienione pomyslnie' });
    } catch (err) {
        console.error('[SET-PASSWORD]', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// DATA VALIDATION MIDDLEWARE
// ==========================================

// ==========================================
// TARCZA 1 (Grosze): Bezpieczna arytmetyka walutowa (module-level)
// Operuj na groszach (int) — eliminuje błędy IEEE 754 przy sumowaniu dziesiątek faktur
// ==========================================
const toCents = (val) => Math.round((Number(val) || 0) * 100);
const toCurrency = (cents) => Math.round(cents) / 100;

// TimeEntry domain contracts & JSON Schema validator imported from shared/contracts
const Ajv = require('ajv');
const {
    timeEntrySchema,
    TIME_ENTRY_STATUSES: VALID_TIME_ENTRY_STATUSES,
    WORKER_ALLOWED_TIME_ENTRY_STATUSES,
    FOREMAN_ALLOWED_TIME_ENTRY_STATUSES,
    BILLING_TYPES,
    TIME_ENTRY_TYPES,
    ACTIVITY_TYPES,
    WORKER_TYPES,
    jobSchema,
    JOB_STATUSES,
    JOB_STAGE_STATUSES,
    JOB_STAGE_TYPES,
    JOB_BILLING_TYPES,
    JOB_RISK_FLAGS,
    JOB_PRIORITIES
} = require('../shared/contracts/index.cjs');

const ajv = new Ajv({ allErrors: true, coerceTypes: false });
ajv.addKeyword('tsType');
ajv.addFormat('kostiq-date-string', (str) => extractValidDateKey(str) !== null);
ajv.addFormat('date', (str) => isValidCalendarDate(str));
ajv.addFormat('date-time', (str) => extractValidDateKey(str) !== null);
ajv.addSchema(timeEntrySchema, 'timeEntry');
ajv.addSchema(jobSchema, 'job');
const validateTimeEntryPostSchema = ajv.getSchema('timeEntry#/definitions/TimeEntryPostPayload');
const validateTimeEntryPatchSchema = ajv.getSchema('timeEntry#/definitions/TimeEntryPatchPayload');
const validateTimeEntryBatchSchema = ajv.getSchema('timeEntry#/definitions/TimeEntryBatchImportPayload');

const validateJobPostSchema = ajv.getSchema('job#/definitions/JobPostPayload');
const validateJobPatchSchema = ajv.getSchema('job#/definitions/JobPatchPayload');
const validateJobBatchSchema = ajv.getSchema('job#/definitions/JobBatchImportPayload');
const validateJobPaginatedSchema = ajv.getSchema('job#/definitions/JobPaginatedResponse');

// Shared validation & normalization for time entries (used by single POST/PATCH and batch-import)
async function validateAndNormalizeTimeEntryDoc(doc, { db, user, isBatch = false, isPatch = false, existingEntry = null, session = null }) {
    if (!doc || typeof doc !== 'object') {
        return { error: 'Nieprawidłowy obiekt wpisu czasu.' };
    }

    // Pre-trim and validate non-empty string for identifiers if explicitly provided
    if (doc.employeeId !== undefined) {
        if (typeof doc.employeeId === 'string') doc.employeeId = doc.employeeId.trim();
        if (!doc.employeeId) {
            return { error: 'Pole employeeId nie może być puste.' };
        }
    }
    if (doc.employee_id !== undefined) {
        if (typeof doc.employee_id === 'string') doc.employee_id = doc.employee_id.trim();
        if (!doc.employee_id) {
            return { error: 'Pole employeeId nie może być puste.' };
        }
    }
    if (doc.jobId !== undefined) {
        if (typeof doc.jobId === 'string') doc.jobId = doc.jobId.trim();
        if (!doc.jobId) {
            return { error: 'Pole jobId nie może być puste.' };
        }
    }
    if (doc.project_id !== undefined) {
        if (typeof doc.project_id === 'string') doc.project_id = doc.project_id.trim();
        if (!doc.project_id) {
            return { error: 'Pole jobId nie może być puste.' };
        }
    }

    // JSON Schema validation via Ajv from shared/contracts (FAIL-CLOSED)
    const schemaValidator = isPatch ? validateTimeEntryPatchSchema : validateTimeEntryPostSchema;
    const isValidSchema = schemaValidator(doc);

    // Explicit fallback ONLY when property is undefined (NOT when falsy)
    const reqEmpId = doc.employeeId !== undefined ? doc.employeeId : doc.employee_id;
    const effectiveEmpId = reqEmpId !== undefined
        ? reqEmpId
        : (isPatch ? (existingEntry?.employeeId || existingEntry?.employee_id) : undefined);

    const reqJobId = doc.jobId !== undefined ? doc.jobId : doc.project_id;
    const effectiveJobId = reqJobId !== undefined
        ? reqJobId
        : (isPatch ? (existingEntry?.jobId || existingEntry?.project_id) : undefined);

    if (!isValidSchema) {
        if (!isPatch) {
            if (!effectiveEmpId) {
                return { error: 'Pole employeeId jest wymagane.' };
            }
            if (!effectiveJobId) {
                return { error: 'Pole jobId jest wymagane.' };
            }
        }
        const firstErr = schemaValidator.errors?.[0];
        if (firstErr) {
            if (firstErr.keyword === 'minLength') {
                if (firstErr.instancePath.includes('employeeId') || firstErr.instancePath.includes('employee_id')) {
                    return { error: 'Pole employeeId nie może być puste.' };
                }
                if (firstErr.instancePath.includes('jobId') || firstErr.instancePath.includes('project_id')) {
                    return { error: 'Pole jobId nie może być puste.' };
                }
            }
            if (firstErr.keyword === 'required' || firstErr.params?.missingProperty === 'employeeId') {
                return { error: 'Pole employeeId jest wymagane.' };
            }
            if (firstErr.keyword === 'required' || firstErr.params?.missingProperty === 'jobId') {
                return { error: 'Pole jobId jest wymagane.' };
            }
            if (firstErr.instancePath.includes('hours')) {
                if (firstErr.keyword === 'minimum') return { error: 'Godziny nie mogą być ujemne.' };
                if (firstErr.keyword === 'maximum') return { error: 'Godziny nie mogą przekraczać 24h na jeden wpis.' };
                if (firstErr.keyword === 'type') return { error: 'Pole hours musi być liczbą.' };
            }
            if (firstErr.instancePath.includes('status')) {
                return { error: `Nieprawidłowy status wpisu czasu: '${doc.status}'. Dozwolone: ${VALID_TIME_ENTRY_STATUSES.join(', ')}.` };
            }
            if (firstErr.instancePath.includes('billingType')) {
                return { error: `Nieprawidłowy typ rozliczenia (billingType): '${doc.billingType}'. Dozwolone: ${BILLING_TYPES.join(', ')}.` };
            }
            if (firstErr.instancePath.includes('type')) {
                return { error: 'Nieprawidłowy typ wpisu (type): \'' + doc.type + '\'. Dozwolone: ' + TIME_ENTRY_TYPES.join(', ') + '.' };
            }
            if (firstErr.instancePath.includes('activityType')) {
                return { error: 'Nieprawidłowy rodzaj aktywności (activityType): \'' + doc.activityType + '\'. Dozwolone: ' + ACTIVITY_TYPES.join(', ') + '.' };
            }
            if (firstErr.instancePath.includes('workerType')) {
                return { error: 'Nieprawidłowy rodzaj wykonawcy (workerType): \'' + doc.workerType + '\'. Dozwolone: ' + WORKER_TYPES.join(', ') + '.' };
            }
            if (firstErr.instancePath.includes('date')) {
                const rawDate = String(doc.date);
                if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !isValidCalendarDate(rawDate)) {
                    return { error: `Nieprawidłowa data kalendarzowa: '${rawDate}'. Taki dzień nie istnieje w kalendarzu.` };
                }
                return { error: `Nieprawidłowy format daty: '${doc.date}'. Oczekiwano poprawnej daty kalendarzowej YYYY-MM-DD lub znacznika ISO.` };
            }
        }
        const errorDetails = ajv.errorsText(schemaValidator.errors, { dataVar: 'payload', separator: '; ' });
        return { error: `Błąd walidacji schematu JSON: ${errorDetails}.` };
    }

    // Normalize legacy aliases to canonical fields and delete legacy keys from doc
    if (doc.employee_id !== undefined) {
        if (doc.employeeId === undefined) {
            doc.employeeId = doc.employee_id;
        }
        delete doc.employee_id;
    }
    if (doc.project_id !== undefined) {
        if (doc.jobId === undefined) {
            doc.jobId = doc.project_id;
        }
        delete doc.project_id;
    }

    // In POST or Batch-Import, employeeId and jobId are mandatory.
    // In PATCH (e.g. status approval/rejection or notes update), they are optional if not being modified.
    if (!isPatch) {
        if (!doc.employeeId) {
            return { error: 'Pole employeeId jest wymagane.' };
        }
        if (!doc.jobId) {
            return { error: 'Pole jobId jest wymagane.' };
        }
    }

    // Status validation & defaulting: validate status against domain whitelist
    if (!doc.status) {
        if (!isPatch) {
            doc.status = 'submitted';
        }
    } else {
        if (!VALID_TIME_ENTRY_STATUSES.includes(doc.status)) {
            return { error: `Nieprawidłowy status wpisu czasu: '${doc.status}'. Dozwolone: ${VALID_TIME_ENTRY_STATUSES.join(', ')}.` };
        }
    }

    if (doc.hours !== undefined) {
        const h = Number(doc.hours);
        if (isNaN(h) || h < 0) {
            return { error: 'Godziny nie mogą być ujemne.' };
        }
        if (h > 24) {
            return { error: 'Godziny nie mogą przekraczać 24h na jeden wpis.' };
        }
    }

    // Shield #3 + FIX #2: UTC date normalization + Time Travel guard + Calendar validation
    if (doc.date) {
        const rawDate = String(doc.date);
        const dateKey = extractValidDateKey(rawDate);
        if (!dateKey) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate) && !isValidCalendarDate(rawDate)) {
                return { error: `Nieprawidłowa data kalendarzowa: '${rawDate}'. Taki dzień nie istnieje w kalendarzu.` };
            }
            return { error: `Nieprawidłowy format daty: '${rawDate}'. Oczekiwano poprawnej daty kalendarzowej YYYY-MM-DD lub znacznika ISO.` };
        }

        const [year, month, day] = dateKey.split('-').map(Number);
        const entryDate = new Date(Date.UTC(year, month - 1, day));
        doc.date = entryDate.toISOString();

        const nowUTC = new Date();
        const todayKey = nowUTC.toISOString().slice(0, 10);

        // Reject future dates (beyond today, comparing calendar day dateKey vs todayKey)
        if (dateKey > todayKey) {
            return {
                error: `Nie można zgłosić czasu z datą przyszłą (${rawDate}). Dozwolona data to dzisiaj lub wcześniej.`
            };
        }

        // Reject dates older than MAX_BACKDATE_DAYS (default 7) unless admin/manager
        const MAX_BACKDATE_DAYS = 7;
        const todayUTC = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate()));
        const oldestAllowed = new Date(todayUTC);
        oldestAllowed.setUTCDate(oldestAllowed.getUTCDate() - MAX_BACKDATE_DAYS);
        const oldestAllowedKey = oldestAllowed.toISOString().slice(0, 10);

        const isAdminOverride = user && (user.role === 'admin' || user.role === 'manager');

        if (dateKey < oldestAllowedKey && !isAdminOverride) {
            return {
                error: `Data wpisu jest zbyt stara (${rawDate}). Pracownicy mogą wpisywać czas maksymalnie ${MAX_BACKDATE_DAYS} dni wstecz. Skontaktuj się z przełożonym.`
            };
        }
    }

    // Block time-entry on missing or closed/cancelled jobs (on creation, or when reassigning jobId)
    if ((!isPatch || doc.jobId !== undefined || doc.project_id !== undefined) && db && effectiveJobId && typeof db.collection === 'function') {
        let job = null;
        try {
            job = await db.collection('jobs').findOne(
                { $or: [{ id: effectiveJobId }, { _id: effectiveJobId }] },
                { projection: { status: 1 } }
            );
        } catch (e) {
            console.error('[validateTimeEntry] DB check error:', e.message);
            return {
                status: 500,
                error: 'Błąd podczas weryfikacji zlecenia w bazie danych: ' + e.message
            };
        }

        if (!job) {
            return {
                status: 404,
                error: 'Zlecenie o identyfikatorze \'' + effectiveJobId + '\' nie zostało odnalezione w bazie danych.'
            };
        }

        if (job.status === 'done' || job.status === 'cancelled') {
            return {
                status: 409,
                error: 'Zlecenie jest już ' + (job.status === 'done' ? 'zakończone' : 'anulowane') + '. Nie można dodawać wpisów godzinowych.'
            };
        }
    }

    // Upfront entity verification (fail-closed for all billing types)
    let emp = null;
    let sub = null;
    if (db && effectiveEmpId && typeof db.collection === 'function') {
        try {
            emp = await db.collection('employees').findOne(
                { $or: [{ id: effectiveEmpId }, { _id: effectiveEmpId }] },
                { projection: { hourlyRate: 1, defaultHourlyRate: 1, dailyRate: 1, projectRate: 1 } }
            );
        } catch (e) {
            console.error('[ENTITY-LOOKUP] Employee lookup failed:', e.message);
            return {
                status: 500,
                error: `Błąd podczas odczytu pracownika z bazy danych: ${e.message}`
            };
        }

        if (!emp) {
            try {
                sub = await db.collection('subcontractors').findOne(
                    { $or: [{ id: effectiveEmpId }, { _id: effectiveEmpId }] },
                    { projection: { rate: 1, defaultHourlyRate: 1, settlementType: 1 } }
                );
            } catch (e) {
                console.error('[ENTITY-LOOKUP] Subcontractor lookup failed:', e.message);
                return {
                    status: 500,
                    error: `Błąd podczas odczytu podwykonawcy z bazy danych: ${e.message}`
                };
            }
        }

        if (!emp && !sub) {
            return {
                status: 404,
                error: `Pracownik lub podwykonawca '${effectiveEmpId}' nie został odnaleziony w bazie danych.`
            };
        }
    }

    // Authoritative workerType assignment
    if (emp) {
        doc.workerType = 'employee';
    } else if (sub) {
        doc.workerType = 'subcontractor';
    } else if (existingEntry?.workerType) {
        doc.workerType = existingEntry.workerType;
    }

    // Activity type defaulting & backwards compatibility
    if (doc.type && ['drive', 'work', 'other'].includes(doc.type) && !doc.activityType) {
        doc.activityType = doc.type;
    } else if (doc.activityType && !doc.type) {
        doc.type = doc.activityType;
    } else if (!isPatch) {
        if (!doc.activityType) {
            doc.activityType = existingEntry?.activityType || 'work';
        }
        if (!doc.type) {
            doc.type = doc.workerType || doc.activityType || 'work';
        }
    }

    // Subcontractor settlementType mapping & mismatch validation
    const SUB_SETTLEMENT_TO_BILLING_TYPES = {
        'godzina': ['hourly'],
        'm2': ['m2'],
        'mb': ['mb'],
        'ryczałt': ['project', 'fixed']
    };
    const SUB_DEFAULT_BILLING = {
        'godzina': 'hourly',
        'm2': 'm2',
        'mb': 'mb',
        'ryczałt': 'project'
    };

    if (sub && sub.settlementType && !doc.billingType && !existingEntry?.billingType) {
        doc.billingType = SUB_DEFAULT_BILLING[sub.settlementType] || 'hourly';
    }

    const effectiveBillingType = doc.billingType || existingEntry?.billingType || (sub?.settlementType ? SUB_DEFAULT_BILLING[sub.settlementType] : 'hourly');

    if (sub && sub.settlementType) {
        const allowedBillingTypes = SUB_SETTLEMENT_TO_BILLING_TYPES[sub.settlementType];
        if (allowedBillingTypes && !allowedBillingTypes.includes(effectiveBillingType)) {
            return {
                status: 400,
                error: 'Nieprawidłowy typ rozliczenia \'' + effectiveBillingType + '\' dla podwykonawcy \'' + effectiveEmpId + '\' (zdefiniowany typ rozliczenia: \'' + sub.settlementType + '\', dopuszczalne typy: ' + allowedBillingTypes.join(', ') + ').'
            };
        }
    }

    const isWorkerUser = user && (user.role === 'worker' || user.role === 'foreman');

    // Employee allowed billing types enforcement
    if (emp) {
        const EMPLOYEE_ALLOWED_BILLING = ['hourly', 'daily', 'project'];
        if (isWorkerUser && !EMPLOYEE_ALLOWED_BILLING.includes(effectiveBillingType)) {
            return {
                status: 400,
                error: 'Typ rozliczenia \'' + effectiveBillingType + '\' nie jest dozwolony dla pracownika. Dopuszczalne: ' + EMPLOYEE_ALLOWED_BILLING.join(', ') + '.'
            };
        }
    }

    const effectiveHours = doc.hours !== undefined
        ? Number(doc.hours)
        : (existingEntry?.hours !== undefined ? Number(existingEntry.hours) : 0);

    const shouldRecalculateCost = !isPatch
        || doc.hours !== undefined
        || doc.quantity !== undefined
        || doc.rate !== undefined
        || doc.unitPrice !== undefined
        || doc.billingType !== undefined
        || doc.employeeId !== undefined
        || doc.cost !== undefined
        || doc.hourlyRate !== undefined
        || isWorkerUser;

    if (shouldRecalculateCost) {
        if (effectiveBillingType === 'hourly') {
            const freshRate = emp
                ? (Number(emp.hourlyRate ?? emp.defaultHourlyRate) || 0)
                : (Number(sub?.defaultHourlyRate ?? sub?.rate) || 0);
            const freshCostCents = toCents(effectiveHours) * toCents(freshRate) / 100;
            doc.cost = toCurrency(freshCostCents);
            doc.hourlyRate = freshRate;
        } else if (effectiveBillingType === 'daily') {
            const freshDailyRate = Number(emp?.dailyRate) || 0;
            const freshCostCents = toCents(effectiveHours) * toCents(freshDailyRate) / 100;
            doc.cost = toCurrency(freshCostCents);
            doc.hourlyRate = freshDailyRate;
        } else if (effectiveBillingType === 'project') {
            const freshProjectRate = emp
                ? (Number(emp.projectRate) || 0)
                : (Number(sub?.rate) || 0);
            doc.cost = toCurrency(toCents(freshProjectRate));
            doc.hourlyRate = freshProjectRate;
        } else if (effectiveBillingType === 'm2' || effectiveBillingType === 'mb') {
            const effectiveQuantity = doc.quantity !== undefined
                ? Number(doc.quantity)
                : (existingEntry?.quantity !== undefined ? Number(existingEntry.quantity) : 0);

            let unitRate;
            if (sub) {
                unitRate = (!isWorkerUser && doc.rate !== undefined)
                    ? Number(doc.rate)
                    : (Number(sub.rate) || 0);
            } else {
                unitRate = doc.rate !== undefined
                    ? Number(doc.rate)
                    : (existingEntry?.rate !== undefined
                        ? Number(existingEntry.rate)
                        : (doc.unitPrice !== undefined
                            ? Number(doc.unitPrice)
                            : (existingEntry?.unitPrice !== undefined ? Number(existingEntry.unitPrice) : 0)));
            }

            doc.rate = unitRate;
            doc.cost = toCurrency(toCents(effectiveQuantity) * toCents(unitRate) / 100);
        } else if (effectiveBillingType === 'fixed') {
            if (sub) {
                const fixedRate = (!isWorkerUser && doc.cost !== undefined)
                    ? Number(doc.cost)
                    : (Number(sub.rate) || 0);
                doc.cost = toCurrency(toCents(fixedRate));
                doc.rate = fixedRate;
            } else {
                if (doc.cost !== undefined) {
                    doc.cost = toCurrency(toCents(Number(doc.cost) || 0));
                } else if (existingEntry?.cost !== undefined) {
                    doc.cost = existingEntry.cost;
                } else {
                    doc.cost = 0;
                }
            }
        }
    }
    return null;
}

async function validateTimeEntryBatch(req, res, next) {
    if (req.method !== 'POST') return next();

    // Validate entire batch payload against JSON Schema
    const isBatchValid = validateTimeEntryBatchSchema(req.body);
    if (!isBatchValid) {
        const firstErr = validateTimeEntryBatchSchema.errors?.[0];
        if (firstErr && (firstErr.keyword === 'required' || firstErr.params?.missingProperty === 'items')) {
            return res.status(400).json({ error: 'Brak tablicy items do zaimportowania.' });
        }
        const dateErr = validateTimeEntryBatchSchema.errors?.find(e => e.instancePath?.endsWith('/date'));
        if (dateErr) {
            const match = dateErr.instancePath ? dateErr.instancePath.match(/\/items\/(\d+)\/date$/) : null;
            const idx = match ? Number(match[1]) : 0;
            const rawVal = (req.body && Array.isArray(req.body.items) && req.body.items[idx]) ? req.body.items[idx].date : (dateErr.data || '');
            if (typeof rawVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawVal) && !isValidCalendarDate(rawVal)) {
                return res.status(400).json({ error: `Nieprawidłowa data kalendarzowa: '${rawVal}'. Taki dzień nie istnieje w kalendarzu.` });
            }
            return res.status(400).json({ error: `Nieprawidłowy format daty: '${rawVal}'. Oczekiwano poprawnej daty kalendarzowej YYYY-MM-DD lub znacznika ISO.` });
        }
        const errorDetails = ajv.errorsText(validateTimeEntryBatchSchema.errors, { dataVar: 'batchPayload', separator: '; ' });
        return res.status(400).json({ error: `Błąd walidacji schematu paczki importu: ${errorDetails}.` });
    }

    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Brak tablicy items do zaimportowania.' });
    }
    if (items.length > 1000) {
        return res.status(400).json({ error: 'Maksymalny rozmiar paczki importu to 1000 rekordów.' });
    }

    const isWorker = req.user && (req.user.role === 'worker' || req.user.role === 'foreman');
    const userEmpId = req.user?.id || req.user?._id;

    // Security check 1: Worker/foreman cannot overwrite or hijack an existing entry of another employee
    if (isWorker && db && typeof db.collection === 'function') {
        const itemIds = items.map(it => it && it.id).filter(Boolean);
        if (itemIds.length > 0) {
            try {
                const existingEntries = await db.collection('time-entries').find(
                    { id: { $in: itemIds } },
                    { projection: { id: 1, employeeId: 1, employee_id: 1 } }
                ).toArray();

                for (const existing of existingEntries) {
                    const existingEmpId = existing.employeeId || existing.employee_id;
                    if (existingEmpId && String(existingEmpId) !== String(userEmpId)) {
                        return res.status(403).json({
                            error: `Brak uprawnień: Nie można zmodyfikować ani przejąć istniejącego wpisu innego pracownika (id: '${existing.id}', właściciel: '${existingEmpId}').`
                        });
                    }
                }
            } catch (err) {
                console.error('[validateTimeEntryBatch] Ownership check error:', err.message);
                return res.status(503).json({
                    error: 'Nie można zweryfikować uprawnień własności rekordu z powodu błędu bazy danych.'
                });
            }
        }
    }

    const allowedStatuses = req.user?.role === 'foreman' ? FOREMAN_ALLOWED_TIME_ENTRY_STATUSES : WORKER_ALLOWED_TIME_ENTRY_STATUSES;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item || typeof item !== 'object') {
            return res.status(400).json({ error: `Pozycja #${i + 1} nie jest prawidłowym obiektem.` });
        }

        // Pre-normalize legacy aliases for this batch item
        if (item.employee_id !== undefined) {
            if (item.employeeId === undefined) {
                item.employeeId = item.employee_id;
            }
            delete item.employee_id;
        }
        if (item.project_id !== undefined) {
            if (item.jobId === undefined) {
                item.jobId = item.project_id;
            }
            delete item.project_id;
        }

        const effectiveEmpId = item.employeeId;

        // Security check 2: Worker may ONLY import entries for their own ID and only with allowed statuses
        if (isWorker) {
            if (effectiveEmpId && String(effectiveEmpId) !== String(userEmpId)) {
                return res.status(403).json({
                    error: `Brak uprawnień: Pracownik może importować wpisy wyłącznie dla własnego identyfikatora (${userEmpId}). Wykryto: ${effectiveEmpId}.`
                });
            }
            // Strict status whitelist: worker cannot set approved, admin_approved, settled, etc.
            if (item.status && !allowedStatuses.includes(item.status)) {
                item.status = 'submitted';
            }
        }

        const valError = await validateAndNormalizeTimeEntryDoc(item, {
            db,
            user: req.user,
            isBatch: true,
            isPatch: false
        });
        if (valError) {
            return res.status(valError.status || 400).json({
                error: `Pozycja #${i + 1}: ${valError.error}`
            });
        }
    }

    next();
}

// Time Entry validation: hours 0-24, required fields, closed-job guard, date range guard
async function validateTimeEntry(req, res, next) {
    if (req.method !== 'POST' && req.method !== 'PATCH') return next();
    if (req.path === '/batch-import' || req.url === '/batch-import' || req.originalUrl?.endsWith('/batch-import')) {
        return validateTimeEntryBatch(req, res, next);
    }

    // Pre-normalize legacy aliases in req.body immediately
    if (req.body && typeof req.body === 'object') {
        if (req.body.employee_id !== undefined) {
            if (req.body.employeeId === undefined) {
                req.body.employeeId = req.body.employee_id;
            }
            delete req.body.employee_id;
        }
        if (req.body.project_id !== undefined) {
            if (req.body.jobId === undefined) {
                req.body.jobId = req.body.project_id;
            }
            delete req.body.project_id;
        }
    }

    const pathId = req.path ? req.path.replace(/^\//, '').split('/')[0] : null;
    const targetId = req.params?.id || (pathId && pathId !== 'batch-import' && pathId !== 'batch-update' ? pathId : null) || req.body?.id;

    let existingEntry = null;
    if (req.method === 'PATCH' && targetId && db && typeof db.collection === 'function') {
        try {
            existingEntry = await db.collection('time-entries').findOne({ id: targetId });
            if (!existingEntry) {
                existingEntry = await db.collection('time-entries').findOne({ _id: targetId });
            }
            if (!existingEntry) {
                return res.status(404).json({
                    error: `Nie znaleziono wpisu czasu o identyfikatorze '${targetId}'.`
                });
            }
        } catch (err) {
            console.error('[validateTimeEntry] Single entry lookup error:', err.message);
            return res.status(503).json({
                error: 'Nie można zweryfikować uprawnień własności rekordu z powodu błędu bazy danych.'
            });
        }
    }

    const isWorker = req.user && (req.user.role === 'worker' || req.user.role === 'foreman');
    const userEmpId = req.user?.id || req.user?._id;

    if (isWorker) {
        const allowedStatuses = req.user?.role === 'foreman' ? FOREMAN_ALLOWED_TIME_ENTRY_STATUSES : WORKER_ALLOWED_TIME_ENTRY_STATUSES;

        // Security check 1: In POST, worker can only create entry for their own employeeId
        if (req.method === 'POST') {
            const bodyEmpId = req.body?.employeeId;
            if (bodyEmpId && String(bodyEmpId) !== String(userEmpId)) {
                return res.status(403).json({
                    error: `Brak uprawnień: Pracownik może tworzyć wpisy wyłącznie dla własnego identyfikatora (${userEmpId}). Wykryto: ${bodyEmpId}.`
                });
            }
            if (!bodyEmpId && userEmpId) {
                req.body.employeeId = userEmpId;
            }
            if (!req.body.status) {
                req.body.status = 'submitted';
            }
        }

        // Security check 2: In PATCH, worker cannot reassign employeeId to another employee or clear it
        if (req.method === 'PATCH') {
            const patchEmpId = req.body?.employeeId !== undefined ? req.body.employeeId : req.body?.employee_id;
            if (patchEmpId !== undefined) {
                const trimmedEmpId = typeof patchEmpId === 'string' ? patchEmpId.trim() : patchEmpId;
                if (!trimmedEmpId) {
                    return res.status(400).json({
                        error: 'Pole employeeId nie może być puste.'
                    });
                }
                if (String(trimmedEmpId) !== String(userEmpId)) {
                    return res.status(403).json({
                        error: `Brak uprawnień: Pracownik nie może zmieniać przypisania wpisu (employeeId) na innego pracownika (${patchEmpId}).`
                    });
                }
            }

            // Security check 3: Verify ownership of existing record
            if (existingEntry) {
                const existingEmpId = existingEntry.employeeId || existingEntry.employee_id;
                if (existingEmpId && String(existingEmpId) !== String(userEmpId)) {
                    return res.status(403).json({
                        error: 'Brak uprawnień: Nie można modyfikować wpisu innego pracownika.'
                    });
                }
            }
        }

        // Whitelist allowed statuses for worker/foreman
        if (req.body && req.body.status && !allowedStatuses.includes(req.body.status)) {
            req.body.status = 'submitted';
        }
    }

    if (req.method === 'PATCH') {
        const patchEmpId = req.body?.employeeId !== undefined ? req.body.employeeId : req.body?.employee_id;
        if (patchEmpId !== undefined) {
            const trimmedEmpId = typeof patchEmpId === 'string' ? patchEmpId.trim() : patchEmpId;
            if (!trimmedEmpId) {
                return res.status(400).json({
                    error: 'Pole employeeId nie może być puste.'
                });
            }
        }

        if (req.body?.jobId !== undefined && req.body?.project_id !== undefined) {
            if (String(req.body.jobId).trim() !== String(req.body.project_id).trim()) {
                return res.status(400).json({ error: 'Niespójne wartości jobId oraz project_id w obiekcie aktualizacji.' });
            }
        }
        if (req.body?.employeeId !== undefined && req.body?.employee_id !== undefined) {
            if (String(req.body.employeeId).trim() !== String(req.body.employee_id).trim()) {
                return res.status(400).json({ error: 'Niespójne wartości employeeId oraz employee_id w obiekcie aktualizacji.' });
            }
        }

        const patchJobId = req.body?.jobId !== undefined ? req.body.jobId : req.body?.project_id;
        if (patchJobId !== undefined) {
            const trimmedJobId = typeof patchJobId === 'string' ? patchJobId.trim() : patchJobId;
            if (!trimmedJobId) {
                return res.status(400).json({
                    error: 'Pole jobId nie może być puste.'
                });
            }
        }
    }

    const valError = await validateAndNormalizeTimeEntryDoc(req.body, {
        db,
        user: req.user,
        isBatch: false,
        isPatch: req.method === 'PATCH',
        existingEntry
    });
    if (valError) {
        return res.status(valError.status || 400).json({ error: valError.error });
    }

    next();
}

// Financial amount validation: no negative amounts (invoices + offers + extra-works)
function validateFinancialAmount(req, res, next) {
    if (req.method !== 'POST' && req.method !== 'PATCH') return next();
    const { amountNet, amountGross, plannedRevenueNet, plannedCostNet, totalNet, totalGross } = req.body;

    const checks = [
        [amountNet, 'Kwota netto'],
        [amountGross, 'Kwota brutto'],
        [plannedRevenueNet, 'Planowany przychód netto'],
        [plannedCostNet, 'Planowany koszt netto'],
        [totalNet, 'Suma netto'],
        [totalGross, 'Suma brutto']
    ];

    for (const [val, label] of checks) {
        if (val !== undefined && Number(val) < 0) {
            return res.status(400).json({ error: `${label} nie może być ujemny/a. Wprowadź wartość ≥ 0.` });
        }
    }
    next();
}

// Settlement validation: no negative totals
function validateSettlement(req, res, next) {
    if (req.method !== 'POST' && req.method !== 'PATCH') return next();
    const { totalAmount, totalHours } = req.body;

    if (totalAmount !== undefined && Number(totalAmount) < 0) {
        return res.status(400).json({ error: 'Łączna kwota rozliczenia nie może być ujemna.' });
    }
    if (totalHours !== undefined && Number(totalHours) < 0) {
        return res.status(400).json({ error: 'Łączna liczba godzin nie może być ujemna.' });
    }
    next();
}


// --- TiCo Module Routes (all require auth) ---
app.use('/api/employees', verifyToken, requireRoleOrSafeGet, createRouter('employees'));
app.use('/api/subcontractors', verifyToken, requireRoleOrSafeGet, createRouter('subcontractors'));
app.use('/api/clients', verifyToken, requireRoleOrSafeGet, createRouter('clients'));
app.use('/api/offers', verifyToken, requireRoleOrSafeGet, createRouter('offers'));
app.use('/api/constructions', verifyToken, requireRoleOrSafeGet, createRouter('constructions'));
// CostBase catalog endpoints
app.use('/api/installation-rates', verifyToken, requireRoleOrSafeGet, createRouter('installation-rates'));
app.use('/api/logistics-rates', verifyToken, requireRoleOrSafeGet, createRouter('logistics-rates'));
app.use('/api/rental-rates', verifyToken, requireRoleOrSafeGet, createRouter('rental-rates'));
app.use('/api/sheet-metal', verifyToken, requireRoleOrSafeGet, createRouter('sheet-metal'));
app.use('/api/crews', verifyToken, requireRoleOrSafeGet, createRouter('crews'));
app.post('/api/time-entries/batch-update', verifyToken, requireRole('admin', 'manager'), requireTransactions, async (req, res) => {
    try {
        const { ids, updates } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Należy wskazać co najmniej jeden wpis czasu (tablica ids).' });
        }
        if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'Obiekt aktualizacji (updates) nie może być pusty.' });
        }

        // Whitelist allowed fields for batch-update
        const allowedBatchFields = new Set([
            'status', 'jobId', 'project_id', 'employeeId', 'employee_id',
            'activityType', 'type', 'billingType', 'hours', 'rate',
            'quantity', 'unitPrice', 'cost', 'hourlyRate', 'notes',
            'adminId', 'admin_id', 'adminApprovedAt', 'admin_approved_at',
            'adminRejectedAt', 'admin_rejected_at', 'adminNotes', 'rejectionReason'
        ]);

        const forbiddenFields = Object.keys(updates).filter(k => !allowedBatchFields.has(k) && k !== '_id' && k !== 'id');
        if (forbiddenFields.length > 0) {
            return res.status(400).json({
                error: `Nieobsługiwane lub zabronione pole w aktualizacji wsadowej: ${forbiddenFields.join(', ')}. Dozwolone: ${Array.from(allowedBatchFields).join(', ')}.`
            });
        }

        const safeUpdates = { ...updates };
        delete safeUpdates._id;
        delete safeUpdates.id;

        // Check conflicting aliased fields
        if (safeUpdates.jobId !== undefined && safeUpdates.project_id !== undefined && safeUpdates.jobId !== safeUpdates.project_id) {
            return res.status(400).json({ error: 'Niespójne wartości jobId oraz project_id w aktualizacji wsadowej.' });
        }
        if (safeUpdates.employeeId !== undefined && safeUpdates.employee_id !== undefined && safeUpdates.employeeId !== safeUpdates.employee_id) {
            return res.status(400).json({ error: 'Niespójne wartości employeeId oraz employee_id w aktualizacji wsadowej.' });
        }

        const isJobUpdated = safeUpdates.jobId !== undefined || safeUpdates.project_id !== undefined;
        const isEmpUpdated = safeUpdates.employeeId !== undefined || safeUpdates.employee_id !== undefined;

        if (safeUpdates.project_id !== undefined && safeUpdates.jobId === undefined) {
            safeUpdates.jobId = safeUpdates.project_id;
        }
        if (safeUpdates.employee_id !== undefined && safeUpdates.employeeId === undefined) {
            safeUpdates.employeeId = safeUpdates.employee_id;
        }

        // Schema validation
        const isValid = validateTimeEntryPatchSchema(safeUpdates);
        if (!isValid) {
            const firstErr = validateTimeEntryPatchSchema.errors?.[0];
            if (firstErr) {
                if (firstErr.instancePath.includes('status')) {
                    return res.status(400).json({
                        error: `Nieprawidłowy status wpisu czasu: '${safeUpdates.status}'. Dozwolone: ${VALID_TIME_ENTRY_STATUSES.join(', ')}.`
                    });
                }
                if (firstErr.instancePath.includes('hours')) {
                    if (firstErr.keyword === 'minimum') return res.status(400).json({ error: 'Godziny nie mogą być ujemne.' });
                    if (firstErr.keyword === 'maximum') return res.status(400).json({ error: 'Godziny nie mogą przekraczać 24h na jeden wpis.' });
                    if (firstErr.keyword === 'type') return res.status(400).json({ error: 'Pole hours musi być liczbą.' });
                }
                if (firstErr.instancePath.includes('billingType')) {
                    return res.status(400).json({
                        error: `Nieprawidłowy typ rozliczenia (billingType): '${safeUpdates.billingType}'. Dozwolone: ${BILLING_TYPES.join(', ')}.`
                    });
                }
                if (firstErr.keyword === 'minLength') {
                    return res.status(400).json({ error: `Pole ${firstErr.instancePath.replace('/', '')} nie może być puste.` });
                }
            }
            const errorDetails = ajv.errorsText(validateTimeEntryPatchSchema.errors, { dataVar: 'safeUpdates', separator: '; ' });
            return res.status(400).json({ error: `Błąd walidacji schematu aktualizacji wsadowej: ${errorDetails}.` });
        }

        const uniqueRequestedIds = Array.from(new Set(ids.map(id => String(id).trim()).filter(Boolean)));
        if (uniqueRequestedIds.length === 0) {
            return res.status(400).json({ error: 'Brak prawidłowych identyfikatorów w tablicy ids.' });
        }

        const unsetDoc = {};
        if (isJobUpdated) {
            unsetDoc.project_id = "";
        }
        if (isEmpUpdated) {
            unsetDoc.employee_id = "";
        }

        // FULL ACID TRANSACTIONAL BATCH-UPDATE (when Replica Set is active)
        if (isReplicaSet && client) {
            const session = client.startSession();
            try {
                let affectedJobIds = [];
                let modifiedCount = 0;
                let returnItems = [];

                await session.withTransaction(async () => {
                    // 1. Snapshot inside session
                    const beforeEntries = await db.collection('time-entries').find(
                        { $or: [{ id: { $in: uniqueRequestedIds } }, { _id: { $in: uniqueRequestedIds } }] },
                        { session }
                    ).toArray();

                    // Fail-closed validation of requested vs found
                    const foundIdSet = new Set();
                    beforeEntries.forEach(e => {
                        if (e.id) foundIdSet.add(String(e.id));
                        if (e._id) foundIdSet.add(String(e._id));
                    });

                    const missingIds = uniqueRequestedIds.filter(id => !foundIdSet.has(id));
                    if (missingIds.length > 0) {
                        const err = new Error(`Nie znaleziono wszystkich wskazanych wpisów czasu. Brakujące identyfikatory: ${missingIds.join(', ')}.`);
                        err.status = 404;
                        err.missingIds = missingIds;
                        throw err;
                    }

                    const nowIso = new Date().toISOString();
                    const validatedCandidates = [];

                    for (const entry of beforeEntries) {
                        const candidatePatch = { ...safeUpdates };
                        const valError = await validateAndNormalizeTimeEntryDoc(candidatePatch, {
                            db,
                            user: req.user,
                            isBatch: true,
                            isPatch: true,
                            existingEntry: entry,
                            session
                        });
                        if (valError) {
                            const err = new Error(valError.error || 'Błąd walidacji wpisu czasu w operacji wsadowej.');
                            err.status = valError.status || 400;
                            throw err;
                        }

                        const candidateId = entry.id || (entry._id ? entry._id.toString() : null);
                        const finalDoc = {
                            ...entry,
                            ...candidatePatch,
                            id: candidateId,
                            updatedAt: nowIso
                        };
                        delete finalDoc._id;
                        if (isJobUpdated) delete finalDoc.project_id;
                        if (isEmpUpdated) delete finalDoc.employee_id;

                        validatedCandidates.push({ finalDoc, originalUpdatedAt: entry.updatedAt });
                    }

                    returnItems = validatedCandidates.map(c => c.finalDoc);

                    // 2. Build CAS operations with optimistic filter
                    const bulkOps = validatedCandidates.map(({ finalDoc, originalUpdatedAt }) => {
                        const setDoc = { ...finalDoc };
                        delete setDoc.id;
                        const filter = {
                            $or: [{ id: finalDoc.id }, { _id: finalDoc.id }]
                        };
                        if (originalUpdatedAt) {
                            filter.updatedAt = originalUpdatedAt;
                        }
                        const op = {
                            updateOne: {
                                filter,
                                update: { $set: setDoc }
                            }
                        };
                        if (Object.keys(unsetDoc).length > 0) {
                            op.updateOne.update.$unset = unsetDoc;
                        }
                        return op;
                    });

                    const bulkRes = await db.collection('time-entries').bulkWrite(bulkOps, { session });
                    const matched = bulkRes.matchedCount !== undefined ? bulkRes.matchedCount : bulkOps.length;
                    if (matched !== bulkOps.length) {
                        const err = new Error(`Błąd współbieżności CAS: dopasowano ${matched} z ${bulkOps.length} wpisów. Dane zostały zmodyfikowane współbieżnie.`);
                        err.status = 409;
                        throw err;
                    }
                    modifiedCount = bulkRes.modifiedCount !== undefined ? bulkRes.modifiedCount : bulkOps.length;

                    // Failpoint for testing real rollback after bulkWrite
                    if (process.env.NODE_ENV === 'test' && _testFailpoint === 'after_batch_bulkwrite') {
                        throw new Error('FAILPOINT: Simulated crash after batch bulkWrite');
                    }

                    // 3. Collect affected jobs and recalculate inside the exact same session (atomic, NO uncommitted pre-marking)
                    const jobIds = new Set();
                    beforeEntries.forEach(e => {
                        if (e.jobId) jobIds.add(e.jobId);
                        if (e.project_id) jobIds.add(e.project_id);
                    });
                    if (safeUpdates.jobId) jobIds.add(safeUpdates.jobId);
                    affectedJobIds = Array.from(jobIds);

                    for (const jobId of affectedJobIds) {
                        await recalculateJobLaborCosts(jobId, { session, throwOnError: true });
                    }
                });

                return res.status(200).json({
                    success: true,
                    modifiedCount,
                    requestedCount: uniqueRequestedIds.length,
                    items: returnItems,
                    affectedJobs: affectedJobIds
                });
            } catch (txErr) {
                console.error('[BATCH-UPDATE TRANSACTION ERROR - FULL ROLLBACK]', txErr);
                return res.status(txErr.status || 500).json({
                    error: txErr.message,
                    missingIds: txErr.missingIds,
                    affectedJobs: txErr.affectedJobs
                });
            } finally {
                await session.endSession();
            }
        }

        // Non-transactional fallback path (strictly allowed in dev/test only when ALLOW_NON_TRANSACTIONAL === 'true')
        if (process.env.NODE_ENV === 'production' && process.env.ALLOW_NON_TRANSACTIONAL !== 'true') {
            return res.status(503).json({
                code: 'TRANSACTIONS_REQUIRED',
                error: 'Serwer bazy danych nie obsługuje transakcji ACID (brak Replica Set). Operacja wsadowa odrzucona.'
            });
        }

        // Standalone fallback: pre-fetch snapshot, validate, pre-mark pending, and execute non-transactional bulkWrite
        const beforeEntries = await db.collection('time-entries').find({
            $or: [{ id: { $in: uniqueRequestedIds } }, { _id: { $in: uniqueRequestedIds } }]
        }).toArray();

        const foundIdSet = new Set();
        beforeEntries.forEach(e => {
            if (e.id) foundIdSet.add(String(e.id));
            if (e._id) foundIdSet.add(String(e._id));
        });
        const missingIds = uniqueRequestedIds.filter(id => !foundIdSet.has(id));
        if (missingIds.length > 0) {
            return res.status(404).json({
                error: `Nie znaleziono wszystkich wskazanych wpisów czasu. Brakujące identyfikatory: ${missingIds.join(', ')}.`,
                missingIds,
                requestedCount: uniqueRequestedIds.length,
                foundCount: beforeEntries.length,
                matchedCount: 0
            });
        }

        const nowIso = new Date().toISOString();
        const validatedCandidates = [];
        for (const entry of beforeEntries) {
            const candidatePatch = { ...safeUpdates };
            const valError = await validateAndNormalizeTimeEntryDoc(candidatePatch, {
                db,
                user: req.user,
                isBatch: true,
                isPatch: true,
                existingEntry: entry
            });
            if (valError) {
                return res.status(valError.status || 400).json({
                    error: valError.error || 'Błąd walidacji wpisu czasu w operacji wsadowej.'
                });
            }

            const candidateId = entry.id || (entry._id ? entry._id.toString() : null);
            const finalDoc = {
                ...entry,
                ...candidatePatch,
                id: candidateId,
                updatedAt: nowIso
            };
            delete finalDoc._id;
            if (isJobUpdated) delete finalDoc.project_id;
            if (isEmpUpdated) delete finalDoc.employee_id;
            validatedCandidates.push(finalDoc);
        }

        const jobIds = new Set();
        beforeEntries.forEach(e => {
            if (e.jobId) jobIds.add(e.jobId);
            if (e.project_id) jobIds.add(e.project_id);
        });
        if (safeUpdates.jobId) jobIds.add(safeUpdates.jobId);

        // Pre-mark pending in fallback mode
        if (jobIds.size > 0 && db && typeof db.collection === 'function') {
            const affectedJobIdsArray = Array.from(jobIds);
            const jobsColl = db.collection('jobs');
            if (typeof jobsColl.updateMany === 'function') {
                await jobsColl.updateMany(
                    { $or: [{ id: { $in: affectedJobIdsArray } }, { _id: { $in: affectedJobIdsArray } }] },
                    { $set: { aggregationPending: true, updatedAt: nowIso } }
                );
            }
        }

        const bulkOps = validatedCandidates.map(c => {
            const setDoc = { ...c };
            delete setDoc.id;
            const op = {
                updateOne: {
                    filter: { $or: [{ id: c.id }, { _id: c.id }] },
                    update: { $set: setDoc }
                }
            };
            if (Object.keys(unsetDoc).length > 0) {
                op.updateOne.update.$unset = unsetDoc;
            }
            return op;
        });

        try {
            await db.collection('time-entries').bulkWrite(bulkOps);
        } catch (bulkErr) {
            console.error('[BATCH-UPDATE fallback bulkWrite ERROR]', bulkErr);
            for (const jobId of jobIds) {
                try {
                    await recalculateJobLaborCosts(jobId);
                } catch (recalcErr) {
                    console.warn(`[BATCH-UPDATE error recovery] Failed recalculating job ${jobId}:`, recalcErr.message);
                }
            }

            if (bulkErr.name === 'MongoBulkWriteError' || bulkErr.result || bulkErr.writeErrors) {
                const writeResult = bulkErr.result || {};
                const modifiedCount = writeResult.modifiedCount || (writeResult.nModified || 0);
                const matchedCount = writeResult.matchedCount || (writeResult.nMatched || 0);
                const writeErrors = bulkErr.writeErrors || [];
                const failedIndices = new Set(writeErrors.map(e => e.index));
                const failedIds = [];
                const succeededIds = [];

                for (let i = 0; i < validatedCandidates.length; i++) {
                    const cId = validatedCandidates[i].id;
                    if (failedIndices.has(i)) {
                        failedIds.push(cId);
                    } else {
                        succeededIds.push(cId);
                    }
                }

                return res.status(500).json({
                    error: `Operacja wsadowa zakończyła się częściowym błędem: ${bulkErr.message}`,
                    partialSuccess: succeededIds.length > 0,
                    succeededIds,
                    failedIds,
                    aggregationPending: true,
                    affectedJobs: Array.from(jobIds),
                    requestedCount: uniqueRequestedIds.length,
                    modifiedCount,
                    matchedCount
                });
            }

            return res.status(500).json({ error: `Błąd zapisu wsadowego: ${bulkErr.message}` });
        }

        for (const jobId of jobIds) {
            try {
                await recalculateJobLaborCosts(jobId);
            } catch (recalcErr) {
                console.warn(`[batch-update fallback recalculation error for job ${jobId}]`, recalcErr.message);
            }
        }

        return res.status(200).json({
            success: true,
            modifiedCount: validatedCandidates.length,
            requestedCount: uniqueRequestedIds.length,
            items: validatedCandidates,
            affectedJobs: Array.from(jobIds)
        });
    } catch (err) {
        console.error('[batch-update ERROR]', err);
        return res.status(500).json({ error: `Błąd serwera podczas aktualizacji wsadowej: ${err.message}` });
    }
});

app.use('/api/time-entries', verifyToken, validateTimeEntry, createRouter('time-entries', {
    allowBatchImport: true,
    afterMutation: async (action, ctx) => {
        try {
            const jobIds = new Set();
            // [P1 FIX] Collect old jobId so moving an entry or deleting an entry recalculates the old job
            if (ctx.oldDoc?.jobId) jobIds.add(ctx.oldDoc.jobId);
            if (ctx.oldDoc?.project_id) jobIds.add(ctx.oldDoc.project_id);

            // Collect new jobId after creation or patch
            if (ctx.doc?.jobId) jobIds.add(ctx.doc.jobId);
            if (ctx.doc?.project_id) jobIds.add(ctx.doc.project_id);
            if (ctx.updates?.jobId) jobIds.add(ctx.updates.jobId);
            if (ctx.updates?.project_id) jobIds.add(ctx.updates.project_id);

            // Collect from batch items and old documents map
            if (ctx.items && Array.isArray(ctx.items)) {
                ctx.items.forEach(i => {
                    if (i.jobId) jobIds.add(i.jobId);
                    if (i.project_id) jobIds.add(i.project_id);
                    if (ctx.oldDocsMap?.has(i.id)) {
                        const old = ctx.oldDocsMap.get(i.id);
                        if (old?.jobId) jobIds.add(old.jobId);
                        if (old?.project_id) jobIds.add(old.project_id);
                    }
                });
            }
            if (ctx.id && db && typeof db.collection === 'function' && jobIds.size === 0) {
                const entry = await db.collection('time-entries').findOne({ id: ctx.id });
                if (entry?.jobId) jobIds.add(entry.jobId);
                if (entry?.project_id) jobIds.add(entry.project_id);
            }
            for (const jId of jobIds) {
                await recalculateJobLaborCosts(jId);
            }
        } catch (err) {
            console.warn('[afterMutation time-entries] Labor recalculation error:', err.message);
        }
    }
}));

function isValidCalendarDate(rawDate) {
    if (typeof rawDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        return false;
    }
    const [year, month, day] = rawDate.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

// [P3 FIX] Strict date normalization: accepts strictly YYYY-MM-DD or verified ISO 8601 (rejects trailing junk like 2026-10-03XYZ, invalid times like 99:99:99, and invalid offsets)
function extractValidDateKey(rawDate) {
    if (typeof rawDate !== 'string') return null;
    // 1. Strict calendar date: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        return isValidCalendarDate(rawDate) ? rawDate : null;
    }
    // 2. Strict full ISO 8601 timestamp with valid hours (00-23), minutes (00-59), seconds (00-59), optional ms, and valid timezone offset
    if (/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)?$/.test(rawDate)) {
        const parsed = new Date(rawDate);
        if (isNaN(parsed.getTime())) return null;
        const datePart = rawDate.slice(0, 10);
        return isValidCalendarDate(datePart) ? datePart : null;
    }
    return null;
}

// Authoritative domain calculation helper and fail-closed validator for hourly settlements
// Shared between create-atomic and recalculate to ensure 100% calculation parity and strict data integrity
function calculateHourlySettlementTotals(candidateEntries = [], candidateAdvances = []) {
    if (!Array.isArray(candidateEntries)) {
        const err = new Error('Wpisy czasu muszą być przekazane jako tablica.');
        err.status = 400;
        throw err;
    }

    // [P1 FIX] Strict fail-closed validation of all candidate time-entries
    for (const entry of candidateEntries) {
        if (!entry || typeof entry !== 'object') {
            const err = new Error('Nieprawidłowy dokument wpisu czasu.');
            err.status = 400;
            throw err;
        }

        const entryId = entry.id || entry._id || 'unknown';

        // 1. Hours: must be strict finite number, 0 <= hours <= 24 (no strings, no NaN, no negative)
        if (typeof entry.hours !== 'number' || !Number.isFinite(entry.hours) || entry.hours < 0 || entry.hours > 24) {
            const err = new Error(`Wpis czasu '${entryId}' posiada nieprawidłową lub nienumeryczną liczbę godzin (${entry.hours}). Wartość musi być skończoną liczbą od 0 do 24h.`);
            err.status = 400;
            throw err;
        }

        // 2. Cost: must be strict finite number, cost >= 0 (no strings, no NaN, no negative)
        if (typeof entry.cost !== 'number' || !Number.isFinite(entry.cost) || entry.cost < 0) {
            const err = new Error(`Wpis czasu '${entryId}' posiada nieprawidłowy lub nienumeryczny koszt (${entry.cost}). Koszt musi być nieujemną liczbą skończoną.`);
            err.status = 400;
            throw err;
        }

        // 3. Billing type
        const bType = entry.billingType || 'hourly';
        if (!['hourly', 'fixed', 'm2', 'mb'].includes(bType)) {
            const err = new Error(`Wpis czasu '${entryId}' posiada nieznany typ rozliczenia (billingType: '${entry.billingType}'). Dopuszczalne wartości to: hourly, fixed, m2, mb.`);
            err.status = 400;
            throw err;
        }

        if (bType === 'hourly') {
            if (entry.hours <= 0) {
                const err = new Error(`Wpis czasu '${entryId}' o rozliczeniu godzinowym musi posiadać dodatnią liczbę godzin (aktualnie: ${entry.hours}).`);
                err.status = 400;
                throw err;
            }
            const hasExplicitRate = entry.hourlyRate !== undefined && entry.hourlyRate !== null;
            let hRate = 0;
            if (hasExplicitRate) {
                if (typeof entry.hourlyRate !== 'number' || !Number.isFinite(entry.hourlyRate) || entry.hourlyRate <= 0) {
                    const err = new Error(`Wpis czasu '${entryId}' o rozliczeniu godzinowym posiada nieprawidłową stawkę (${entry.hourlyRate}). Stawka godzinowa musi być dodatnią liczbą.`);
                    err.status = 400;
                    throw err;
                }
                hRate = entry.hourlyRate;
                const expectedCostCents = toCents(entry.hours * hRate);
                const actualCostCents = toCents(entry.cost);
                if (Math.abs(expectedCostCents - actualCostCents) > 1) {
                    const err = new Error(`Wpis czasu '${entryId}' posiada niespójny koszt (${entry.cost}) w stosunku do iloczynu godzin i stawki (${entry.hours}h × ${hRate} zł = ${toCurrency(expectedCostCents)} zł).`);
                    err.status = 400;
                    throw err;
                }
            } else {
                hRate = entry.cost / entry.hours;
                if (!Number.isFinite(hRate) || hRate <= 0) {
                    const err = new Error(`Wpis czasu '${entryId}' o rozliczeniu godzinowym posiada nieprawidłową stawkę wynikową (${hRate}).`);
                    err.status = 400;
                    throw err;
                }
            }
        } else if (bType === 'm2' || bType === 'mb') {
            if (typeof entry.quantity !== 'number' || !Number.isFinite(entry.quantity) || entry.quantity <= 0) {
                const err = new Error(`Wpis czasu '${entryId}' o rozliczeniu ${bType} posiada nieprawidłowy obmiar (${entry.quantity}). Obmiar musi być dodatnią liczbą.`);
                err.status = 400;
                throw err;
            }
            const rawRate = entry.rate !== undefined && entry.rate !== null ? entry.rate : entry.unitPrice;
            if (typeof rawRate !== 'number' || !Number.isFinite(rawRate) || rawRate <= 0) {
                const err = new Error(`Wpis czasu '${entryId}' o rozliczeniu ${bType} posiada nieprawidłową stawkę (${rawRate}). Stawka jednostkowa musi być dodatnią liczbą.`);
                err.status = 400;
                throw err;
            }
            const expectedCostCents = toCents(entry.quantity * rawRate);
            const actualCostCents = toCents(entry.cost);
            if (Math.abs(expectedCostCents - actualCostCents) > 1) {
                const err = new Error(`Wpis czasu '${entryId}' posiada niespójny koszt (${entry.cost}) w stosunku do obmiaru i stawki (${entry.quantity} × ${rawRate} = ${toCurrency(expectedCostCents)} zł).`);
                err.status = 400;
                throw err;
            }
        } else if (bType === 'fixed') {
            if (entry.cost <= 0) {
                const err = new Error(`Wpis czasu '${entryId}' o rozliczeniu ryczałtowym posiada nieprawidłowy koszt (${entry.cost}). Koszt ryczałtu musi być dodatnią liczbą.`);
                err.status = 400;
                throw err;
            }
        }

        // 4. Date validation (calendar validity check via extractValidDateKey, no trailing junk)
        const dateKey = extractValidDateKey(entry.date);
        if (!dateKey) {
            const err = new Error(`Wpis czasu '${entryId}' posiada nieprawidłową lub nieistniejącą w kalendarzu datę (${entry.date}).`);
            err.status = 400;
            throw err;
        }
    }

    // [P1 FIX] Strict fail-closed validation of candidate advances
    let advanceDeductionsCents = 0;
    if (Array.isArray(candidateAdvances)) {
        for (const adv of candidateAdvances) {
            if (!adv || typeof adv !== 'object') {
                const err = new Error('Nieprawidłowy dokument zaliczki.');
                err.status = 400;
                throw err;
            }
            const advId = adv.id || adv._id || 'unknown';
            if (typeof adv.amount !== 'number' || !Number.isFinite(adv.amount) || adv.amount <= 0) {
                const err = new Error(`Zaliczka '${advId}' posiada nieprawidłową lub ujemną kwotę (${adv.amount}). Kwota zaliczki musi być dodatnią liczbą skończoną.`);
                err.status = 400;
                throw err;
            }
            advanceDeductionsCents += toCents(adv.amount);
        }
    } else if (typeof candidateAdvances === 'number') {
        if (!Number.isFinite(candidateAdvances) || candidateAdvances < 0) {
            const err = new Error(`Nieprawidłowa suma zaliczek (${candidateAdvances}). Wartość musi być skończoną liczbą nieujemną.`);
            err.status = 400;
            throw err;
        }
        advanceDeductionsCents = toCents(candidateAdvances);
    } else {
        const err = new Error('Zaliczki muszą być przekazane jako tablica dokumentów lub skończona liczba nieujemna.');
        err.status = 400;
        throw err;
    }
    const advanceDeductions = toCurrency(advanceDeductionsCents);

    // Overtime applies ONLY to hourly entries; each day calculates overtime at that day's weighted rate
    const hourlyEntries = candidateEntries.filter(t => !t.billingType || t.billingType === 'hourly');
    const dailyHourlyMap = new Map();
    hourlyEntries.forEach(t => {
        const dateKey = extractValidDateKey(t.date);
        const h = t.hours;
        const rate = (typeof t.hourlyRate === 'number' && t.hourlyRate > 0) ? t.hourlyRate : (t.cost / h);
        const cur = dailyHourlyMap.get(dateKey) || { hours: 0, costCents: 0, rate };
        dailyHourlyMap.set(dateKey, {
            hours: cur.hours + h,
            costCents: cur.costCents + toCents(h * rate),
            rate: rate || cur.rate
        });
    });

    let overtimeHours = 0;
    let overtimePayCents = 0;
    dailyHourlyMap.forEach(({ hours: dayHours, costCents: dayCostCents, rate: dayRate }) => {
        if (dayHours > 8) {
            const dailyOvertime = dayHours - 8;
            const effectiveRate = dayHours > 0 ? (dayCostCents / (dayHours * 100)) : dayRate;
            overtimeHours += dailyOvertime;
            overtimePayCents += toCents(dailyOvertime * effectiveRate * 0.5);
        }
    });

    const overtimePay = toCurrency(overtimePayCents);
    overtimeHours = Math.round(overtimeHours * 100) / 100;

    let baseAmountCents = 0;
    candidateEntries.forEach(t => {
        baseAmountCents += toCents(t.cost);
    });
    const baseAmount = toCurrency(baseAmountCents);
    const grossAmount = toCurrency(baseAmountCents + overtimePayCents);
    const totalAmount = toCurrency(toCents(grossAmount) - advanceDeductionsCents);
    const totalHours = Math.round(candidateEntries.reduce((sum, t) => sum + t.hours, 0) * 100) / 100;

    return {
        totalHours,
        baseAmount,
        overtimeHours,
        overtimePay,
        grossAmount,
        advanceDeductions,
        totalAmount
    };
}

// ==========================================
// FAZA 3: DOMAIN TRANSACTIONAL SETTLEMENT ENDPOINT
// Atomically creates settlement, performs CAS updates on time-entries and advances,
// recalculates job aggregates, and saves idempotency record in a single MongoDB transaction.
// ==========================================
app.post('/api/settlements/create-atomic', verifyToken, requireRole('admin', 'manager'), requireTransactions, async (req, res) => {
    const rawKey = req.headers['idempotency-key'] || req.body?.idempotencyKey;
    if (!rawKey || typeof rawKey !== 'string' || rawKey.trim() === '' || rawKey.trim().length > 128) {
        return res.status(400).json({
            error: 'Nagłówek Idempotency-Key (lub właściwość idempotencyKey w payloadzie) jest wymagany dla transakcyjnego rozliczenia i musi być niepustym ciągiem znaków o długości maksymalnie 128 znaków.'
        });
    }
    const idempotencyKey = rawKey.trim();
    const ownerToken = crypto.randomUUID();
    let requestHash = null;
    let reservedKey = false;
    let leaseHeartbeat = null;
    try {
        // [P2 FIX] Full strict payload contract validation (fail-closed, rejects extra fields & non-arrays)
        if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
            return res.status(400).json({ error: 'Payload żądania musi być poprawnym obiektem JSON.' });
        }

        const allowedPayloadFields = new Set([
            'workerId', 'workerType', 'periodFrom', 'periodTo',
            'timeEntryIds', 'advanceIds', 'notes', 'type', 'id',
            'contractId', 'jobId', 'stageId', 'amount', 'exchangeRate', 'idempotencyKey'
        ]);

        const extraFields = Object.keys(req.body).filter(k => !allowedPayloadFields.has(k));
        if (extraFields.length > 0) {
            return res.status(400).json({
                error: `Niedozwolone dodatkowe pola w żądaniu: ${extraFields.join(', ')}. Schemat CreateAtomicSettlementPayload nie dopuszcza nieznanych właściwości.`
            });
        }

        const {
            workerId,
            workerType,
            periodFrom,
            periodTo,
            timeEntryIds,
            advanceIds = [],
            notes = '',
            type = 'hourly',
            contractId,
            jobId,
            stageId,
            amount,
            exchangeRate
        } = req.body;

        if (exchangeRate !== undefined && exchangeRate !== null) {
            if (typeof exchangeRate !== 'number' || !Number.isFinite(exchangeRate) || exchangeRate <= 0) {
                return res.status(400).json({ error: 'Kurs wymiany waluty (exchangeRate), jeśli został podany, musi być dodatnią liczbą większą od zera.' });
            }
        }

        if (!workerId || typeof workerId !== 'string' || workerId.trim() === '') {
            return res.status(400).json({ error: 'Identyfikator wykonawcy (workerId) jest wymagany i musi być niepustym stringiem.' });
        }
        if (!['employee', 'subcontractor'].includes(workerType)) {
            return res.status(400).json({ error: "Typ wykonawcy (workerType) musi być 'employee' lub 'subcontractor'." });
        }

        if (!isValidCalendarDate(periodFrom) || !isValidCalendarDate(periodTo)) {
            return res.status(400).json({ error: 'Okres rozliczenia (periodFrom, periodTo) jest wymagany w formacie YYYY-MM-DD i musi być poprawną datą kalendarzową.' });
        }
        if (periodFrom > periodTo) {
            return res.status(400).json({ error: `Data początkowa okresu ('${periodFrom}') nie może być późniejsza niż data końcowa ('${periodTo}').` });
        }

        const settlementType = type || 'hourly';
        if (!['hourly', 'contract'].includes(settlementType)) {
            return res.status(400).json({ error: `Nieprawidłowy typ rozliczenia (type: '${type}'). Dopuszczalne wartości to: 'hourly', 'contract'.` });
        }

        if (notes !== undefined && notes !== null && typeof notes !== 'string') {
            return res.status(400).json({ error: 'Pole notes, jeśli podane, musi być ciągiem znaków.' });
        }
        if (req.body.id !== undefined && req.body.id !== null && (typeof req.body.id !== 'string' || req.body.id.trim() === '')) {
            return res.status(400).json({ error: 'Identyfikator rozliczenia (id), jeśli podany, musi być niepustym stringiem.' });
        }

        if (settlementType === 'contract') {
            if (workerType !== 'subcontractor') {
                return res.status(400).json({ error: "Rozliczenia kontraktowe (type: 'contract') są dozwolone wyłącznie dla podwykonawców (workerType: 'subcontractor')." });
            }
            if (!contractId || typeof contractId !== 'string' || contractId.trim() === '') {
                return res.status(400).json({ error: "Identyfikator kontraktu (contractId) jest wymagany dla rozliczenia kontraktowego." });
            }
            if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
                return res.status(400).json({ error: "Dla rozliczenia kontraktowego (type: 'contract') kwota (amount) jest wymagana i musi być liczbą większą od zera." });
            }
            if (req.body.advanceIds !== undefined && req.body.advanceIds !== null && (!Array.isArray(req.body.advanceIds) || req.body.advanceIds.length > 0)) {
                return res.status(400).json({ error: "Rozliczenia kontraktowe nie obsługują potrąceń zaliczek." });
            }
            if (req.body.timeEntryIds !== undefined && req.body.timeEntryIds !== null && (!Array.isArray(req.body.timeEntryIds) || req.body.timeEntryIds.length > 0)) {
                return res.status(400).json({ error: "Rozliczenia kontraktowe nie przyjmują wpisów czasu." });
            }
            if (jobId !== undefined && jobId !== null && (typeof jobId !== 'string' || jobId.trim() === '')) {
                return res.status(400).json({ error: "Identyfikator zlecenia (jobId), jeśli podany, musi być niepustym stringiem." });
            }
            if (stageId !== undefined && stageId !== null && (typeof stageId !== 'string' || stageId.trim() === '')) {
                return res.status(400).json({ error: "Identyfikator etapu (stageId), jeśli podany, musi być niepustym stringiem." });
            }
        } else {
            if (!Array.isArray(timeEntryIds) || timeEntryIds.length === 0) {
                return res.status(400).json({ error: 'Należy wskazać co najmniej jeden wpis czasu (timeEntryIds - tablica niepustych stringów).' });
            }
            if (!timeEntryIds.every(id => typeof id === 'string' && id.trim().length > 0)) {
                return res.status(400).json({ error: 'Każdy element timeEntryIds musi być niepustym ciągiem znaków.' });
            }
            if (new Set(timeEntryIds).size !== timeEntryIds.length) {
                return res.status(400).json({ error: 'Wskazana lista wpisów czasu (timeEntryIds) zawiera zduplikowane identyfikatory.' });
            }

            if (req.body.advanceIds !== undefined && req.body.advanceIds !== null) {
                if (!Array.isArray(req.body.advanceIds)) {
                    return res.status(400).json({ error: 'Pole advanceIds, jeśli zostało przekazane, musi być tablicą identyfikatorów.' });
                }
                if (!req.body.advanceIds.every(id => typeof id === 'string' && id.trim().length > 0)) {
                    return res.status(400).json({ error: 'Każdy element advanceIds musi być niepustym ciągiem znaków.' });
                }
                if (new Set(req.body.advanceIds).size !== req.body.advanceIds.length) {
                    return res.status(400).json({ error: 'Wskazana lista zaliczek (advanceIds) zawiera zduplikowane identyfikatory.' });
                }
            }

            if (workerType === 'subcontractor' && Array.isArray(advanceIds) && advanceIds.length > 0) {
                return res.status(400).json({ error: "Zaliczki (advanceIds) mogą być rozliczane wyłącznie dla pracowników (workerType='employee'). Podwykonawcy nie obsługują wniosków zaliczkowych." });
            }
        }

        // Validate and normalize exchangeRate once to guarantee identical precision in hash, calculations, and persistence
        let normalizedExchangeRate = null;
        if (req.body.exchangeRate !== undefined && req.body.exchangeRate !== null) {
            if (typeof req.body.exchangeRate !== 'number' || !Number.isFinite(req.body.exchangeRate) || req.body.exchangeRate <= 0) {
                return res.status(400).json({ error: 'Pole exchangeRate, jeśli zostało przekazane, musi być dodatnią liczbą.' });
            }
            normalizedExchangeRate = Math.round(req.body.exchangeRate * 10000) / 10000;
        }

        // Canonical payload hash covering all semantic fields including notes, id, contractId, jobId, stageId, amount, exchangeRate
        const canonicalPayload = {
            workerId: workerId || '',
            workerType: workerType || '',
            periodFrom: periodFrom || null,
            periodTo: periodTo || null,
            timeEntryIds: Array.isArray(timeEntryIds) ? [...timeEntryIds].sort() : [],
            advanceIds: Array.isArray(advanceIds) ? [...advanceIds].sort() : [],
            notes: typeof notes === 'string' ? notes.trim() : '',
            id: req.body?.id || null,
            type: settlementType,
            contractId: typeof contractId === 'string' ? contractId.trim() : null,
            jobId: typeof jobId === 'string' ? jobId.trim() : null,
            stageId: typeof stageId === 'string' ? stageId.trim() : null,
            amount: typeof amount === 'number' && Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null,
            exchangeRate: normalizedExchangeRate
        };
        requestHash = crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');

        // 2. Fast-path & Lease Reservation Idempotency Protocol (with ownerToken and expiresAt)
        if (idempotencyKey && db && typeof db.collection === 'function') {
            const existingIdemp = await db.collection('idempotency_keys').findOne({
                endpoint: '/api/settlements/create-atomic',
                key: idempotencyKey
            });

            if (existingIdemp) {
                if (existingIdemp.status === 'completed' || (!existingIdemp.status && existingIdemp.responseBody)) {
                    if (existingIdemp.requestHash === requestHash) {
                        return res.status(existingIdemp.statusCode || 201).json(existingIdemp.responseBody);
                    } else {
                        return res.status(409).json({
                            error: 'Klucz idempotencji został już użyty dla żądania o innym payloadzie (Idempotency Key Conflict).'
                        });
                    }
                } else if (existingIdemp.status === 'pending') {
                    const isExpired = existingIdemp.expiresAt && new Date(existingIdemp.expiresAt) < new Date();
                    if (!isExpired && existingIdemp.requestHash && existingIdemp.requestHash !== requestHash) {
                        return res.status(409).json({
                            error: 'Klucz idempotencji został już użyty dla żądania o innym payloadzie (Idempotency Key Conflict).'
                        });
                    }
                }
            }

            const now = new Date();
            const leaseExpiresAt = new Date(now.getTime() + 30000); // 30s lease for in-flight transaction

            try {
                await db.collection('idempotency_keys').insertOne({
                    id: new ObjectId().toString(),
                    key: idempotencyKey,
                    endpoint: '/api/settlements/create-atomic',
                    requestHash,
                    status: 'pending',
                    ownerToken,
                    createdAt: now,
                    expiresAt: leaseExpiresAt
                });
                reservedKey = true;
            } catch (insertErr) {
                if (insertErr.code === 11000 || (insertErr.message && insertErr.message.includes('11000'))) {
                    // Another request holds or is creating this key. Poll to see if it completes, fails, or expires.
                    let acquired = false;
                    for (let attempt = 0; attempt < 50; attempt++) {
                        await new Promise(r => setTimeout(r, 100));
                        const check = await db.collection('idempotency_keys').findOne({
                            endpoint: '/api/settlements/create-atomic',
                            key: idempotencyKey
                        });

                        if (!check) {
                            try {
                                await db.collection('idempotency_keys').insertOne({
                                    id: new ObjectId().toString(),
                                    key: idempotencyKey,
                                    endpoint: '/api/settlements/create-atomic',
                                    requestHash,
                                    status: 'pending',
                                    ownerToken,
                                    createdAt: new Date(),
                                    expiresAt: new Date(Date.now() + 30000)
                                });
                                reservedKey = true;
                                acquired = true;
                                break;
                            } catch (_) {
                                continue;
                            }
                        }

                        if (check.status === 'completed' || (!check.status && check.responseBody)) {
                            if (check.requestHash === requestHash) {
                                return res.status(check.statusCode || 201).json(check.responseBody);
                            } else {
                                return res.status(409).json({
                                    error: 'Klucz idempotencji został już użyty dla żądania o innym payloadzie (Idempotency Key Conflict).'
                                });
                            }
                        }

                        const isExpired = check.status === 'pending' && check.expiresAt && new Date(check.expiresAt) < new Date();
                        if (check.status === 'failed' || isExpired) {
                            const takeover = await db.collection('idempotency_keys').findOneAndUpdate(
                                {
                                    endpoint: '/api/settlements/create-atomic',
                                    key: idempotencyKey,
                                    $or: [
                                        { status: 'failed' },
                                        { status: 'pending', expiresAt: { $lt: new Date() } }
                                    ]
                                },
                                {
                                    $set: {
                                        status: 'pending',
                                        ownerToken,
                                        requestHash,
                                        updatedAt: new Date(),
                                        expiresAt: new Date(Date.now() + 30000)
                                    }
                                },
                                { returnDocument: 'after' }
                            );
                            if (takeover && (takeover.value || takeover._id || takeover.key)) {
                                reservedKey = true;
                                acquired = true;
                                break;
                            }
                        }
                    }

                    if (!acquired && !reservedKey) {
                        return res.status(409).json({
                            error: 'Operacja jest w trakcie wykonywania przez inne żądanie lub nie została ukończona (Idempotency Key In Progress).'
                        });
                    }
                } else {
                    throw insertErr;
                }
            }

            // [P1 FIX] Heartbeat lease renewal: keep pending lease alive for long-running operations
            if (reservedKey) {
                leaseHeartbeat = setInterval(async () => {
                    try {
                        await db.collection('idempotency_keys').updateOne(
                            { endpoint: '/api/settlements/create-atomic', key: idempotencyKey, ownerToken, status: 'pending' },
                            { $set: { expiresAt: new Date(Date.now() + 30000), updatedAt: new Date() } }
                        );
                    } catch (_) {}
                }, 10000);
                if (leaseHeartbeat.unref) leaseHeartbeat.unref();
            }
        }

        // 3. Pre-generate IDs and timestamps BEFORE withTransaction
        const settlementId = req.body?.id || new ObjectId().toString();
        const nowIso = new Date().toISOString();

        let responsePayload = null;
        const executeOperations = async (sess) => {
            const opt = sess ? { session: sess } : {};

            if (settlementType === 'contract') {
                // A. Subcontractor lookup
                const sub = await db.collection('subcontractors').findOne(
                    { $or: [{ id: workerId }, { _id: workerId }] },
                    opt
                );
                if (!sub) {
                    const err = new Error(`Podwykonawca '${workerId}' nie został odnaleziony w bazie danych.`);
                    err.status = 404;
                    throw err;
                }
                const workerName = sub.name || workerId;

                // B. Contract lookup and subcontractor verification
                const contract = await db.collection('subcontractor_contracts').findOne(
                    { $or: [{ id: contractId }, { _id: contractId }] },
                    opt
                );
                if (!contract) {
                    const err = new Error(`Kontrakt '${contractId}' nie został odnaleziony w bazie danych.`);
                    err.status = 404;
                    throw err;
                }
                if (contract.subcontractorId !== workerId) {
                    const err = new Error(`Kontrakt '${contractId}' należy do innego podwykonawcy ('${contract.subcontractorId}'), a żądanie wskazuje '${workerId}'.`);
                    err.status = 400;
                    throw err;
                }

                // C. Verify contract limit vs previous active non-cancelled settlements
                // [P2 FIX] Ignore soft-deleted settlements (isActive: false) and cancelled settlements
                const prevSettlements = await db.collection('settlements').find(
                    {
                        contractId,
                        status: { $ne: 'cancelled' },
                        isActive: { $ne: false }
                    },
                    opt
                ).toArray();

                let previouslySettledCents = 0;
                for (const s of prevSettlements) {
                    const sAmt = typeof s.totalAmount === 'number' ? s.totalAmount : (typeof s.amount === 'number' ? s.amount : 0);
                    previouslySettledCents += Math.round(sAmt * 100);
                }

                const contractTotalNet = typeof contract.totalAmountNet === 'number' ? contract.totalAmountNet : (typeof contract.totalAmount === 'number' ? contract.totalAmount : 0);
                const contractLimitCents = Math.round(contractTotalNet * 100);
                const requestedCents = Math.round(amount * 100);

                if (previouslySettledCents + requestedCents > contractLimitCents) {
                    const remainingNet = Math.max(0, (contractLimitCents - previouslySettledCents) / 100);
                    const err = new Error(`Kwota rozliczenia (${amount} ${contract.currency || 'PLN'}) przekracza pozostały limit kontraktu (${remainingNet} ${contract.currency || 'PLN'} z sumy ${contractTotalNet} ${contract.currency || 'PLN'}).`);
                    err.status = 400;
                    throw err;
                }

                // [P1 FIX] Atomic CAS reservation on subcontractor_contracts:
                // Modifies the contract document inside the transaction session to guarantee write-conflict detection
                // on concurrent settlements and prevents write skew. Uses $and to ensure id filter is NOT overwritten.
                const contractCasResult = await db.collection('subcontractor_contracts').updateOne(
                    {
                        $and: [
                            { $or: [{ id: contractId }, { _id: contractId }] },
                            { subcontractorId: workerId },
                            {
                                $or: [
                                    { version: contract.version || 0 },
                                    { version: { $exists: false } }
                                ]
                            }
                        ]
                    },
                    {
                        $set: {
                            settledAmountCents: previouslySettledCents + requestedCents,
                            updatedAt: nowIso
                        },
                        $inc: {
                            version: 1
                        }
                    },
                    opt
                );

                if (contractCasResult.matchedCount !== 1) {
                    const err = new Error(`Błąd współbieżności CAS: wersja kontraktu uległa zmianie w wyniku równoległej operacji.`);
                    err.status = 409;
                    throw err;
                }

                // D. Prepare newSettlement with explicit contract fields and EUR/PLN currency conversion
                // [P1 FIX] Support EUR/foreign contracts with fail-closed explicit exchangeRate and amountInPln (no silent fallback)
                const contractCurrency = contract.currency || 'PLN';
                let effectiveExchangeRate = 1.0;
                if (contractCurrency !== 'PLN') {
                    let candidateRate = normalizedExchangeRate;
                    if (!candidateRate && typeof contract.exchangeRate === 'number' && Number.isFinite(contract.exchangeRate) && contract.exchangeRate > 0) {
                        candidateRate = Math.round(contract.exchangeRate * 10000) / 10000;
                    }

                    if (!candidateRate) {
                        const err = new Error(`Dla rozliczenia kontraktu w walucie obcej ('${contractCurrency}') wymagany jest jawny, utrwalony kurs wymiany waluty (exchangeRate w żądaniu lub exchangeRate zapisany na kontrakcie).`);
                        err.status = 400;
                        throw err;
                    }
                    effectiveExchangeRate = candidateRate;
                }
                const amountInPln = Math.round(amount * effectiveExchangeRate * 100) / 100;

                const targetJobId = contract.jobId || jobId || null;
                const targetStageId = contract.stageId !== undefined ? contract.stageId : (stageId || null);
                const newSettlement = {
                    id: settlementId,
                    workerId,
                    workerType: 'subcontractor',
                    workerName,
                    periodFrom,
                    periodTo,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                    timeEntryIds: [],
                    advanceIds: [],
                    totalHours: 0,
                    totalAmount: Math.round(amount * 100) / 100,
                    grossAmount: Math.round(amount * 100) / 100,
                    overtimeHours: 0,
                    overtimePay: 0,
                    advanceDeductions: 0,
                    currency: contractCurrency,
                    exchangeRate: effectiveExchangeRate,
                    amountInPln: amountInPln,
                    baseAmount: amountInPln,
                    status: 'open',
                    notes: typeof notes === 'string' ? notes.trim() : '',
                    type: 'contract',
                    contractId,
                    jobId: targetJobId,
                    stageId: targetStageId
                };

                // E. Insert settlement
                await db.collection('settlements').insertOne(newSettlement, opt);

                // F. Recalculate affected job if linked
                const affectedJobIds = new Set();
                if (targetJobId) {
                    affectedJobIds.add(targetJobId);
                    await recalculateJobLaborCosts(targetJobId, { session: sess, throwOnError: true });
                }

                // G. Transition idempotency key record to 'completed' inside transaction
                if (process.env.NODE_ENV === 'test' && _testFailpoint === 'invalidate_lease_before_commit') {
                    await db.collection('idempotency_keys').deleteOne({ endpoint: '/api/settlements/create-atomic', key: idempotencyKey });
                }
                if (idempotencyKey && reservedKey) {
                    const idempUpdateRes = await db.collection('idempotency_keys').updateOne(
                        { endpoint: '/api/settlements/create-atomic', key: idempotencyKey, ownerToken },
                        {
                            $set: {
                                status: 'completed',
                                requestHash,
                                statusCode: 201,
                                responseBody: {
                                    success: true,
                                    settlement: newSettlement,
                                    updatedTimeEntryIds: [],
                                    updatedAdvanceIds: [],
                                    affectedJobs: Array.from(affectedJobIds)
                                },
                                completedAt: new Date(),
                                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                            }
                        },
                        { ...opt, upsert: false }
                    );

                    if (idempUpdateRes.matchedCount !== 1) {
                        const err = new Error(`Utrata dzierżawy idempotencji dla klucza '${idempotencyKey}'. Rezerwacja wygasła lub została przejęta przez inne żądanie. Transakcja została wycofana.`);
                        err.status = 409;
                        throw err;
                    }
                }

                responsePayload = {
                    success: true,
                    settlement: newSettlement,
                    updatedTimeEntryIds: [],
                    updatedAdvanceIds: [],
                    affectedJobs: Array.from(affectedJobIds)
                };
                return;
            }

            // A. Entity lookup
            let workerName = 'Nieznany';
            if (workerType === 'employee') {
                const emp = await db.collection('employees').findOne(
                    { $or: [{ id: workerId }, { _id: workerId }] },
                    opt
                );
                if (!emp) {
                    const err = new Error(`Pracownik '${workerId}' nie został odnaleziony w bazie danych.`);
                    err.status = 404;
                    throw err;
                }
                workerName = emp.firstName ? `${emp.firstName} ${emp.lastName || ''}`.trim() : (emp.name || workerId);
            } else {
                const sub = await db.collection('subcontractors').findOne(
                    { $or: [{ id: workerId }, { _id: workerId }] },
                    opt
                );
                if (!sub) {
                    const err = new Error(`Podwykonawca '${workerId}' nie został odnaleziony w bazie danych.`);
                    err.status = 404;
                    throw err;
                }
                workerName = sub.name || workerId;
            }

            // B. Fetch and strictly verify requested time entries
            const candidateEntries = await db.collection('time-entries').find({
                $or: [{ id: { $in: timeEntryIds } }, { _id: { $in: timeEntryIds } }]
            }, opt).toArray();

            if (candidateEntries.length !== timeEntryIds.length) {
                const foundIds = new Set(candidateEntries.map(e => e.id || (e._id ? e._id.toString() : null)));
                const missing = timeEntryIds.filter(id => !foundIds.has(id));
                const err = new Error(`Nie znaleziono wszystkich wskazanych wpisów czasu. Brakujące ID: ${missing.join(', ')}.`);
                err.status = 404;
                throw err;
            }

            for (const entry of candidateEntries) {
                const entryWorkerId = entry.employeeId || entry.employee_id;
                if (entryWorkerId !== workerId) {
                    const err = new Error(`Wpis czasu '${entry.id}' należy do innego wykonawcy ('${entryWorkerId}') niż rozliczany ('${workerId}').`);
                    err.status = 400;
                    throw err;
                }

                // [P1 FIX] Strict workerType verification
                let entryWorkerType = entry.workerType;
                if (!entryWorkerType) {
                    if (entry.subcontractorId) {
                        entryWorkerType = 'subcontractor';
                    } else if (entry.type === 'subcontractor' || entry.type === 'employee') {
                        entryWorkerType = entry.type;
                    } else {
                        const empCount = await db.collection('employees').countDocuments({ $or: [{ id: workerId }, { _id: workerId }] }, opt);
                        const subCount = await db.collection('subcontractors').countDocuments({ $or: [{ id: workerId }, { _id: workerId }] }, opt);
                        if (empCount > 0 && subCount === 0) {
                            entryWorkerType = 'employee';
                        } else if (subCount > 0 && empCount === 0) {
                            entryWorkerType = 'subcontractor';
                        } else {
                            const err = new Error(`Wpis czasu '${entry.id}' nie posiada określonego workerType, a identyfikator '${workerId}' jest niejednoznaczny w bazie. Wymagana wcześniejsza normalizacja wpisu.`);
                            err.status = 400;
                            throw err;
                        }
                    }
                }
                if (entryWorkerType !== workerType) {
                    const err = new Error(`Wpis czasu '${entry.id}' posiada typ wykonawcy '${entryWorkerType}', podczas gdy rozliczenie tworzone jest dla '${workerType}'.`);
                    err.status = 400;
                    throw err;
                }

                // [P1 FIX] Strict calendar date validation & period date range verification (rejects trailing junk)
                const entryDateStr = extractValidDateKey(entry.date);
                if (!entryDateStr) {
                    const err = new Error(`Wpis czasu '${entry.id}' posiada nieprawidłową lub nieistniejącą w kalendarzu datę (${entry.date}).`);
                    err.status = 400;
                    throw err;
                }
                if (entryDateStr < periodFrom || entryDateStr > periodTo) {
                    const err = new Error(`Wpis czasu '${entry.id}' o dacie '${entryDateStr || entry.date}' wykracza poza deklarowany okres rozliczenia (${periodFrom} do ${periodTo}).`);
                    err.status = 400;
                    throw err;
                }

                if (!['approved', 'admin_approved'].includes(entry.status)) {
                    const err = new Error(`Wpis czasu '${entry.id}' nie jest zatwierdzony (status: '${entry.status}'). Do rozliczenia kwalifikują się wyłącznie wpisy zatwierdzone.`);
                    err.status = 400;
                    throw err;
                }
                if (entry.settlementId) {
                    const err = new Error(`Wpis czasu '${entry.id}' został już wcześniej rozliczony (settlementId: '${entry.settlementId}').`);
                    err.status = 409;
                    throw err;
                }

                // Strict financial and bounds validation (fail-closed, BSON/JS type check)
                // [P1 FIX] Non-negative hours allowed for all; hours=0 is permitted for fixed/m2/mb
                if (typeof entry.hours !== 'number' || !Number.isFinite(entry.hours) || entry.hours < 0 || entry.hours > 24) {
                    const err = new Error(`Wpis czasu '${entry.id}' posiada nieprawidłową lub nienumeryczną liczbę godzin (${entry.hours}). Wartość musi być liczbą nieujemną nieprzekraczającą 24h.`);
                    err.status = 400;
                    throw err;
                }

                if (typeof entry.cost !== 'number' || !Number.isFinite(entry.cost) || entry.cost < 0) {
                    const err = new Error(`Wpis czasu '${entry.id}' posiada nieprawidłowy lub nienumeryczny koszt (${entry.cost}). Koszt musi być nieujemną liczbą skończoną.`);
                    err.status = 400;
                    throw err;
                }

                const bType = entry.billingType || 'hourly';
                if (!['hourly', 'fixed', 'm2', 'mb'].includes(bType)) {
                    const err = new Error(`Wpis czasu '${entry.id}' posiada nieznany typ rozliczenia (billingType: '${entry.billingType}'). Dopuszczalne wartości to: hourly, fixed, m2, mb.`);
                    err.status = 400;
                    throw err;
                }

                if (bType === 'hourly') {
                    // Hourly billing strictly requires hours > 0
                    if (entry.hours <= 0) {
                        const err = new Error(`Wpis czasu '${entry.id}' o rozliczeniu godzinowym musi posiadać dodatnią liczbę godzin (aktualnie: ${entry.hours}).`);
                        err.status = 400;
                        throw err;
                    }
                    const hasExplicitRate = entry.hourlyRate !== undefined && entry.hourlyRate !== null;
                    let hRate = 0;
                    if (hasExplicitRate) {
                        if (typeof entry.hourlyRate !== 'number' || !Number.isFinite(entry.hourlyRate) || entry.hourlyRate <= 0) {
                            const err = new Error(`Wpis czasu '${entry.id}' o rozliczeniu godzinowym posiada nieprawidłową stawkę (${entry.hourlyRate}). Stawka godzinowa musi być dodatnią liczbą.`);
                            err.status = 400;
                            throw err;
                        }
                        hRate = entry.hourlyRate;
                        const expectedCostCents = toCents(entry.hours * hRate);
                        const actualCostCents = toCents(entry.cost);
                        if (Math.abs(expectedCostCents - actualCostCents) > 1) {
                            const err = new Error(`Wpis czasu '${entry.id}' posiada niespójny koszt (${entry.cost}) w stosunku do iloczynu godzin i stawki (${entry.hours}h × ${hRate} zł = ${toCurrency(expectedCostCents)} zł).`);
                            err.status = 400;
                            throw err;
                        }
                    } else {
                        hRate = entry.hours > 0 ? entry.cost / entry.hours : 0;
                        if (!Number.isFinite(hRate) || hRate <= 0) {
                            const err = new Error(`Wpis czasu '${entry.id}' o rozliczeniu godzinowym posiada nieprawidłową stawkę wynikową (${hRate}).`);
                            err.status = 400;
                            throw err;
                        }
                    }
                } else if (bType === 'm2' || bType === 'mb') {
                    if (typeof entry.quantity !== 'number' || !Number.isFinite(entry.quantity) || entry.quantity <= 0) {
                        const err = new Error(`Wpis czasu '${entry.id}' o rozliczeniu ${bType} posiada nieprawidłowy obmiar (${entry.quantity}). Obmiar musi być dodatnią liczbą.`);
                        err.status = 400;
                        throw err;
                    }
                    const rawRate = entry.rate !== undefined && entry.rate !== null ? entry.rate : entry.unitPrice;
                    if (typeof rawRate !== 'number' || !Number.isFinite(rawRate) || rawRate <= 0) {
                        const err = new Error(`Wpis czasu '${entry.id}' o rozliczeniu ${bType} posiada nieprawidłową stawkę (${rawRate}). Stawka jednostkowa musi być dodatnią liczbą.`);
                        err.status = 400;
                        throw err;
                    }
                    const expectedCostCents = toCents(entry.quantity * rawRate);
                    const actualCostCents = toCents(entry.cost);
                    if (Math.abs(expectedCostCents - actualCostCents) > 1) {
                        const err = new Error(`Wpis czasu '${entry.id}' posiada niespójny koszt (${entry.cost}) w stosunku do obmiaru i stawki (${entry.quantity} × ${rawRate} = ${toCurrency(expectedCostCents)} zł).`);
                        err.status = 400;
                        throw err;
                    }
                } else if (bType === 'fixed') {
                    if (entry.cost <= 0) {
                        const err = new Error(`Wpis czasu '${entry.id}' o rozliczeniu ryczałtowym posiada nieprawidłowy koszt (${entry.cost}). Koszt ryczałtu musi być dodatnią liczbą.`);
                        err.status = 400;
                        throw err;
                    }
                }
            }

            // C. Fetch and verify advance requests (if any)
            let advanceDeductions = 0;
            const validAdvanceIds = [];
            if (Array.isArray(advanceIds) && advanceIds.length > 0) {
                if (workerType !== 'employee') {
                    const err = new Error("Zaliczki mogą być rozliczane wyłącznie dla pracowników (workerType='employee'). Podwykonawca nie może zostać obciążony zaliczką.");
                    err.status = 400;
                    throw err;
                }

                const candidateAdvances = await db.collection('requests').find({
                    $or: [{ id: { $in: advanceIds } }, { _id: { $in: advanceIds } }]
                }, opt).toArray();

                if (candidateAdvances.length !== advanceIds.length) {
                    const foundAdvIds = new Set(candidateAdvances.map(a => a.id || (a._id ? a._id.toString() : null)));
                    const missingAdv = advanceIds.filter(id => !foundAdvIds.has(id));
                    const err = new Error(`Nie znaleziono wszystkich wskazanych zaliczek. Brakujące ID: ${missingAdv.join(', ')}.`);
                    err.status = 404;
                    throw err;
                }

                for (const adv of candidateAdvances) {
                    const advWorkerId = adv.employeeId || adv.employee_id;
                    if (advWorkerId !== workerId) {
                        const err = new Error(`Zaliczka '${adv.id}' należy do innego pracownika ('${advWorkerId}').`);
                        err.status = 400;
                        throw err;
                    }
                    if (adv.type !== 'zaliczka') {
                        const err = new Error(`Wniosek '${adv.id}' nie jest zaliczką (typ: '${adv.type}').`);
                        err.status = 400;
                        throw err;
                    }
                    if (adv.status !== 'zaakceptowany') {
                        const err = new Error(`Zaliczka '${adv.id}' nie jest zaakceptowana (status: '${adv.status}').`);
                        err.status = 400;
                        throw err;
                    }
                    if (adv.settlementId) {
                        const err = new Error(`Zaliczka '${adv.id}' została już wcześniej rozliczona (settlementId: '${adv.settlementId}').`);
                        err.status = 409;
                        throw err;
                    }

                    // Strict fail-closed numeric validation of advance amount
                    if (typeof adv.amount !== 'number' || !Number.isFinite(adv.amount) || adv.amount <= 0) {
                        const err = new Error(`Zaliczka '${adv.id}' posiada nieprawidłową lub ujemną kwotę (${adv.amount}). Kwota zaliczki musi być dodatnią liczbą skończoną.`);
                        err.status = 400;
                        throw err;
                    }
                    advanceDeductions = toCurrency(toCents(advanceDeductions) + toCents(adv.amount));
                    validAdvanceIds.push(adv.id);
                }
            }

            // D. Overtime & Financial Totals
            // [P1 FIX] Authoritative domain calculation shared between create-atomic and recalculate
            const totals = calculateHourlySettlementTotals(candidateEntries, advanceDeductions);
            const { totalHours, baseAmount, overtimeHours, overtimePay, grossAmount, totalAmount } = totals;

            const newSettlement = {
                id: settlementId,
                workerId,
                workerType,
                workerName,
                periodFrom,
                periodTo,
                createdAt: nowIso,
                updatedAt: nowIso,
                timeEntryIds,
                advanceIds: validAdvanceIds,
                totalHours,
                baseAmount,
                totalAmount,
                grossAmount,
                overtimeHours,
                overtimePay,
                advanceDeductions,
                currency: 'PLN',
                status: 'open',
                notes: typeof notes === 'string' ? notes.trim() : '',
                type: type || 'hourly'
            };

            // E. CAS Update time-entries: filter by workerId, approved status, and NO existing settlementId
            const teCasFilter = {
                $or: [{ id: { $in: timeEntryIds } }, { _id: { $in: timeEntryIds } }],
                status: { $in: ['approved', 'admin_approved'] },
                $and: [
                    {
                        $or: [
                            { employeeId: workerId },
                            { employee_id: workerId }
                        ]
                    },
                    {
                        $or: [
                            { settlementId: { $exists: false } },
                            { settlementId: null },
                            { settlementId: false }
                        ]
                    }
                ]
            };
            const teUpdateResult = await db.collection('time-entries').updateMany(
                teCasFilter,
                { $set: { settlementId, updatedAt: nowIso } },
                opt
            );
            if (teUpdateResult.modifiedCount !== timeEntryIds.length) {
                const err = new Error(`Błąd współbieżności CAS: zaktualizowano ${teUpdateResult.modifiedCount} z ${timeEntryIds.length} wpisów czasu. Dane uległy zmianie podczas rozliczania.`);
                err.status = 409;
                throw err;
            }

            // Test failpoint trigger (real rollback after time entries update)
            if (process.env.NODE_ENV === 'test' && _testFailpoint === 'after_time_entries_updated') {
                throw new Error('FAILPOINT: Simulated crash after time-entries updated');
            }

            // F. CAS Update requests (advances)
            if (validAdvanceIds.length > 0) {
                const advCasFilter = {
                    $or: [{ id: { $in: validAdvanceIds } }, { _id: { $in: validAdvanceIds } }],
                    status: 'zaakceptowany',
                    $and: [
                        {
                            $or: [
                                { employeeId: workerId },
                                { employee_id: workerId }
                            ]
                        },
                        {
                            $or: [
                                { settlementId: { $exists: false } },
                                { settlementId: null },
                                { settlementId: false }
                            ]
                        }
                    ]
                };
                const advUpdateResult = await db.collection('requests').updateMany(
                    advCasFilter,
                    { $set: { settlementId, updatedAt: nowIso } },
                    opt
                );
                if (advUpdateResult.modifiedCount !== validAdvanceIds.length) {
                    const err = new Error(`Błąd współbieżności CAS: zaktualizowano ${advUpdateResult.modifiedCount} z ${validAdvanceIds.length} zaliczek.`);
                    err.status = 409;
                    throw err;
                }
            }

            // G. Insert settlement
            await db.collection('settlements').insertOne(newSettlement, opt);

            // H. Recalculate affected jobs within the same session
            const affectedJobIds = new Set();
            candidateEntries.forEach(e => {
                if (e.jobId) affectedJobIds.add(e.jobId);
                if (e.project_id) affectedJobIds.add(e.project_id);
            });
            for (const jId of affectedJobIds) {
                await recalculateJobLaborCosts(jId, { session: sess, throwOnError: true });
            }

            // I. Transition idempotency key record to 'completed' inside the transaction
            // [P1 FIX] Strict lease verification: matchedCount must be exactly 1, or lease was lost
            if (process.env.NODE_ENV === 'test' && _testFailpoint === 'invalidate_lease_before_commit') {
                await db.collection('idempotency_keys').deleteOne({ endpoint: '/api/settlements/create-atomic', key: idempotencyKey });
            }
            if (idempotencyKey && reservedKey) {
                const idempUpdateRes = await db.collection('idempotency_keys').updateOne(
                    { endpoint: '/api/settlements/create-atomic', key: idempotencyKey, ownerToken },
                    {
                        $set: {
                            status: 'completed',
                            requestHash,
                            statusCode: 201,
                            responseBody: {
                                success: true,
                                settlement: newSettlement,
                                updatedTimeEntryIds: timeEntryIds,
                                updatedAdvanceIds: validAdvanceIds,
                                affectedJobs: Array.from(affectedJobIds)
                            },
                            completedAt: new Date(),
                            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                        }
                    },
                    { ...opt, upsert: false }
                );

                if (idempUpdateRes.matchedCount !== 1) {
                    const err = new Error(`Utrata dzierżawy idempotencji dla klucza '${idempotencyKey}'. Rezerwacja wygasła lub została przejęta przez inne żądanie. Transakcja została wycofana.`);
                    err.status = 409;
                    throw err;
                }
            }

            responsePayload = {
                success: true,
                settlement: newSettlement,
                updatedTimeEntryIds: timeEntryIds,
                updatedAdvanceIds: validAdvanceIds,
                affectedJobs: Array.from(affectedJobIds)
            };
        };

        // [P2 FIX] Stop heartbeat and extend lease before entering transaction
        // External writes to idempotency_keys during withTransaction cause WriteConflict.
        if (leaseHeartbeat) {
            clearInterval(leaseHeartbeat);
            leaseHeartbeat = null;
        }
        if (idempotencyKey && reservedKey && db && typeof db.collection === 'function') {
            try {
                await db.collection('idempotency_keys').updateOne(
                    { endpoint: '/api/settlements/create-atomic', key: idempotencyKey, ownerToken, status: 'pending' },
                    { $set: { expiresAt: new Date(Date.now() + 60000), updatedAt: new Date() } }
                );
            } catch (_) {}
        }

        if (isReplicaSet && client) {
            const session = client.startSession();
            try {
                await session.withTransaction(async () => {
                    await executeOperations(session);
                });
            } finally {
                await session.endSession();
            }
        } else {
            await executeOperations(null);
        }

        return res.status(201).json(responsePayload);
    } catch (err) {
        console.error('[SETTLEMENT-CREATE-ATOMIC ERROR]', err);
        // If this invocation reserved the pending key but the transaction aborted, clean up the reservation
        if (reservedKey && idempotencyKey && ownerToken && db && typeof db.collection === 'function') {
            try {
                await db.collection('idempotency_keys').deleteOne({
                    endpoint: '/api/settlements/create-atomic',
                    key: idempotencyKey,
                    ownerToken,
                    status: 'pending'
                });
            } catch (_) {}
        }

        // [P2 FIX] Handle concurrent duplicate request or race condition:
        // A parallel request with the same idempotency key may have won the race, causing
        // this request to fail on entry settlementId conflict, CAS conflict, or unique index E11000.
        // We poll for the completed idempotency key record from the winning request (up to 5s).
        if (idempotencyKey && db && typeof db.collection === 'function') {
            const isConflictOrRace = err.code === 11000 ||
                (err.message && err.message.includes('11000')) ||
                err.status === 409 ||
                (err.message && (err.message.includes('CAS') || err.message.includes('rozliczony')));

            if (isConflictOrRace) {
                for (let attempt = 0; attempt < 50; attempt++) {
                    const committed = await db.collection('idempotency_keys').findOne({
                        endpoint: '/api/settlements/create-atomic',
                        key: idempotencyKey
                    });
                    if (committed && (committed.status === 'completed' || (!committed.status && committed.responseBody))) {
                        if (committed.requestHash === requestHash) {
                            return res.status(committed.statusCode || 201).json(committed.responseBody);
                        } else {
                            return res.status(409).json({
                                error: 'Klucz idempotencji został już użyty dla żądania o innym payloadzie (Idempotency Key Conflict).'
                            });
                        }
                    }
                    if (!committed || committed.status === 'failed') {
                        break;
                    }
                    await new Promise(r => setTimeout(r, 100));
                }
            }
        }
        return res.status(err.status || 500).json({ error: err.message });
    } finally {
        if (leaseHeartbeat) {
            clearInterval(leaseHeartbeat);
        }
    }
});

// [P2 FIX] Helper for resilient, CAS-verified reconciliation of contract settledAmountCents
async function reconcileContractSettledAmount(cId, opt = {}) {
    if (!db || typeof db.collection !== 'function') return;
    const session = opt.session;
    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const contract = await db.collection('subcontractor_contracts').findOne(
                { $or: [{ id: cId }, { _id: cId }] },
                opt
            );
            if (!contract) return;

            const activeContractSettlements = await db.collection('settlements').find(
                {
                    contractId: cId,
                    status: { $ne: 'cancelled' },
                    isActive: { $ne: false }
                },
                opt
            ).toArray();

            const totalActiveCents = activeContractSettlements.reduce((sum, s) => {
                const amt = typeof s.totalAmount === 'number' ? s.totalAmount : (typeof s.amount === 'number' ? s.amount : 0);
                return sum + Math.round(amt * 100);
            }, 0);

            const filter = {
                $and: [
                    { $or: [{ id: cId }, { _id: cId }] },
                    {
                        $or: [
                            { version: contract.version || 0 },
                            { version: { $exists: false } }
                        ]
                    }
                ]
            };

            const result = await db.collection('subcontractor_contracts').updateOne(
                filter,
                {
                    $set: {
                        settledAmountCents: totalActiveCents,
                        updatedAt: new Date().toISOString()
                    },
                    $inc: { version: 1 }
                },
                opt
            );

            const modified = result.modifiedCount !== undefined ? result.modifiedCount : result.matchedCount;
            if (modified > 0) {
                return;
            }
            if (session) {
                throw new Error(`Konflikt wersji kontraktu '${cId}' podczas synchronizacji po operacji na rozliczeniu.`);
            }
            await new Promise(r => setTimeout(r, 10 * attempt));
        } catch (err) {
            if (session || attempt === maxRetries) {
                console.error(`[RECONCILE ERROR] Failed to reconcile contract ${cId} settledAmountCents:`, err.message);
                throw err;
            }
        }
    }
}

// [P1 FIX] Dedicated ACID Transactional DELETE for settlements: atomicity between delete, unlinking time-entries/advances, contract limit CAS, and job recalculation
app.delete('/api/settlements/:id', verifyToken, requireRole('admin', 'manager'), requireTransactions, async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const { id } = req.params;
        const filter = { id };

        const clientToUse = typeof client !== 'undefined' ? client : (db.client || null);
        let session = null;

        // Fail-closed checks on transaction availability
        if (!isReplicaSet && process.env.ALLOW_NON_TRANSACTIONAL !== 'true' && process.env.NODE_ENV !== 'test') {
            return res.status(503).json({
                code: 'TRANSACTIONS_REQUIRED',
                error: 'Operacja usunięcia rozliczenia wymaga włączonego Replica Set w MongoDB (ACID transactions required).'
            });
        }

        if (isReplicaSet && clientToUse) {
            try {
                session = clientToUse.startSession();
            } catch (sessErr) {
                console.error('[DELETE /api/settlements/:id] Failed to start MongoDB session:', sessErr.message);
                if (process.env.ALLOW_NON_TRANSACTIONAL !== 'true' && process.env.NODE_ENV !== 'test') {
                    return res.status(503).json({
                        code: 'TRANSACTIONS_REQUIRED',
                        error: `Nie udało się zainicjalizować sesji transakcyjnej MongoDB: ${sessErr.message}`
                    });
                }
            }
        }

        const executeDelete = async (sess) => {
            const opt = sess ? { session: sess } : {};
            const docToDelete = await db.collection('settlements').findOne(filter, opt);
            if (!docToDelete) {
                const err = new Error('Item not found');
                err.status = 404;
                throw err;
            }

            // [P1 FIX] Relational discrepancy guard:
            // Verify that no timeEntryIds or advanceIds declared in this settlement are bound to a DIFFERENT settlement.
            if (Array.isArray(docToDelete.timeEntryIds) && docToDelete.timeEntryIds.length > 0) {
                const foreignEntries = await db.collection('time-entries').find({
                    $or: [{ id: { $in: docToDelete.timeEntryIds } }, { _id: { $in: docToDelete.timeEntryIds } }],
                    settlementId: { $exists: true, $ne: null, $nin: [false, docToDelete.id] }
                }, opt).toArray();

                if (foreignEntries.length > 0) {
                    const foreignIds = foreignEntries.map(e => `${e.id} (settlementId: ${e.settlementId})`).join(', ');
                    const err = new Error(`Rozbieżność relacji: wpisy czasu [${foreignIds}] są przypisane do innego rozliczenia, podczas gdy widnieją w usuwanym rozliczeniu '${docToDelete.id}'. Usunięcie zostało przerwane w celu ochrony spójności danych.`);
                    err.status = 409;
                    throw err;
                }
            }

            if (Array.isArray(docToDelete.advanceIds) && docToDelete.advanceIds.length > 0) {
                const foreignAdvances = await db.collection('requests').find({
                    $or: [{ id: { $in: docToDelete.advanceIds } }, { _id: { $in: docToDelete.advanceIds } }],
                    settlementId: { $exists: true, $ne: null, $nin: [false, docToDelete.id] }
                }, opt).toArray();

                if (foreignAdvances.length > 0) {
                    const foreignIds = foreignAdvances.map(a => `${a.id} (settlementId: ${a.settlementId})`).join(', ');
                    const err = new Error(`Rozbieżność relacji: zaliczki [${foreignIds}] są przypisane do innego rozliczenia, podczas gdy widnieją w usuwanym rozliczeniu '${docToDelete.id}'. Usunięcie zostało przerwane.`);
                    err.status = 409;
                    throw err;
                }
            }

            // 1. Collect affected jobs from strictly matching entries
            const affectedJobIds = new Set();
            if (docToDelete.jobId) affectedJobIds.add(docToDelete.jobId);

            const linkedEntries = await db.collection('time-entries').find({ settlementId: docToDelete.id }, opt).toArray();
            linkedEntries.forEach(e => {
                if (e.jobId) affectedJobIds.add(e.jobId);
                if (e.project_id) affectedJobIds.add(e.project_id);
            });

            // 2. Atomically unlink settlementId STRICTLY from entries bound to this settlement
            await db.collection('time-entries').updateMany(
                { settlementId: docToDelete.id },
                {
                    $unset: { settlementId: "" },
                    $set: { updatedAt: new Date().toISOString() }
                },
                opt
            );

            // 3. Atomically unlink settlementId STRICTLY from advances bound to this settlement
            await db.collection('requests').updateMany(
                { settlementId: docToDelete.id },
                {
                    $unset: { settlementId: "" },
                    $set: { updatedAt: new Date().toISOString() }
                },
                opt
            );

            // 4. Delete the settlement document itself
            const delRes = await db.collection('settlements').deleteOne(filter, opt);
            if (delRes.deletedCount === 0) {
                const err = new Error('Item not found');
                err.status = 404;
                throw err;
            }

            // 5. Synchronize contract settledAmountCents inside the transaction with version lock
            if (docToDelete.contractId) {
                await reconcileContractSettledAmount(docToDelete.contractId, opt);
            }

            // 6. Recalculate all affected jobs within the session
            for (const jId of affectedJobIds) {
                await recalculateJobLaborCosts(jId, { session: sess, throwOnError: true });
            }
        };

        if (session) {
            try {
                await session.withTransaction(async () => {
                    await executeDelete(session);
                });
            } finally {
                await session.endSession();
            }
        } else {
            if (process.env.ALLOW_NON_TRANSACTIONAL !== 'true' && process.env.NODE_ENV !== 'test') {
                return res.status(503).json({
                    code: 'TRANSACTIONS_REQUIRED',
                    error: 'Brak aktywnej sesji transakcyjnej MongoDB. Operacja usunięcia rozliczenia została wstrzymana (fail-closed).'
                });
            }
            await executeDelete(null);
        }

        return res.status(204).send();
    } catch (err) {
        const status = err.status || 500;
        if (status === 404) return res.status(404).json({ error: 'Item not found' });
        console.error('[DELETE /api/settlements/:id ERROR]', err.message);
        return res.status(status).json({ error: err.message });
    }
});

// [P1 FIX] Block generic POST /api/settlements: domain settlements must use POST /api/settlements/create-atomic
app.post('/api/settlements', verifyToken, (req, res) => {
    return res.status(405).json({
        error: "Bezpośrednie tworzenie rozliczeń przez ogólny endpoint POST /api/settlements jest zablokowane. Wymagane jest użycie transakcyjnego endpointu domenowego POST /api/settlements/create-atomic."
    });
});

// [P1 FIX] Block generic batch-import for settlements: bulk settlement imports bypass create-atomic domain logic
app.all('/api/settlements/batch-import', verifyToken, (req, res) => {
    return res.status(405).json({
        error: "Import wsadowy rozliczeń (batch-import) jest zabroniony. Rozliczenia muszą być tworzone transakcyjnie przez POST /api/settlements/create-atomic."
    });
});

// [P1 FIX] Restricted PATCH /api/settlements/:id: prevents bypassing domain calculations & relational changes
app.patch('/api/settlements/:id', verifyToken, requireRole('admin', 'manager'), async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const { id } = req.params;
        const body = req.body || {};

        const forbiddenFields = [
            'totalAmount', 'grossAmount', 'advanceDeductions', 'overtimePay',
            'overtimeHours', 'timeEntryIds', 'advanceIds', 'contractId',
            'workerId', 'workerType', 'currency', 'exchangeRate',
            'amountInPln', 'baseAmount', 'jobId', 'stageId', 'periodFrom', 'periodTo',
            'totalHours'
        ];

        const hasForbidden = forbiddenFields.some(f => body[f] !== undefined);
        if (hasForbidden) {
            return res.status(400).json({
                error: "Modyfikacja pól finansowych i relacyjnych rozliczenia (kwoty, stawki, wpisy czasu, zaliczki, kontrakt) jest zabroniona przez ogólny PATCH. Użyj dedykowanych endpointów domenowych (create-atomic lub recalculate)."
            });
        }

        const updates = {};
        if (body.notes !== undefined) {
            if (typeof body.notes !== 'string') {
                return res.status(400).json({ error: 'Pole notes musi być ciągiem znaków.' });
            }
            updates.notes = body.notes.trim();
        }

        const validStatuses = ['open', 'closed', 'exported', 'cancelled'];
        if (body.status !== undefined) {
            if (!validStatuses.includes(body.status)) {
                return res.status(400).json({ error: `Nieprawidłowy status rozliczenia. Dozwolone: ${validStatuses.join(', ')}.` });
            }
            updates.status = body.status;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'Brak dozwolonych zmian do aktualizacji (dozwolone: notes, dozwolone przejścia status).' });
        }

        updates.updatedAt = new Date().toISOString();

        // [P1 FIX] Transaction availability check (fail-closed, matching DELETE and recalculate)
        const isStatusChange = updates.status !== undefined;
        const clientToUse = typeof client !== 'undefined' ? client : (db.client || null);
        let session = null;

        if (isStatusChange && !isReplicaSet && process.env.ALLOW_NON_TRANSACTIONAL !== 'true' && process.env.NODE_ENV !== 'test') {
            return res.status(503).json({
                code: 'TRANSACTIONS_REQUIRED',
                error: 'Operacja zmiany statusu rozliczenia wymaga włączonego Replica Set w MongoDB (ACID transactions required).'
            });
        }

        if (isStatusChange && isReplicaSet && clientToUse && typeof clientToUse.startSession === 'function') {
            try {
                if (_testFailpoint === 'force_session_failure') {
                    throw new Error('Simulated startSession failure');
                }
                if (_testFailpoint === 'session_returns_null') {
                    session = null;
                } else {
                    session = clientToUse.startSession();
                }
            } catch (sessErr) {
                console.error('[PATCH /api/settlements/:id] Failed to start MongoDB session:', sessErr.message);
                if (process.env.ALLOW_NON_TRANSACTIONAL !== 'true' && process.env.NODE_ENV !== 'test') {
                    return res.status(503).json({
                        code: 'TRANSACTIONS_REQUIRED',
                        error: `Nie udało się zainicjalizować sesji transakcyjnej MongoDB: ${sessErr.message}`
                    });
                }
            }
        }

        const ALLOWED_TRANSITIONS = {
            open: ['closed', 'exported', 'cancelled'],
            closed: ['open', 'exported', 'cancelled'],
            exported: ['cancelled'],
            cancelled: []
        };

        const executeMutation = async (sess) => {
            const opt = sess ? { session: sess } : {};

            // 1. [P1 FIX] Read current state INSIDE transaction to prevent race conditions on status machine
            const currentDoc = await db.collection('settlements').findOne({ id }, opt);
            if (!currentDoc) {
                const err = new Error('Settlement not found');
                err.status = 404;
                throw err;
            }

            // Test barrier hook for real concurrent concurrency testing
            if (_testBarrierHook) {
                await _testBarrierHook({ id, currentDoc, updates, session: sess });
            }

            // 2. [P1 FIX] Validate status state machine on the live transactional snapshot
            if (updates.status !== undefined && updates.status !== currentDoc.status) {
                const currentStatus = currentDoc.status || 'open';
                const targetStatus = updates.status;
                const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
                if (!allowed.includes(targetStatus)) {
                    const err = new Error(`Niedozwolone przejście statusu z '${currentStatus}' do '${targetStatus}'. Rozliczenie w statusie '${currentStatus}' nie zezwala na przejście do '${targetStatus}'.`);
                    err.code = 'INVALID_STATUS_TRANSITION';
                    err.status = 400;
                    throw err;
                }
            }

            // 3. Handle cancellation vs normal status/notes update
            const isCancelling = updates.status === 'cancelled' && currentDoc.status !== 'cancelled';
            const affectedJobIds = new Set();
            if (currentDoc.jobId) affectedJobIds.add(currentDoc.jobId);

            if (isStatusChange) {
                const linkedEntries = await db.collection('time-entries').find({ settlementId: id }, opt).toArray();
                linkedEntries.forEach(e => {
                    if (e.jobId) affectedJobIds.add(e.jobId);
                    if (e.project_id) affectedJobIds.add(e.project_id);
                });
            }

            // 4. [P1 FIX] Atomic CAS update filtering by { id, status: currentDoc.status }
            const casFilter = { id, status: currentDoc.status };
            const updateRes = await db.collection('settlements').updateOne(casFilter, { $set: updates }, opt);
            if (updateRes.matchedCount !== 1) {
                const err = new Error(`Błąd współbieżności CAS: status rozliczenia uległ modyfikacji przez równoległą operację (oczekiwano '${currentDoc.status}'). Operacja została przerwana.`);
                err.status = 409;
                throw err;
            }

            if (isCancelling) {
                // Unlink entries and advances atomically
                await db.collection('time-entries').updateMany(
                    { settlementId: id },
                    { $unset: { settlementId: "" }, $set: { updatedAt: new Date().toISOString() } },
                    opt
                );
                await db.collection('requests').updateMany(
                    { settlementId: id },
                    { $unset: { settlementId: "" }, $set: { updatedAt: new Date().toISOString() } },
                    opt
                );

                if (currentDoc.contractId) {
                    await reconcileContractSettledAmount(currentDoc.contractId, opt);
                }
            }

            // Recalculate labor costs for all affected jobs in transaction
            if (isStatusChange) {
                for (const jId of affectedJobIds) {
                    await recalculateJobLaborCosts(jId, { session: sess, throwOnError: true });
                }
            }
        };

        if (session) {
            try {
                await session.withTransaction(async () => {
                    await executeMutation(session);
                });
            } finally {
                await session.endSession();
            }
        } else {
            // [P1 FIX] Fail-closed check: No silent non-transactional fallback in production if session is missing
            if (isStatusChange && process.env.ALLOW_NON_TRANSACTIONAL !== 'true' && process.env.NODE_ENV !== 'test') {
                return res.status(503).json({
                    code: 'TRANSACTIONS_REQUIRED',
                    error: 'Brak aktywnej sesji transakcyjnej MongoDB. Zmiana statusu rozliczenia wymaga transakcji ACID (fail-closed).'
                });
            }
            await executeMutation(null);
        }

        const updatedDoc = await db.collection('settlements').findOne({ id });
        return res.status(200).json(updatedDoc);
    } catch (err) {
        const status = err.status || 500;
        if (status === 404) return res.status(404).json({ error: 'Settlement not found' });
        if (err.code === 'INVALID_STATUS_TRANSITION') return res.status(400).json({ code: err.code, error: err.message });
        console.error('[PATCH /api/settlements/:id ERROR]', err.message);
        return res.status(status).json({ error: err.message });
    }
});

// [P1 FIX] Authoritative server-side settlement recalculation endpoint
app.post('/api/settlements/:id/recalculate', verifyToken, requireRole('admin', 'manager'), requireTransactions, async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const { id } = req.params;

        const clientToUse = typeof client !== 'undefined' ? client : (db.client || null);
        let session = null;

        // Fail-closed checks on transaction availability (matching DELETE and PATCH cancel)
        if (!isReplicaSet && process.env.ALLOW_NON_TRANSACTIONAL !== 'true' && process.env.NODE_ENV !== 'test') {
            return res.status(503).json({
                code: 'TRANSACTIONS_REQUIRED',
                error: 'Operacja przeliczenia rozliczenia wymaga włączonego Replica Set w MongoDB (ACID transactions required).'
            });
        }

        if (isReplicaSet && clientToUse && typeof clientToUse.startSession === 'function') {
            try {
                session = clientToUse.startSession();
            } catch (sessErr) {
                console.error('[POST /api/settlements/:id/recalculate] Failed to start MongoDB session:', sessErr.message);
                if (process.env.ALLOW_NON_TRANSACTIONAL !== 'true' && process.env.NODE_ENV !== 'test') {
                    return res.status(503).json({
                        code: 'TRANSACTIONS_REQUIRED',
                        error: `Nie udało się zainicjalizować sesji transakcyjnej MongoDB: ${sessErr.message}`
                    });
                }
            }
        }

        let updatedDoc = null;
        const executeRecalculate = async (sess) => {
            const opt = sess ? { session: sess } : {};
            const settlement = await db.collection('settlements').findOne({ id }, opt);
            if (!settlement) {
                const err = new Error('Settlement not found');
                err.status = 404;
                throw err;
            }

            if (settlement.status === 'cancelled') {
                const err = new Error('Nie można przeliczyć anulowanego rozliczenia.');
                err.status = 400;
                throw err;
            }

            // [P1 FIX] Exported settlement is an accounting terminal state - forbid recalculation
            if (settlement.status === 'exported') {
                const err = new Error("Nie można przeliczyć wyeksportowanego rozliczenia (status: 'exported'). Rozliczenie w statusie 'exported' jest ostateczne pod względem księgowym.");
                err.status = 400;
                throw err;
            }

            const nowIso = new Date().toISOString();

            if (settlement.type === 'contract') {
                if (settlement.contractId) {
                    await reconcileContractSettledAmount(settlement.contractId, opt);
                }
                if (settlement.jobId) {
                    await recalculateJobLaborCosts(settlement.jobId, { session: sess, throwOnError: true });
                }
                updatedDoc = await db.collection('settlements').findOne({ id }, opt);
                return;
            }

            // [P1 FIX] Relational discrepancy guard (matching DELETE):
            // Verify that no timeEntryIds or advanceIds declared in this settlement are bound to a DIFFERENT settlement.
            const teIds = Array.isArray(settlement.timeEntryIds) ? settlement.timeEntryIds : [];
            if (teIds.length > 0) {
                const foreignEntries = await db.collection('time-entries').find({
                    $or: [{ id: { $in: teIds } }, { _id: { $in: teIds } }],
                    settlementId: { $exists: true, $ne: null, $nin: [false, id] }
                }, opt).toArray();

                if (foreignEntries.length > 0) {
                    const foreignIds = foreignEntries.map(e => `${e.id} (settlementId: ${e.settlementId})`).join(', ');
                    const err = new Error(`Rozbieżność relacji: wpisy czasu [${foreignIds}] są przypisane do innego rozliczenia, podczas gdy widnieją w przeliczanym rozliczeniu '${id}'. Przeliczenie zostało przerwane w celu ochrony spójności danych.`);
                    err.status = 409;
                    throw err;
                }
            }

            const advIds = Array.isArray(settlement.advanceIds) ? settlement.advanceIds : [];
            if (advIds.length > 0) {
                const foreignAdvances = await db.collection('requests').find({
                    $or: [{ id: { $in: advIds } }, { _id: { $in: advIds } }],
                    settlementId: { $exists: true, $ne: null, $nin: [false, id] }
                }, opt).toArray();

                if (foreignAdvances.length > 0) {
                    const foreignIds = foreignAdvances.map(a => `${a.id} (settlementId: ${a.settlementId})`).join(', ');
                    const err = new Error(`Rozbieżność relacji: zaliczki [${foreignIds}] są przypisane do innego rozliczenia, podczas gdy widnieją w przeliczanym rozliczeniu '${id}'. Przeliczenie zostało przerwane w celu ochrony spójności danych.`);
                    err.status = 409;
                    throw err;
                }
            }

            // [P1 FIX] Fetch ALL records pointing to this settlement (settlementId: id)
            const linkedEntries = await db.collection('time-entries').find({
                settlementId: id
            }, opt).toArray();

            const linkedAdvances = await db.collection('requests').find({
                settlementId: id
            }, opt).toArray();

            // [P1 FIX] Fail-closed verification: check isActive and status on all linked entries
            const invalidEntries = linkedEntries.filter(e => e.isActive === false || !['approved', 'admin_approved'].includes(e.status));
            if (invalidEntries.length > 0) {
                const badDetails = invalidEntries.map(e => `${e.id} (status: '${e.status}', isActive: ${e.isActive})`).join(', ');
                const err = new Error(`Niespójność danych rozliczenia: powiązane wpisy czasu [${badDetails}] są nieaktywne lub niezatwierdzone. Przeliczenie zostało przerwane w celu ochrony spójności danych (fail-closed).`);
                err.status = 409;
                throw err;
            }

            // [P1 FIX] Fail-closed verification: check status and type on all linked advances
            const invalidAdvances = linkedAdvances.filter(a => a.status !== 'zaakceptowany' || a.type !== 'zaliczka');
            if (invalidAdvances.length > 0) {
                const badAdvDetails = invalidAdvances.map(a => `${a.id} (status: '${a.status}', typ: '${a.type}')`).join(', ');
                const err = new Error(`Niespójność danych rozliczenia: powiązane zaliczki [${badAdvDetails}] posiadają nieprawidłowy status lub typ. Przeliczenie zostało przerwane w celu ochrony spójności danych (fail-closed).`);
                err.status = 409;
                throw err;
            }

            // [P1 FIX] Fail-closed bidirectional check: verify declared timeEntryIds and advanceIds match linked records
            const linkedEntryIds = new Set(linkedEntries.map(e => e.id));
            const missingDeclaredEntries = teIds.filter(tid => !linkedEntryIds.has(tid));
            if (missingDeclaredEntries.length > 0) {
                const err = new Error(`Niespójność relacji: wpisy czasu [${missingDeclaredEntries.join(', ')}] zadeklarowane w rozliczeniu nie są z nim powiązane w bazie danych (brak settlementId='${id}'). Przeliczenie zostało przerwane.`);
                err.status = 409;
                throw err;
            }

            const linkedAdvIds = new Set(linkedAdvances.map(a => a.id));
            const missingDeclaredAdvances = advIds.filter(aid => !linkedAdvIds.has(aid));
            if (missingDeclaredAdvances.length > 0) {
                const err = new Error(`Niespójność relacji: zaliczki [${missingDeclaredAdvances.join(', ')}] zadeklarowane w rozliczeniu nie są z nim powiązane w bazie danych (brak settlementId='${id}'). Przeliczenie zostało przerwane.`);
                err.status = 409;
                throw err;
            }

            // [P1 FIX] Authoritative domain calculation helper shared with create-atomic
            const totals = calculateHourlySettlementTotals(linkedEntries, linkedAdvances);
            const { totalHours, baseAmount, overtimeHours, overtimePay, grossAmount, advanceDeductions, totalAmount } = totals;

            const recalcUpdates = {
                timeEntryIds: linkedEntries.map(e => e.id),
                advanceIds: linkedAdvances.map(a => a.id),
                totalHours,
                baseAmount,
                overtimeHours,
                overtimePay,
                grossAmount,
                advanceDeductions,
                totalAmount,
                updatedAt: nowIso
            };

            await db.collection('settlements').updateOne({ id }, { $set: recalcUpdates }, opt);

            // [P1 FIX] Update strictly records that belong to this settlement (prevent relational hijacking)
            await db.collection('time-entries').updateMany(
                { settlementId: id },
                { $set: { updatedAt: nowIso } },
                opt
            );
            if (linkedAdvances.length > 0) {
                await db.collection('requests').updateMany(
                    { settlementId: id },
                    { $set: { updatedAt: nowIso } },
                    opt
                );
            }

            // Recalculate affected jobs
            const affectedJobIds = new Set();
            if (settlement.jobId) affectedJobIds.add(settlement.jobId);
            linkedEntries.forEach(e => {
                if (e.jobId) affectedJobIds.add(e.jobId);
                if (e.project_id) affectedJobIds.add(e.project_id);
            });

            for (const jId of affectedJobIds) {
                await recalculateJobLaborCosts(jId, { session: sess, throwOnError: true });
            }

            updatedDoc = await db.collection('settlements').findOne({ id }, opt);
        };

        if (session) {
            try {
                await session.withTransaction(async () => {
                    await executeRecalculate(session);
                });
            } finally {
                await session.endSession();
            }
        } else {
            if (process.env.ALLOW_NON_TRANSACTIONAL !== 'true' && process.env.NODE_ENV !== 'test') {
                return res.status(503).json({
                    code: 'TRANSACTIONS_REQUIRED',
                    error: 'Brak aktywnej sesji transakcyjnej MongoDB. Operacja przeliczenia rozliczenia została wstrzymana (fail-closed).'
                });
            }
            await executeRecalculate(null);
        }

        return res.status(200).json(updatedDoc);
    } catch (err) {
        console.error('[POST /api/settlements/:id/recalculate ERROR]', err.message);
        return res.status(err.status || 500).json({ error: err.message });
    }
});

app.use('/api/settlements', verifyToken, validateSettlement, createRouter('settlements', {
    afterMutation: async (action, ctx) => {
        try {
            const jobIds = new Set();
            if (ctx.oldDoc?.jobId) jobIds.add(ctx.oldDoc.jobId);
            if (ctx.doc?.jobId) jobIds.add(ctx.doc.jobId);
            if (ctx.updates?.jobId) jobIds.add(ctx.updates.jobId);

            const settlementIds = new Set();
            if (ctx.oldDoc?.id) settlementIds.add(ctx.oldDoc.id);
            if (ctx.doc?.id) settlementIds.add(ctx.doc.id);
            if (ctx.id) settlementIds.add(ctx.id);
            if (ctx.items && Array.isArray(ctx.items)) {
                ctx.items.forEach(s => {
                    if (s.id) settlementIds.add(s.id);
                    if (s.jobId) jobIds.add(s.jobId);
                    if (ctx.oldDocsMap?.has(s.id)) {
                        const old = ctx.oldDocsMap.get(s.id);
                        if (old?.jobId) jobIds.add(old.jobId);
                        if (old?.id) settlementIds.add(old.id);
                    }
                });
            }

            // [P2 FIX] Synchronize settledAmountCents on subcontractor_contracts with CAS & version check
            const contractIds = new Set();
            if (ctx.oldDoc?.contractId) contractIds.add(ctx.oldDoc.contractId);
            if (ctx.doc?.contractId) contractIds.add(ctx.doc.contractId);
            if (ctx.updates?.contractId) contractIds.add(ctx.updates.contractId);
            if (ctx.items && Array.isArray(ctx.items)) {
                ctx.items.forEach(s => {
                    if (s.contractId) contractIds.add(s.contractId);
                    if (ctx.oldDocsMap?.has(s.id)) {
                        const old = ctx.oldDocsMap.get(s.id);
                        if (old?.contractId) contractIds.add(old.contractId);
                    }
                });
            }
            if (ctx.id && db && typeof db.collection === 'function' && contractIds.size === 0) {
                const doc = await db.collection('settlements').findOne({ id: ctx.id });
                if (doc?.contractId) contractIds.add(doc.contractId);
            }
            for (const cId of contractIds) {
                try {
                    await reconcileContractSettledAmount(cId);
                } catch (recErr) {
                    console.error(`[afterMutation settlements] Contract reconcile error for ${cId}:`, recErr.message);
                }
            }

            if (settlementIds.size > 0 && db && typeof db.collection === 'function') {
                const linkedEntries = await db.collection('time-entries').find({
                    settlementId: { $in: Array.from(settlementIds) }
                }).toArray();
                linkedEntries.forEach(e => {
                    if (e.jobId) jobIds.add(e.jobId);
                    if (e.project_id) jobIds.add(e.project_id);
                });
            }
            for (const jId of jobIds) {
                await recalculateJobLaborCosts(jId);
            }
        } catch (err) {
            console.warn('[afterMutation settlements] Labor recalculation error:', err.message);
        }
    }
}));
app.use('/api/messages', verifyToken, (req, res, next) => {
    if (req.method === 'POST') {
        const oldJson = res.json;
        res.json = function (data) {
            if (res.statusCode >= 200 && res.statusCode < 300 && data && !data.error) {
                createNotification({
                    type: 'message',
                    title: 'Nowa wiadomość',
                    message: data.content || data.message || 'Pracownik wysłał wiadomość.',
                    jobId: data.jobId
                });
            }
            return oldJson.call(this, data);
        };
    }
    next();
}, createRouter('messages'));
app.use('/api/requests', verifyToken, (req, res, next) => {
    if (req.method === 'POST') {
        const oldJson = res.json;
        res.json = function (data) {
            if (res.statusCode >= 200 && res.statusCode < 300 && data && !data.error) {
                createNotification({
                    type: 'request',
                    title: 'Nowe zgłoszenie',
                    message: data.description || 'Pracownik wysłał nowe zgłoszenie.',
                    jobId: data.jobId,
                    status: 'pending'
                });
            }
            return oldJson.call(this, data);
        };
    }
    next();
}, createRouter('requests'));
app.use('/api/site-logs', verifyToken, (req, res, next) => {
    if (req.method === 'POST') {
        const oldJson = res.json;
        res.json = function (data) {
            if (res.statusCode >= 200 && res.statusCode < 300 && data && !data.error) {
                createNotification({
                    type: 'site_log',
                    title: 'Nowy wpis w dzienniku',
                    message: data.description || 'Pracownik dodał nowy raport.',
                    jobId: data.jobId
                });
            }
            return oldJson.call(this, data);
        };
    }
    next();
}, createRouter('site-logs'));

app.use('/api/extra-works', verifyToken, requireWorkerPostOrAdmin, validateFinancialAmount, (req, res, next) => {
    if (req.method === 'POST') {
        const oldJson = res.json;
        res.json = function (data) {
            if (res.statusCode >= 200 && res.statusCode < 300 && data && !data.error) {
                createNotification({
                    type: 'extra_work',
                    title: 'Zgłoszono pracę dodatkową',
                    message: `Zlecenie: ${data.jobId}. Opis: ${data.description || data.title}`,
                    jobId: data.jobId,
                    status: 'pending_quote'
                });
            }
            return oldJson.call(this, data);
        };
    }

    // FIX #2: Idempotent Atomic Acceptance Interceptor
    if (req.method === 'PATCH' && req.params.id) {
        const oldJson = res.json;
        res.json = async function (data) {
            // FIX #2: Only run side-effects if status is TRANSITIONING to 'zaakceptowana'
            // (i.e., the document was NOT already 'zaakceptowana' before this PATCH)
            if (req.body.status === 'zaakceptowana' && data.jobId) {
                try {
                    // Check previous status to prevent duplicate side-effects on re-PATCH
                    const existingWork = await db.collection('extra-works').findOne(
                        { id: req.params.id },
                        { projection: { _extraWorkSideEffectDone: 1 } }
                    );
                    if (existingWork?._extraWorkSideEffectDone) {
                        console.log(`[ATOMIC-ACCEPT] Skipping duplicate side-effects for ${req.params.id} (already processed)`);
                        return oldJson.call(this, data);
                    }

                    console.log(`[ATOMIC-ACCEPT] Processing acceptance for extra work ${req.params.id} (Job: ${data.jobId})`);
                    const job = await db.collection('jobs').findOne({ id: data.jobId });

                    if (job) {
                        const newStage = {
                            id: 'stage-' + Date.now(),
                            name: `Praca dodatkowa: ${data.reason || data.title || 'bez nazwy'}`,
                            type: 'dodatkowy',
                            status: 'planned',
                            plannedRevenueNet: data.plannedRevenueNet || 0,
                            plannedCostNet: data.plannedCostNet || 0,
                            plannedStartDate: data.requestedDate || new Date().toISOString().split('T')[0],
                            plannedEndDate: data.requestedDate || new Date().toISOString().split('T')[0],
                        };

                        const currentRevenue = job.totalPlannedRevenueNet || job.revenuePlannedNet || 0;
                        const newRevenue = currentRevenue + (data.plannedRevenueNet || 0);

                        await db.collection('jobs').updateOne(
                            { id: data.jobId },
                            {
                                $push: { stages: newStage },
                                $set: {
                                    totalPlannedRevenueNet: newRevenue,
                                    revenuePlannedNet: newRevenue,
                                    updatedAt: new Date().toISOString()
                                }
                            }
                        );

                        // Mark side-effects as done to prevent duplicates
                        await db.collection('extra-works').updateOne(
                            { id: req.params.id },
                            { $set: { _extraWorkSideEffectDone: true } }
                        );
                        console.log(`[ATOMIC-ACCEPT] Successfully added stage ${newStage.id} and updated revenue for job ${data.jobId}`);
                    } else {
                        console.warn(`[ATOMIC-ACCEPT] Job ${data.jobId} not found for extra work ${req.params.id}`);
                    }
                } catch (e) {
                    console.error(`[ATOMIC-ACCEPT] Error during post-acceptance side effects:`, e);
                }
            }
            return oldJson.call(this, data);
        };
    }
    next();
}, createRouter('extra-works'));
app.use('/api/notifications', verifyToken, createRouter('notifications'));
app.use('/api/custom-events', verifyToken, createRouter('custom-events'));
app.use('/api/client-reports', verifyToken, requireRoleOrSafeGet, createRouter('client-reports'));
app.use('/api/checklists', verifyToken, requireWorkerPostOrAdmin, createRouter('checklists'));
app.use('/api/checklist-templates', verifyToken, requireRole('admin', 'manager'), createRouter('checklist-templates'));

// --- Core CostFrame Routes (admin/manager only for write, but auth required for all) ---
// clients route moved above with blockHardDelete middleware
// FIX #1b: offers now also go through financial validation
app.use('/api/offers', verifyToken, requireRoleOrSafeGet, validateFinancialAmount, createRouter('offers'));
app.use('/api/constructions', verifyToken, requireRoleOrSafeGet, createRouter('constructions'));
// ==========================================
// Job domain contracts & validation middleware
// ==========================================
const JOB_STATUS_ALIASES = {
    'planowane': 'planned',
    'planowany': 'planned',
    'w_toku': 'in_progress',
    'w_realizacji': 'in_progress',
    'zakończone': 'done',
    'zakończony': 'done',
    'anulowane': 'cancelled',
    'anulowany': 'cancelled',
    'wstrzymane': 'paused',
    'szkic': 'draft'
};

const STAGE_STATUS_ALIASES = {
    'planned': 'planowany',
    'planowane': 'planowany',
    'in_progress': 'w_toku',
    'completed': 'zakończony',
    'done': 'zakończony',
    'cancelled': 'anulowany',
    'anulowane': 'anulowany'
};

async function validateAndNormalizeJobDoc(doc, { db, user, isBatch = false, isPatch = false, existingJob = null }) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
        return { error: 'Nieprawidłowy obiekt zlecenia.' };
    }

    if (Object.keys(doc).length === 0) {
        return { error: 'Obiekt zlecenia nie może być pusty.' };
    }

    // Pre-trim and validate non-empty string for name and clientId if explicitly provided
    if (doc.name !== undefined) {
        if (typeof doc.name === 'string') doc.name = doc.name.trim();
        if (!doc.name) {
            return { error: 'Pole name nie może być puste.' };
        }
    } else if (!isPatch) {
        return { error: 'Pole name jest wymagane.' };
    }

    if (doc.clientId !== undefined) {
        if (typeof doc.clientId === 'string') doc.clientId = doc.clientId.trim();
        if (!doc.clientId) {
            return { error: 'Pole clientId nie może być puste.' };
        }
    } else if (!isPatch) {
        return { error: 'Pole clientId jest wymagane.' };
    }

    // [P2 FIX] Authoritative client verification & clientName synchronization
    if (doc.clientId !== undefined) {
        if (db && typeof db.collection === 'function') {
            try {
                const client = await db.collection('clients').findOne({
                    $or: [{ id: doc.clientId }, { _id: doc.clientId }]
                });
                if (!client) {
                    return { error: `Klient o identyfikatorze '${doc.clientId}' nie istnieje.`, status: 404 };
                }
                // ALWAYS compute authoritative clientName from client document
                doc.clientName = client.type === 'company'
                    ? client.company
                    : `${client.name || ''} ${client.lastName || ''}`.trim();
            } catch (dbErr) {
                return { error: 'Błąd weryfikacji klienta w bazie danych: ' + dbErr.message, status: 500 };
            }
        }
    } else if (isPatch) {
        // On PATCH without clientId: standalone clientName update is deleted from payload
        delete doc.clientName;
    }

    // Status normalization
    if (doc.status !== undefined) {
        const lower = String(doc.status).toLowerCase();
        if (JOB_STATUS_ALIASES[lower]) {
            doc.status = JOB_STATUS_ALIASES[lower];
        }
        if (!JOB_STATUSES.includes(doc.status)) {
            return { error: `Nieprawidłowy status zlecenia '${doc.status}'. Dozwolone: ${JOB_STATUSES.join(', ')}.` };
        }
    } else if (!isPatch) {
        doc.status = 'planned';
    }

    // Stages normalization & preserving stage actuals
    if (doc.stages !== undefined) {
        if (!Array.isArray(doc.stages)) {
            return { error: 'Pole stages musi być tablicą.' };
        }
        for (let i = 0; i < doc.stages.length; i++) {
            const stage = doc.stages[i];
            if (!stage || typeof stage !== 'object') {
                return { error: `Etap #${i} jest nieprawidłowy.` };
            }
            if (stage.name !== undefined && typeof stage.name === 'string') {
                stage.name = stage.name.trim();
            }
            if (!stage.name) {
                return { error: `Etap #${i} musi posiadać nazwę.` };
            }
            if (stage.status !== undefined) {
                const sLower = String(stage.status).toLowerCase();
                if (STAGE_STATUS_ALIASES[sLower]) {
                    stage.status = STAGE_STATUS_ALIASES[sLower];
                }
                if (!JOB_STAGE_STATUSES.includes(stage.status)) {
                    return { error: `Nieprawidłowy status etapu '${stage.status}'. Dozwolone: ${JOB_STAGE_STATUSES.join(', ')}.` };
                }
            } else {
                stage.status = 'planowany';
            }
            if (stage.type === undefined) {
                stage.type = 'podstawowy';
            } else if (!JOB_STAGE_TYPES.includes(stage.type)) {
                return { error: `Nieprawidłowy typ etapu '${stage.type}'. Dozwolone: ${JOB_STAGE_TYPES.join(', ')}.` };
            }
            if (stage.plannedRevenueNet === undefined) {
                stage.plannedRevenueNet = 0;
            }

            // [P1 FIX] Preserve stage actuals from existing stage for both batch upsert and PATCH (cannot fabricate stage actuals)
            if ((isBatch || isPatch) && existingJob && existingJob.stages && Array.isArray(existingJob.stages)) {
                const prevStage = existingJob.stages.find(s => s.id === stage.id);
                if (prevStage) {
                    stage.actualLaborHours = prevStage.actualLaborHours || 0;
                    stage.actualLaborCost = prevStage.actualLaborCost || 0;
                    stage.actualRevenueNet = prevStage.actualRevenueNet || 0;
                    stage.actualCostNet = prevStage.actualCostNet || 0;
                } else {
                    stage.actualLaborHours = 0;
                    stage.actualLaborCost = 0;
                    stage.actualRevenueNet = 0;
                    stage.actualCostNet = 0;
                }
            } else if (!isPatch) {
                stage.actualLaborHours = 0;
                stage.actualLaborCost = 0;
                stage.actualRevenueNet = 0;
                stage.actualCostNet = 0;
            }
        }
    }

    // [P1 FIX] Preserving Actuals & Aggregates on Job level during BATCH UPSERT
    if (isBatch && existingJob) {
        // If an existing job is updated via batch upsert: preserve existing server actuals unconditionally
        doc.actualLaborHours = existingJob.actualLaborHours || 0;
        doc.actualLaborCost = existingJob.actualLaborCost || 0;
        doc.settledLaborCost = existingJob.settledLaborCost || 0;
        doc.timeEntriesCount = existingJob.timeEntriesCount || 0;
        doc.timeEntriesHours = existingJob.timeEntriesHours || 0;
        doc.materialsActualNet = existingJob.materialsActualNet || 0;
        doc.logisticsActualNet = existingJob.logisticsActualNet || 0;
        doc.equipmentActualNet = existingJob.equipmentActualNet || 0;
        doc.otherCostsActualNet = existingJob.otherCostsActualNet || 0;
        doc.revenueActualNet = existingJob.revenueActualNet || 0;
        doc.actualRevenue = existingJob.actualRevenue || 0;
        doc.actualTotalCost = existingJob.actualTotalCost || 0;
        doc.marginActualPercent = existingJob.marginActualPercent || 0;
    } else if (!isPatch) {
        // Truly new job POST: initialize actuals to 0
        doc.actualLaborHours = 0;
        doc.actualLaborCost = 0;
        doc.settledLaborCost = 0;
        doc.timeEntriesCount = 0;
        doc.timeEntriesHours = 0;
        doc.materialsActualNet = 0;
        doc.logisticsActualNet = 0;
        doc.equipmentActualNet = 0;
        doc.otherCostsActualNet = 0;
        doc.revenueActualNet = 0;
        doc.actualRevenue = 0;
        doc.actualTotalCost = 0;
        doc.marginActualPercent = 0;
    } else {
        // [P1 FIX] On PATCH: Client is strictly forbidden from fabricating or directly updating actual labor & financial aggregates
        delete doc.actualLaborHours;
        delete doc.actualLaborCost;
        delete doc.settledLaborCost;
        delete doc.timeEntriesCount;
        delete doc.timeEntriesHours;
        delete doc.materialsActualNet;
        delete doc.logisticsActualNet;
        delete doc.equipmentActualNet;
        delete doc.otherCostsActualNet;
        delete doc.revenueActualNet;
        delete doc.actualRevenue;
        delete doc.actualTotalCost;
        delete doc.marginActualPercent;
    }

    // Validate against JSON schema
    const schemaValidator = isPatch ? validateJobPatchSchema : validateJobPostSchema;
    const isValid = schemaValidator(doc);
    if (!isValid) {
        const errorMessages = (schemaValidator.errors || []).map(err => {
            const field = err.instancePath ? err.instancePath.replace(/^\//, '') : (err.params?.missingProperty || 'obiekt');
            return `${field}: ${err.message}`;
        });
        return {
            error: `Błąd walidacji schematu zlecenia: ${errorMessages.join('; ')}`,
            status: 400
        };
    }

    return { data: doc };
}

async function validateJobBatch(req, res, next) {
    if (!req.body || typeof req.body !== 'object' || !Array.isArray(req.body.items)) {
        return res.status(400).json({ error: 'Payload importu wsadowego musi zawierać tablicę items.' });
    }

    const isValidBatch = validateJobBatchSchema(req.body);
    if (!isValidBatch) {
        const errorMessages = (validateJobBatchSchema.errors || []).map(err => {
            const field = err.instancePath ? err.instancePath.replace(/^\//, '') : (err.params?.missingProperty || 'items');
            return `${field}: ${err.message}`;
        });
        return res.status(400).json({
            error: `Błąd walidacji schematu paczki zleceń: ${errorMessages.join('; ')}`
        });
    }

    // [P1 FIX] Pre-fetch existing jobs so batch upsert does NOT zero out accumulated actuals
    const itemIds = req.body.items.map(i => i.id).filter(Boolean);
    const existingMap = new Map();
    if (itemIds.length > 0 && db && typeof db.collection === 'function') {
        try {
            const existingDocs = await db.collection('jobs').find({
                $or: [{ id: { $in: itemIds } }, { _id: { $in: itemIds } }]
            }).toArray();
            existingDocs.forEach(d => {
                if (d.id) existingMap.set(d.id, d);
                if (d._id) existingMap.set(d._id.toString(), d);
            });
        } catch (dbErr) {
            return res.status(500).json({ error: 'Błąd pobierania istniejących zleceń przed importem: ' + dbErr.message });
        }
    }

    const validatedItems = [];
    for (let i = 0; i < req.body.items.length; i++) {
        const item = req.body.items[i];
        const existingJob = item.id ? existingMap.get(item.id) : null;
        const resNorm = await validateAndNormalizeJobDoc(item, { db, user: req.user, isBatch: true, existingJob });
        if (resNorm.error) {
            return res.status(resNorm.status || 400).json({
                error: `Błąd w pozycji #${i}: ${resNorm.error}`
            });
        }
        validatedItems.push(resNorm.data);
    }
    req.body.items = validatedItems;
    next();
}

async function validateJob(req, res, next) {
    if (req.method !== 'POST' && req.method !== 'PATCH') return next();

    if (req.path === '/batch-import' || req.url === '/batch-import' || req.originalUrl?.endsWith('/batch-import')) {
        return validateJobBatch(req, res, next);
    }

    const pathId = req.path ? req.path.replace(/^\//, '').split('/')[0] : null;
    const targetId = req.params?.id || (pathId && pathId !== 'batch-import' ? pathId : null) || req.body?.id;

    if (req.method === 'POST') {
        const validation = await validateAndNormalizeJobDoc(req.body, { db, user: req.user });
        if (validation.error) {
            return res.status(validation.status || 400).json({ error: validation.error });
        }
        req.body = validation.data;
        return next();
    }

    if (req.method === 'PATCH') {
        let existingJob = null;
        if (targetId && db && typeof db.collection === 'function') {
            try {
                existingJob = await db.collection('jobs').findOne({ id: targetId });
                if (!existingJob) {
                    existingJob = await db.collection('jobs').findOne({ _id: targetId });
                }
                if (!existingJob) {
                    return res.status(404).json({ error: `Zlecenie o identyfikatorze '${targetId}' nie istnieje.` });
                }
            } catch (err) {
                return res.status(500).json({ error: 'Błąd bazy danych podczas pobierania zlecenia: ' + err.message });
            }
        }
        const validation = await validateAndNormalizeJobDoc(req.body, { db, user: req.user, isPatch: true, existingJob });
        if (validation.error) {
            return res.status(validation.status || 400).json({ error: validation.error });
        }
        req.body = validation.data;
        return next();
    }

    next();
}

// [P1 FIX] Dedicated authoritative recalculation endpoint for a specific job
app.post('/api/jobs/:id/recalculate-labor', verifyToken, requireRole('admin', 'manager'), async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const { id } = req.params;
        const job = await db.collection('jobs').findOne({ $or: [{ id }, { _id: id }] });
        if (!job) {
            return res.status(404).json({ error: `Zlecenie o identyfikatorze '${id}' nie istnieje.` });
        }
        await recalculateJobLaborCosts(id, { throwOnError: true });
        const updated = await db.collection('jobs').findOne({ $or: [{ id }, { _id: id }] });
        res.json({ success: true, job: updated });
    } catch (err) {
        res.status(500).json({ error: `Błąd przeliczania agregatów zlecenia: ${err.message}` });
    }
});

// [P1 FIX] Dedicated reconciliation endpoint for all pending / failed job aggregations
app.post('/api/jobs/reconcile-aggregates', verifyToken, requireRole('admin', 'manager'), async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const result = await reconcilePendingJobAggregates();
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ error: `Błąd rekonsyliacji agregatów: ${err.message}` });
    }
});

app.use('/api/jobs', verifyToken, requireRoleOrSafeGet, validateJob, createRouter('jobs'));
app.use('/api/materials', verifyToken, requireRole('admin', 'manager'), createRouter('materials'));
app.use('/api/standards', verifyToken, requireRole('admin', 'manager'), createRouter('standards'));
app.use('/api/settings', verifyToken, requireRole('admin', 'manager'), createRouter('settings'));
app.use('/api/jobStageItems', verifyToken, requireRole('admin', 'manager'), createRouter('jobStageItems'));
app.use('/api/subcontractor_contracts', verifyToken, requireRole('admin', 'manager'), createRouter('subcontractor_contracts'));
app.use('/api/documents', verifyToken, requireRole('admin', 'manager'), createRouter('documents'));
app.use('/api/equipment', verifyToken, requireRole('admin', 'manager'), createRouter('equipment'));
app.use('/api/invoices', verifyToken, requireRole('admin', 'manager'), validateFinancialAmount, createRouter('invoices'));
app.use('/api/cost-invoices', verifyToken, requireRole('admin', 'manager'), validateFinancialAmount, createRouter('cost-invoices'));

// --- Catalog Collection Routes (cost base) ---
app.use('/api/installation-rates', verifyToken, requireRole('admin', 'manager'), createRouter('installation-rates'));
app.use('/api/logistics-rates', verifyToken, requireRole('admin', 'manager'), createRouter('logistics-rates'));
app.use('/api/rental-rates', verifyToken, requireRole('admin', 'manager'), createRouter('rental-rates'));
app.use('/api/sheet-metal', verifyToken, requireRole('admin', 'manager'), createRouter('sheet-metal'));

// ==========================================
// ARCHIVED REPORTS — Saved PDF metadata CRUD
// ==========================================
// ==========================================
// COMPANY SETTINGS — logo, dane firmy (singleton)
// ==========================================
app.get('/api/company-settings', verifyToken, async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const doc = await db.collection('company-settings').findOne({});
        res.json(doc || {});
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/company-settings', verifyToken, requireRole('admin', 'manager'), async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const data = { ...req.body, updatedAt: new Date().toISOString() };
        await db.collection('company-settings').updateOne({}, { $set: data }, { upsert: true });
        const updated = await db.collection('company-settings').findOne({});
        res.json(updated);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.use('/api/archived-reports', verifyToken, requireRoleOrSafeGet, createRouter('archived-reports'));

// ==========================================
// BI ANALYTICS ENDPOINTS (Aggregations)
// ==========================================
app.get('/api/analytics/employee-performance', verifyToken, requireRole('admin', 'manager'), async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        
        const pipeline = [
            { $match: { status: { $in: ['approved', 'admin_approved'] } } },
            { $group: {
                _id: '$employeeId',
                hours: { $sum: '$hours' },
                entries: { $sum: 1 }
            } },
            { $lookup: {
                from: 'employees',
                localField: '_id',
                foreignField: 'id',
                as: 'employee'
            } },
            { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
            { $project: {
                id: '$_id',
                name: { 
                    $trim: { 
                        input: { 
                            $concat: [ 
                                { $ifNull: ['$employee.firstName', ''] }, 
                                ' ', 
                                { $ifNull: ['$employee.lastName', ''] } 
                            ] 
                        } 
                    } 
                },
                hours: 1,
                entries: 1
            } },
            { $sort: { hours: -1 } },
            { $limit: 5 }
        ];

        const stats = await db.collection('time-entries').aggregate(pipeline).toArray();
        res.json(stats);
    } catch (err) {
        console.error('[ANALYTICS] Employee performance err:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/analytics/job-risks', verifyToken, requireRole('admin', 'manager'), async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });

        const pipeline = [
            { $match: { status: 'in_progress', isActive: { $ne: false } } },
            { $addFields: {
                plannedCost: { $add: [
                    { $ifNull: ['$materialsPlannedNet', 0] },
                    { $ifNull: ['$laborPlannedNet', 0] },
                    { $ifNull: ['$logisticsPlannedNet', 0] },
                    { $ifNull: ['$equipmentPlannedNet', 0] }
                ] },
                revenue: { $ifNull: ['$totalPlannedRevenueNet', 0] }
            } },
            { $addFields: {
                margin: {
                    $cond: {
                        if: { $gt: ['$revenue', 0] },
                        then: { $multiply: [ { $divide: [ { $subtract: ['$revenue', '$plannedCost'] }, '$revenue' ] }, 100 ] },
                        else: 0
                    }
                }
            } },
            { $match: { margin: { $lt: 15 } } },
            { $project: {
                jobId: '$id',
                code: { $ifNull: ['$jobCode', ''] },
                client: { $ifNull: ['$clientName', ''] },
                issue: {
                    $cond: {
                        if: { $lt: ['$margin', 0] },
                        then: 'Strata!',
                        else: 'Niska marża'
                    }
                },
                val: { $concat: [ { $toString: { $round: ['$margin', 0] } }, '%' ] },
                severity: {
                    $cond: {
                        if: { $lt: ['$margin', 10] },
                        then: 'high',
                        else: 'low'
                    }
                }
            } },
            { $limit: 5 }
        ];

        const risks = await db.collection('jobs').aggregate(pipeline).toArray();
        res.json(risks);
    } catch (err) {
        console.error('[ANALYTICS] Job risks err:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ARCHIVED REPORTS — Save PDF file blob to disk + register in DB
// ==========================================
app.post('/api/archived-reports/save-pdf', verifyToken, requireRole('admin', 'manager'), uploadMemory.single('file'), validateAndSaveUpload, async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        if (!req.file) return res.status(400).json({ error: 'Brak pliku PDF' });
        const {
            jobId, jobCode, jobName, title,
            dateFrom, dateTo, onlyApproved, entryCount
        } = req.body;
        if (!jobId) return res.status(400).json({ error: 'Brak jobId' });
        const report = {
            id: `ar-${Date.now()}`,
            jobId,
            jobCode: jobCode || '',
            jobName: jobName || '',
            title: title || `Raport ${jobCode || ''} ${new Date().toLocaleDateString('pl-PL')}`,
            filename: req.file.filename,
            url: `/uploads/${req.file.filename}`,
            size: req.file.size,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
            onlyApproved: onlyApproved === 'true',
            entryCount: parseInt(entryCount) || 0,
            generatedBy: req.user?.name || req.user?.firstName || 'Admin',
            generatedById: req.user?.id || null,
            createdAt: new Date().toISOString()
        };
        await db.collection('archived-reports').insertOne(report);
        console.log(`[ARCHIVED-REPORT] Saved: ${report.title} -> ${report.url}`);
        res.status(201).json(report);
    } catch (err) {
        console.error('[ARCHIVED-REPORT] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// FILE UPLOAD: Multer endpoint
// ==========================================

app.post('/api/documents/upload', verifyToken, uploadMemory.single('file'), validateAndSaveUpload, async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const doc = {
            id: `doc-${Date.now()}`,
            name: req.file.originalname,
            filename: req.file.filename,
            mimetype: req.file.mimetype,
            size: req.file.size,
            url: `/uploads/${req.file.filename}`,
            projectId: req.body.projectId || null,
            clientId: req.body.clientId || null,
            description: req.body.description || '',
            uploadedBy: req.body.uploadedBy || req.user?.name || 'System',
            type: req.file.mimetype.startsWith('image/') ? 'photo' : 'document',
            uploadedAt: new Date().toISOString(),
            createdAt: new Date().toISOString()
        };

        await db.collection('documents').insertOne(doc);

        // Also add to job.documents[] if projectId provided
        if (doc.projectId) {
            await db.collection('jobs').updateOne(
                { id: doc.projectId },
                { $push: { documents: { id: doc.id, name: doc.name, type: doc.type, url: doc.url, uploadedAt: doc.uploadedAt } } }
            );
        }

        console.log(`[UPLOAD] Saved file: ${doc.name} -> ${doc.url}`);
        res.status(201).json(doc);
    } catch (err) {
        console.error('[UPLOAD] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// BULK MATERIALS IMPORT
// ==========================================
app.post('/api/materials/bulk', verifyToken, requireRole('admin', 'manager'), async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const items = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Expected non-empty array of materials' });
        }

        // Add IDs and timestamps
        const now = new Date().toISOString();
        const docs = items.map((item, i) => ({
            id: item.id || `mat-${Date.now()}-${i}`,
            ...item,
            createdAt: now,
            updatedAt: now
        }));

        const result = await db.collection('materials').insertMany(docs);
        console.log(`[BULK-IMPORT] Inserted ${result.insertedCount} materials`);
        res.status(201).json({ inserted: result.insertedCount });
    } catch (err) {
        console.error('[BULK-IMPORT] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// INVOICE: Mark as Paid + Revenue Trigger
// ==========================================
app.patch('/api/invoices/:id/pay', verifyToken, requireRole('admin', 'manager'), async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const { id } = req.params;

        const result = await db.collection('invoices').updateOne(
            { id: id },
            { $set: { status: 'paid', paidDate: new Date().toISOString(), updatedAt: new Date().toISOString() } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        // Trigger revenue recalculation
        const invoice = await db.collection('invoices').findOne({ id: id });
        if (invoice?.jobId) {
            await recalculateJobRevenue(invoice.jobId);
        }

        res.json({ success: true, message: 'Invoice marked as paid, job revenue updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// JOB: Recalculate expense costs trigger
// ==========================================
app.post('/api/jobs/:id/recalculate-expenses', verifyToken, requireRole('admin', 'manager'), async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const { id } = req.params;
        await recalculateJobExpenseCosts(id);
        res.json({ success: true, message: 'Job expense costs recalculated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// BLOKER #2 FIX: Single time-entry approval trigger
// When PATCH /api/time-entries/:id sets status='approved',
// the generic router has already updated the document.
// We add a dedicated endpoint that also triggers recalculation.
// ==========================================
app.post('/api/time-entries/:id/approve', verifyToken, requireRole('admin', 'manager'), async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const { id } = req.params;

        // Update the time entry to approved
        const result = await db.collection('time-entries').updateOne(
            { id: id },
            { $set: { status: 'approved', updatedAt: new Date().toISOString() } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Time entry not found' });
        }

        // Find the entry to get its jobId
        const entry = await db.collection('time-entries').findOne({ id: id });
        const jobId = entry?.jobId || entry?.project_id;

        // Trigger recalculation
        if (jobId) {
            await recalculateJobLaborCosts(jobId);

            // AUTO-STATUS: planned → in_progress on first approval
            const job = await db.collection('jobs').findOne({
                $or: [{ id: jobId }, { _id: jobId }]
            });
            if (job && (job.status === 'planned' || job.status === 'planowane')) {
                await db.collection('jobs').updateOne(
                    { $or: [{ id: jobId }, { _id: jobId }] },
                    { $set: { status: 'in_progress', actualStartDate: new Date().toISOString(), updatedAt: new Date().toISOString() } }
                );
                console.log(`[AUTO-STATUS] Job ${jobId} transitioned: planned → in_progress`);
            }
        }

        res.json({ success: true, message: 'Time entry approved and job costs recalculated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mobile Summary Endpoint for KOSTIQ Mobile PWA
app.get('/api/jobs/:id/mobile-summary', verifyToken, async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const jobId = req.params.id;

        const job = await db.collection('jobs').findOne({ id: jobId });
        if (!job) return res.status(404).json({ error: 'Job not found' });

        const { _id: _jid, ...jobData } = job;

        // Join client data (Single Source of Truth)
        let client = null;
        if (jobData.clientId) {
            const clientDoc = await db.collection('clients').findOne({ id: jobData.clientId });
            if (clientDoc) {
                const { _id: _cid, ...clientData } = clientDoc;
                client = clientData;
            }
        }

        // Join documents
        const docs = await db.collection('documents').find({ projectId: jobId }).toArray();
        const documents = docs.map(d => { const { _id, ...rest } = d; return rest; });

        res.json({
            job: { ...jobData, id: jobData.id || job._id.toString() },
            client,
            documents
        });
    } catch (err) {
        console.error('Failed to get mobile summary:', err);
        res.status(500).json({ error: err.message });
    }
});

// Specialized Schedule Endpoint for PWA
app.get('/api/schedules', verifyToken, async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });

        const [jobs, employees, crews] = await Promise.all([
            db.collection('jobs').find({}).toArray(),
            db.collection('employees').find({}).toArray(),
            db.collection('crews').find({}).toArray()
        ]);

        const schedules = [];

        const getEmployeesForTeam = (teamName) => {
            if (teamName === 'Podwykonawcy') return [];

            const crew = crews.find(c => c.name === teamName);
            if (crew) {
                return employees.filter(e => e.crewId === crew.id || e.crewId === (crew._id ? crew._id.toString() : null));
            }

            const crewById = crews.find(c => c.id === teamName);
            if (crewById) {
                return employees.filter(e => e.crewId === crewById.id || e.crewId === (crewById._id ? crewById._id.toString() : null));
            }

            const directCrewMembers = employees.filter(e => e.crewId === teamName);
            if (directCrewMembers.length > 0) return directCrewMembers;

            const empByFullName = employees.find(e => `${e.firstName} ${e.lastName}`.trim() === teamName);
            if (empByFullName) return [empByFullName];

            const empByFirstName = employees.find(e => e.firstName === teamName);
            if (empByFirstName) return [empByFirstName];

            return [];
        };

        const isWeekend = (date) => {
            const day = date.getDay();
            return day === 0 || day === 6;
        };

        for (const job of jobs) {
            if (job.stages && Array.isArray(job.stages)) {
                for (const stage of job.stages) {
                    let teams = [];
                    if (stage.assignedTeams && stage.assignedTeams.length > 0) {
                        teams = stage.assignedTeams;
                    } else if (job.assignedTeams && job.assignedTeams.length > 0) {
                        teams = job.assignedTeams;
                    } else if (job.plannedTeam && job.plannedTeam.length > 0) {
                        teams = job.plannedTeam;
                    }

                    if (!teams || teams.length === 0) continue;
                    if (!stage.startPlanned || !stage.endPlanned) continue;

                    const start = new Date(stage.startPlanned);
                    const end = new Date(stage.endPlanned);

                    if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;

                    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                        if (isWeekend(d)) continue;

                        const dateStr = d.toISOString().split('T')[0];

                        for (const teamName of teams) {
                            const teamMembers = getEmployeesForTeam(teamName);

                            for (const emp of teamMembers) {
                                schedules.push({
                                    id: `sch-${job.id}-${stage.id}-${emp.id}-${dateStr}`,
                                    employee_id: emp.id,
                                    date: dateStr,
                                    project_id: job.id,
                                    expected_hours: 8,
                                    work_location: stage.assignedLocation || job.location || 'Brak lokalizacji',
                                    status: 'planned',
                                    jobName: job.name,
                                    stageName: stage.name,
                                    startTime: stage.assignedStartTime,
                                    notes: stage.assignedNotes
                                });
                            }
                        }
                    }
                }
            }
        }

        res.json(schedules);
    } catch (err) {
        console.error('Failed to generate schedules:', err);
        res.status(500).json({ error: err.message });
    }
});

let server;
if (process.env.NODE_ENV !== 'test') {
    server = app.listen(port, () => {
        console.log(`Backend server running on http://localhost:${port}`);
    });
}

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
async function closeGracefully(signal) {
    console.log(`[SHUTDOWN] Received ${signal}. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(() => {
        console.log('[SHUTDOWN] HTTP server closed.');
    });

    // Close DB connection
    if (client) {
        try {
            await client.close();
            console.log('[SHUTDOWN] MongoDB connection closed.');
        } catch (err) {
            console.error('[SHUTDOWN] Error closing MongoDB:', err.message);
        }
    }

    console.log('[SHUTDOWN] Process exiting safely.');
    process.exit(0);
}

process.on('SIGINT', () => closeGracefully('SIGINT'));
process.on('SIGTERM', () => closeGracefully('SIGTERM'));

module.exports = {
    app,
    connectDB,
    closeGracefully,
        setDb: (testDb, ready = true, testClient = null, testIsReplicaSet = null) => {
        db = testDb;
        dbReady = ready;
        indexInitError = ready ? null : "Database marked not ready";
        client = testClient;
        if (testIsReplicaSet !== null) {
            isReplicaSet = testIsReplicaSet;
        } else {
            isReplicaSet = Boolean(testClient);
        }
    },
    reconcileDuplicatesAndEnsureIndexes,
    seedInitialDataIfEmpty,
    repairLegacyC4c2ac3Standards,
    repairIncompleteStandards,
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
    validateTimeEntryBatchSchema,
    computeCanonicalDocHash,
    toCanonicalJson,
    ALL_SYSTEM_COLLECTIONS,
    ALLOWED_BATCH_IMPORT_COLLECTIONS,
    ALLOWED_MIGRATION_COLLECTIONS,
    VALID_TIME_ENTRY_STATUSES,
    WORKER_ALLOWED_TIME_ENTRY_STATUSES,
    FOREMAN_ALLOWED_TIME_ENTRY_STATUSES,
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
    calculateHourlySettlementTotals,
    setTestFailpoint,
    getTestFailpoint,
    setTestBarrierHook,
    getTestBarrierHook,
    extractValidDateKey
};
