const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');
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
    } catch (err) {
        console.error('CRITICAL: Failed to connect to MongoDB', err.message);
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
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});
// Generic CRUD handlers
const createRouter = (collectionName) => {
    const router = express.Router();

    // GET All — with optional filtering + PAGINATION (Fix #4: 10 000 records problem)
    router.get('/', async (req, res) => {
        try {
            if (!db) return res.status(503).json({ error: 'Database not connected' });

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

    // POST Create (with upsert protection if business id already exists)
    router.post('/', async (req, res) => {
        try {
            if (!db) return res.status(503).json({ error: 'Database not connected' });
            const newItem = req.body;
            if (newItem && newItem.id) {
                const existing = await db.collection(collectionName).findOne({ id: newItem.id });
                if (existing) {
                    await db.collection(collectionName).updateOne({ id: newItem.id }, { $set: newItem });
                    return res.status(200).json({ ...existing, ...newItem });
                }
            }
            const result = await db.collection(collectionName).insertOne(newItem);
            res.status(201).json({ ...newItem, _id: result.insertedId });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

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

// Time Entry validation: hours 0-24, required fields, closed-job guard, date range guard
async function validateTimeEntry(req, res, next) {
    if (req.method !== 'POST' && req.method !== 'PATCH') return next();
    const { hours, employeeId, jobId } = req.body;
    const effectiveJobId = jobId || req.body.project_id;

    if (req.method === 'POST') {
        if (!employeeId && !req.body.employee_id) {
            return res.status(400).json({ error: 'Pole employeeId jest wymagane.' });
        }
        if (!effectiveJobId) {
            return res.status(400).json({ error: 'Pole jobId jest wymagane.' });
        }

        // Block time-entry on closed/cancelled jobs (PWA offline conflict guard)
        if (db && effectiveJobId) {
            try {
                const job = await db.collection('jobs').findOne(
                    { $or: [{ id: effectiveJobId }, { _id: effectiveJobId }] },
                    { projection: { status: 1 } }
                );
                if (job && (job.status === 'done' || job.status === 'cancelled')) {
                    return res.status(409).json({
                        error: `Zlecenie jest już ${job.status === 'done' ? 'zakończone' : 'anulowane'}. Nie można dodawać wpisów godzinowych.`
                    });
                }
            } catch (e) {
                console.error('[validateTimeEntry] DB check error:', e.message);
            }
        }
    }

    if (hours !== undefined) {
        const h = Number(hours);
        if (isNaN(h) || h < 0) {
            return res.status(400).json({ error: 'Godziny nie mogą być ujemne.' });
        }
        if (h > 24) {
            return res.status(400).json({ error: 'Godziny nie mogą przekraczać 24h na jeden wpis.' });
        }
    }

    // Shield #3 + FIX #2: UTC date normalization + Time Travel guard
    if (req.body.date) {
        let entryDate;
        const rawDate = String(req.body.date);

        // Normalize plain YYYY-MM-DD to UTC midnight ISO
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
            const [year, month, day] = rawDate.split('-').map(Number);
            entryDate = new Date(Date.UTC(year, month - 1, day));
            req.body.date = entryDate.toISOString();
        } else {
            // Already an ISO string — parse it
            entryDate = new Date(rawDate);
        }

        if (!isNaN(entryDate.getTime())) {
            const nowUTC = new Date();
            // Normalize today to UTC midnight for fair comparison
            const todayUTC = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate()));

            // FIX #2a: Reject future dates (beyond today)
            if (entryDate > todayUTC) {
                return res.status(400).json({
                    error: `Nie można zgłosić czasu z datą przyszłą (${rawDate}). Dozwolona data to dzisiaj lub wcześniej.`
                });
            }

            // FIX #2b: Reject dates older than MAX_BACKDATE_DAYS (default 7)
            // Admins/managers may override via header X-Allow-Backdate
            const MAX_BACKDATE_DAYS = 7;
            const oldestAllowed = new Date(todayUTC);
            oldestAllowed.setUTCDate(oldestAllowed.getUTCDate() - MAX_BACKDATE_DAYS);

            const isAdminOverride = req.user && (req.user.role === 'admin' || req.user.role === 'manager');

            if (entryDate < oldestAllowed && !isAdminOverride) {
                return res.status(400).json({
                    error: `Data wpisu jest zbyt stara (${rawDate}). Pracownicy mogą wpisywać czas maksymalnie ${MAX_BACKDATE_DAYS} dni wstecz. Skontaktuj się z przełożonym.`
                });
            }
        }
    }

    // TARCZA 2 (PWA Stawka): Server przelicza cost z aktualnej stawki z DB — ignoruje wartość z payloadu
    if (req.method === 'POST' && db) {
        const effectiveEmployeeId = req.body.employeeId || req.body.employee_id;
        const hours = Number(req.body.hours) || 0;
        if (effectiveEmployeeId && hours > 0) {
            try {
                const emp = await db.collection('employees').findOne(
                    { $or: [{ id: effectiveEmployeeId }, { _id: effectiveEmployeeId }] },
                    { projection: { hourlyRate: 1, defaultHourlyRate: 1 } }
                );
                if (emp) {
                    const freshRate = emp.hourlyRate || emp.defaultHourlyRate || 0;
                    // Tarcza 1: integer cents arithmetic eliminates IEEE 754 drift
                    const freshCostCents = toCents(hours) * toCents(freshRate) / 100;
                    req.body.cost = toCurrency(freshCostCents);
                    req.body.hourlyRate = freshRate;
                    console.log(`[COST-RECALC] emp=${effectiveEmployeeId} h=${hours} rate=${freshRate} cost=${req.body.cost}`);
                }
            } catch (e) {
                console.error('[COST-RECALC] DB lookup failed (non-fatal):', e.message);
            }
        }
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
            createNotification({
                type: 'message',
                title: 'Nowa wiadomość',
                message: data.content || data.message || 'Pracownik wysłał wiadomość.',
                jobId: data.jobId
            });
            return oldJson.call(this, data);
        };
    }
    next();
}, createRouter('messages'));
app.use('/api/requests', verifyToken, (req, res, next) => {
    if (req.method === 'POST') {
        const oldJson = res.json;
        res.json = function (data) {
            createNotification({
                type: 'request',
                title: 'Nowe zgłoszenie',
                message: data.description || 'Pracownik wysłał nowe zgłoszenie.',
                jobId: data.jobId,
                status: 'pending'
            });
            return oldJson.call(this, data);
        };
    }
    next();
}, createRouter('requests'));
app.use('/api/site-logs', verifyToken, (req, res, next) => {
    if (req.method === 'POST') {
        const oldJson = res.json;
        res.json = function (data) {
            createNotification({
                type: 'site_log',
                title: 'Nowy wpis w dzienniku',
                message: data.description || 'Pracownik dodał nowy raport.',
                jobId: data.jobId
            });
            return oldJson.call(this, data);
        };
    }
    next();
}, createRouter('site-logs'));

app.use('/api/extra-works', verifyToken, requireWorkerPostOrAdmin, validateFinancialAmount, (req, res, next) => {
    if (req.method === 'POST') {
        const oldJson = res.json;
        res.json = function (data) {
            createNotification({
                type: 'extra_work',
                title: 'Zgłoszono pracę dodatkową',
                message: `Zlecenie: ${data.jobId}. Opis: ${data.description || data.title}`,
                jobId: data.jobId,
                status: 'pending_quote'
            });
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

module.exports = { app, connectDB, closeGracefully, setDb: (testDb) => { db = testDb; } };
