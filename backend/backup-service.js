const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

/**
 * Backup Service for CostFrame
 * Handles daily snapshots of MongoDB data and User Uploads
 */

async function runBackup(db) {
    if (!db) {
        console.error('[BACKUP] Cannot run backup: database not connected');
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const backupDir = path.join(__dirname, 'backups', timestamp);

    try {
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        console.log(`[BACKUP] Starting backup sequence to: ${backupDir}`);

        // 1. Backup DB Collections
        const collections = await db.listCollections().toArray();
        const dbDir = path.join(backupDir, 'database');
        fs.mkdirSync(dbDir, { recursive: true });

        for (const col of collections) {
            const name = col.name;
            const data = await db.collection(name).find({}).toArray();
            fs.writeFileSync(
                path.join(dbDir, `${name}.json`),
                JSON.stringify(data, null, 2)
            );
            console.log(`[BACKUP] Saved collection: ${name} (${data.length} items)`);
        }

        // 2. Backup Uploads
        const uploadsSrc = path.join(__dirname, 'uploads');
        const uploadsDest = path.join(backupDir, 'uploads');

        if (fs.existsSync(uploadsSrc)) {
            copyRecursiveSync(uploadsSrc, uploadsDest);
            console.log(`[BACKUP] Uploaded files archived successfully.`);
        }

        console.log(`[BACKUP] Completed successfully at ${new Date().toLocaleString()}`);

        // Cleanup old backups (optional: keep last 7 days)
        cleanupOldBackups(path.join(__dirname, 'backups'), 7);

    } catch (err) {
        console.error('[BACKUP] Error during backup:', err);
    }
}

function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest);
        fs.readdirSync(src).forEach((childItemName) => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

function cleanupOldBackups(backupsRoot, daysToKeep) {
    try {
        const folders = fs.readdirSync(backupsRoot);
        const now = Date.now();
        const msPerDay = 24 * 60 * 60 * 1000;

        folders.forEach(folder => {
            const folderPath = path.join(backupsRoot, folder);
            const stats = fs.statSync(folderPath);
            const ageInDays = (now - stats.mtimeMs) / msPerDay;

            if (ageInDays > daysToKeep) {
                console.log(`[BACKUP] Cleaning up old backup: ${folder}`);
                fs.rmSync(folderPath, { recursive: true, force: true });
            }
        });
    } catch (err) {
        console.warn('[BACKUP] Cleanup warning:', err.message);
    }
}

function initBackupSchedule(db) {
    // Every night at 03:00
    cron.schedule('0 3 * * *', () => {
        console.log('[CRON] Triggering nightly backup...');
        runBackup(db);
    });

    console.log('[BACKUP] Nightly backup schedule initialized (03:00 AM)');

    // Also run one immediately on server start if backups folder is empty
    const backupsRoot = path.join(__dirname, 'backups');
    if (fs.readdirSync(backupsRoot).length === 0) {
        console.log('[BACKUP] No existing backups found, running initial backup...');
        runBackup(db);
    }
}

module.exports = { initBackupSchedule, runBackup };
