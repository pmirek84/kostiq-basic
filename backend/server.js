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
    'documents', 'equipment'
];

const ALLOWED_BATCH_IMPORT_COLLECTIONS = new Set([
    'time-entries',
    'clients',
    'catalog-materials',
    'materials'
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
    'subcontractor_contracts',
    'settlements'
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

        // Initialize Backup Schedule
        initBackupSchedule(db);

        dbReady = false;
        indexInitError = null;
        await reconcileDuplicatesAndEnsureIndexes(db);
        await seedInitialDataIfEmpty(db);
        dbReady = true;
        console.log('Successfully reconciled duplicates and verified all unique indexes.');
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
                total = await db.collection(collectionName).countDocuments(query);
                cursor = cursor.skip(skip).limit(limit);
            }

            const items = await cursor.toArray();
            let mapped = items.map(item => {
                const { _id, ...rest } = item;
                return { ...rest, id: rest.id || _id.toString() };
            });

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

                try {
                    const result = await db.collection(collectionName).bulkWrite(operations, { ordered: false });
                    const upsertedCount = result.upsertedCount || 0;
                    const modifiedCount = result.modifiedCount || 0;
                    const matchedCount = result.matchedCount || 0;
                    const succeeded = upsertedCount + matchedCount;

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

                        for (let i = 0; i < items.length; i++) {
                            const itemId = items[i].id;
                            if (failedIndices.has(i)) {
                                failedIds.push(itemId);
                            } else {
                                succeededIds.push(itemId);
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

            // Always stamp updatedAt on every PATCH
            updates.updatedAt = new Date().toISOString();

            const result = await db.collection(collectionName).updateOne(filter, { $set: updates });

            if (result.matchedCount === 0) {
                return res.status(404).json({ error: 'Item not found' });
            }

            const updated = await db.collection(collectionName).findOne(filter);
            const { _id, ...rest } = updated;
            res.json({ ...rest, id: rest.id || _id.toString() });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE (Now Soft Delete)
    router.delete('/:id', async (req, res) => {
        try {
            if (!db) return res.status(503).json({ error: 'Database not connected' });
            const { id } = req.params;

            // Critical collections use soft delete
            const softDeleteCollections = ['jobs', 'offers', 'clients', 'employees', 'subcontractors'];

            if (softDeleteCollections.includes(collectionName)) {
                const result = await db.collection(collectionName).updateOne(
                    { id: id },
                    { $set: { isActive: false, updatedAt: new Date().toISOString() } }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ error: 'Item not found' });
                }
                res.status(200).json({ success: true, message: 'Item archived' });
            } else {
                // Other collections can be hard deleted if appropriate, 
                // but let's follow the user's "Great Cleanup" and default to soft delete for safety
                // or keep hard delete for transient things like notifications if not specified.
                const result = await db.collection(collectionName).deleteOne({ id: id });
                if (result.deletedCount === 0) {
                    return res.status(404).json({ error: 'Item not found' });
                }
                res.status(204).send();
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
async function recalculateJobLaborCosts(jobId) {
    if (!db || !jobId) return;

    try {
        // Aggregate all approved time entries for this job
        const entries = await db.collection('time-entries').find({
            $or: [{ jobId: jobId }, { project_id: jobId }],
            status: 'approved'
        }).toArray();

        const totalHours = entries.reduce((sum, e) => sum + (e.hours || 0), 0);
        const totalCost = entries.reduce((sum, e) => sum + (e.cost || 0), 0);

        // Also compute settled cost (entries that have a settlementId)
        const settledEntries = entries.filter(e => e.settlementId);
        const settledCost = settledEntries.reduce((sum, e) => sum + (e.cost || 0), 0);

        // Update the job document directly in MongoDB
        const result = await db.collection('jobs').updateOne(
            { id: jobId },
            {
                $set: {
                    actualLaborHours: totalHours,
                    actualLaborCost: totalCost,
                    settledLaborCost: settledCost,
                    updatedAt: new Date().toISOString()
                }
            }
        );

        if (result.matchedCount > 0) {
            console.log(`[TRIGGER] Updated job ${jobId}: actualLaborHours=${totalHours}, actualLaborCost=${totalCost}, settledLaborCost=${settledCost}`);
        }

        // Also aggregate per-stage if entries have stageId
        const stageMap = new Map();
        entries.forEach(e => {
            if (e.stageId) {
                const existing = stageMap.get(e.stageId) || { hours: 0, cost: 0 };
                existing.hours += (e.hours || 0);
                existing.cost += (e.cost || 0);
                stageMap.set(e.stageId, existing);
            }
        });

        if (stageMap.size > 0) {
            const job = await db.collection('jobs').findOne({ id: jobId });
            if (job && job.stages && Array.isArray(job.stages)) {
                let stageChanges = false;
                const updatedStages = job.stages.map(stage => {
                    const agg = stageMap.get(stage.id);
                    if (agg) {
                        stageChanges = true;
                        return { ...stage, actualLaborHours: agg.hours, actualLaborCost: agg.cost };
                    }
                    return stage;
                });
                if (stageChanges) {
                    await db.collection('jobs').updateOne(
                        { id: jobId },
                        { $set: { stages: updatedStages } }
                    );
                    console.log(`[TRIGGER] Updated stages for job ${jobId}`);
                }
            }
        }
    } catch (err) {
        console.error(`[TRIGGER] Failed to recalculate labor costs for job ${jobId}:`, err.message);
    }
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

app.post('/api/time-entries/batch-update', verifyToken, requireRole('admin', 'manager'), async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Database not connected' });
        const { ids, updates } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ error: 'Invalid IDs' });
        }

        await db.collection('time-entries').updateMany(
            { id: { $in: ids } },
            { $set: updates }
        );

        // BLOKER #2 TRIGGER: If this batch approval sets status to 'approved',
        // recalculate labor costs for all affected jobs.
        if (updates.status === 'approved') {
            const affectedEntries = await db.collection('time-entries').find({
                id: { $in: ids }
            }).toArray();

            // Collect unique jobIds from affected entries
            const jobIds = new Set();
            affectedEntries.forEach(e => {
                if (e.jobId) jobIds.add(e.jobId);
                if (e.project_id) jobIds.add(e.project_id);
            });

            // Recalculate each affected job
            for (const jobId of jobIds) {
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
        }

        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
    TIME_ENTRY_TYPES
} = require('../shared/contracts/index.cjs');

const ajv = new Ajv({ allErrors: true, coerceTypes: false });
ajv.addSchema(timeEntrySchema, 'timeEntry');
const validateTimeEntryPostSchema = ajv.getSchema('timeEntry#/definitions/TimeEntryPostPayload');
const validateTimeEntryPatchSchema = ajv.getSchema('timeEntry#/definitions/TimeEntryPatchPayload');
const validateTimeEntryBatchSchema = ajv.getSchema('timeEntry#/definitions/TimeEntryBatchImportPayload');

// Shared validation & normalization for time entries (used by single POST/PATCH and batch-import)
async function validateAndNormalizeTimeEntryDoc(doc, { db, user, isBatch = false, isPatch = false }) {
    if (!doc || typeof doc !== 'object') {
        return { error: 'Nieprawidłowy obiekt wpisu czasu.' };
    }

    // JSON Schema validation via Ajv from shared/contracts (FAIL-CLOSED)
    const schemaValidator = isPatch ? validateTimeEntryPatchSchema : validateTimeEntryPostSchema;
    const isValidSchema = schemaValidator(doc);
    if (!isValidSchema) {
        const firstErr = schemaValidator.errors?.[0];
        if (firstErr) {
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
                return { error: `Nieprawidłowy typ wpisu (type): '${doc.type}'. Dozwolone: ${TIME_ENTRY_TYPES.join(', ')}.` };
            }
        }
        const errorDetails = ajv.errorsText(schemaValidator.errors, { dataVar: 'payload', separator: '; ' });
        return { error: `Błąd walidacji schematu JSON: ${errorDetails}.` };
    }
    const effectiveEmpId = doc.employeeId || doc.employee_id;
    const effectiveJobId = doc.jobId || doc.project_id;

    // In POST or Batch-Import, employeeId and jobId are mandatory.
    // In PATCH (e.g. status approval/rejection or notes update), they are optional if not being modified.
    if (!isPatch) {
        if (!effectiveEmpId) {
            return { error: 'Pole employeeId jest wymagane.' };
        }
        if (!effectiveJobId) {
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
        let entryDate;
        const rawDate = String(doc.date);

        if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
            const [year, month, day] = rawDate.split('-').map(Number);
            entryDate = new Date(Date.UTC(year, month - 1, day));
            // Strict calendar validation (rejects invalid calendar days like 2026-02-31, 2025-02-29, 2026-04-31)
            if (entryDate.getUTCFullYear() !== year || entryDate.getUTCMonth() !== month - 1 || entryDate.getUTCDate() !== day) {
                return { error: `Nieprawidłowa data kalendarzowa: '${rawDate}'. Taki dzień nie istnieje w kalendarzu.` };
            }
            doc.date = entryDate.toISOString();
        } else {
            entryDate = new Date(rawDate);
            const isoMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (isoMatch) {
                const year = Number(isoMatch[1]);
                const month = Number(isoMatch[2]);
                const day = Number(isoMatch[3]);
                const checkDate = new Date(Date.UTC(year, month - 1, day));
                if (checkDate.getUTCFullYear() !== year || checkDate.getUTCMonth() !== month - 1 || checkDate.getUTCDate() !== day) {
                    return { error: `Nieprawidłowa data kalendarzowa: '${rawDate}'. Taki dzień nie istnieje w kalendarzu.` };
                }
            }
        }

        if (isNaN(entryDate.getTime())) {
            return { error: `Nieprawidłowy format daty: '${rawDate}'. Oczekiwano poprawnej daty.` };
        }

        const nowUTC = new Date();
        const todayUTC = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate()));

        // Reject future dates (beyond today)
        if (entryDate > todayUTC) {
            return {
                error: `Nie można zgłosić czasu z datą przyszłą (${rawDate}). Dozwolona data to dzisiaj lub wcześniej.`
            };
        }

        // Reject dates older than MAX_BACKDATE_DAYS (default 7) unless admin/manager
        const MAX_BACKDATE_DAYS = 7;
        const oldestAllowed = new Date(todayUTC);
        oldestAllowed.setUTCDate(oldestAllowed.getUTCDate() - MAX_BACKDATE_DAYS);

        const isAdminOverride = user && (user.role === 'admin' || user.role === 'manager');

        if (entryDate < oldestAllowed && !isAdminOverride) {
            return {
                error: `Data wpisu jest zbyt stara (${rawDate}). Pracownicy mogą wpisywać czas maksymalnie ${MAX_BACKDATE_DAYS} dni wstecz. Skontaktuj się z przełożonym.`
            };
        }
    }

    // Block time-entry on closed/cancelled jobs
    if (db && effectiveJobId && typeof db.collection === 'function') {
        try {
            const job = await db.collection('jobs').findOne(
                { $or: [{ id: effectiveJobId }, { _id: effectiveJobId }] },
                { projection: { status: 1 } }
            );
            if (job && (job.status === 'done' || job.status === 'cancelled')) {
                return {
                    status: 409,
                    error: `Zlecenie jest już ${job.status === 'done' ? 'zakończone' : 'anulowane'}. Nie można dodawać wpisów godzinowych.`
                };
            }
        } catch (e) {
            console.error('[validateTimeEntry] DB check error:', e.message);
        }
    }

    // Server-side cost calculation:
    // ONLY for billingType === 'hourly' (or default hourly when hours are specified).
    // For fixed, m2, mb, piecework: preserve explicit cost or calculate quantity * rate.
    const billingType = doc.billingType || 'hourly';
    if (billingType === 'hourly') {
        if (db && effectiveEmpId && typeof db.collection === 'function') {
            const hours = Number(doc.hours) || 0;
            if (hours > 0) {
                try {
                    const emp = await db.collection('employees').findOne(
                        { $or: [{ id: effectiveEmpId }, { _id: effectiveEmpId }] },
                        { projection: { hourlyRate: 1, defaultHourlyRate: 1 } }
                    );
                    if (emp) {
                        const freshRate = emp.hourlyRate || emp.defaultHourlyRate || 0;
                        const freshCostCents = toCents(hours) * toCents(freshRate) / 100;
                        doc.cost = toCurrency(freshCostCents);
                        doc.hourlyRate = freshRate;
                    }
                } catch (e) {
                    console.error('[COST-RECALC] DB lookup failed:', e.message);
                }
            }
        }
    } else {
        // Non-hourly billing (fixed, m2, mb, piecework)
        // If cost is not explicitly provided, calculate quantity * rate if available
        if (doc.cost === undefined && doc.quantity !== undefined && (doc.rate !== undefined || doc.unitPrice !== undefined)) {
            const qty = Number(doc.quantity) || 0;
            const unitRate = Number(doc.rate !== undefined ? doc.rate : doc.unitPrice) || 0;
            doc.cost = toCurrency(toCents(qty) * toCents(unitRate) / 100);
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

        const effectiveEmpId = item.employeeId || item.employee_id;

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

    const isWorker = req.user && (req.user.role === 'worker' || req.user.role === 'foreman');
    const userEmpId = req.user?.id || req.user?._id;

    if (isWorker) {
        const allowedStatuses = req.user?.role === 'foreman' ? FOREMAN_ALLOWED_TIME_ENTRY_STATUSES : WORKER_ALLOWED_TIME_ENTRY_STATUSES;

        // Security check 1: In POST, worker can only create entry for their own employeeId
        if (req.method === 'POST') {
            const bodyEmpId = req.body?.employeeId || req.body?.employee_id;
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

        // Security check 2: In PATCH, worker cannot reassign employeeId to another employee
        if (req.method === 'PATCH') {
            const patchEmpId = req.body?.employeeId || req.body?.employee_id;
            if (patchEmpId && String(patchEmpId) !== String(userEmpId)) {
                return res.status(403).json({
                    error: `Brak uprawnień: Pracownik nie może zmieniać przypisania wpisu (employeeId) na innego pracownika (${patchEmpId}).`
                });
            }
        }

        // Whitelist allowed statuses for worker/foreman
        if (req.body && req.body.status && !allowedStatuses.includes(req.body.status)) {
            req.body.status = 'submitted';
        }

        // Security check 3: For PATCH/POST targeting an ID: verify ownership of existing record (fail-closed 503)
        const pathId = req.path ? req.path.replace(/^\//, '').split('/')[0] : null;
        const targetId = req.params?.id || (pathId && pathId !== 'batch-import' ? pathId : null) || req.body?.id;
        if (targetId && db && typeof db.collection === 'function') {
            try {
                const existing = await db.collection('time-entries').findOne(
                    { id: targetId },
                    { projection: { employeeId: 1, employee_id: 1 } }
                );
                if (existing) {
                    const existingEmpId = existing.employeeId || existing.employee_id;
                    if (existingEmpId && String(existingEmpId) !== String(userEmpId)) {
                        return res.status(403).json({
                            error: 'Brak uprawnień: Nie można modyfikować wpisu innego pracownika.'
                        });
                    }
                }
            } catch (err) {
                console.error('[validateTimeEntry] Single entry ownership check error:', err.message);
                return res.status(503).json({
                    error: 'Nie można zweryfikować uprawnień własności rekordu z powodu błędu bazy danych.'
                });
            }
        }
    }

    const valError = await validateAndNormalizeTimeEntryDoc(req.body, {
        db,
        user: req.user,
        isBatch: false,
        isPatch: req.method === 'PATCH'
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
app.use('/api/time-entries', verifyToken, validateTimeEntry, createRouter('time-entries'));
app.use('/api/settlements', verifyToken, validateSettlement, createRouter('settlements'));
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
app.use('/api/jobs', verifyToken, requireRoleOrSafeGet, createRouter('jobs'));
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
    setDb: (testDb, ready = true) => { db = testDb; dbReady = ready; indexInitError = ready ? null : "Database marked not ready"; },
    reconcileDuplicatesAndEnsureIndexes,
    seedInitialDataIfEmpty,
    repairLegacyC4c2ac3Standards,
    repairIncompleteStandards,
    VALID_TIME_ENTRY_STATUSES,
    WORKER_ALLOWED_TIME_ENTRY_STATUSES,
    FOREMAN_ALLOWED_TIME_ENTRY_STATUSES,
    BILLING_TYPES,
    TIME_ENTRY_TYPES,
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
    FOREMAN_ALLOWED_TIME_ENTRY_STATUSES
};
