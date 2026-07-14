const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/costframe';

async function restoreDatabase() {
    const backupsRoot = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupsRoot)) {
        console.error('[RESTORE] No backups folder found at:', backupsRoot);
        process.exit(1);
    }

    const folders = fs.readdirSync(backupsRoot)
        .filter(f => fs.statSync(path.join(backupsRoot, f)).isDirectory())
        .sort(); // Sort so that the latest date is at the end

    if (folders.length === 0) {
        console.error('[RESTORE] No backup folders found inside backups directory.');
        process.exit(1);
    }

    const latestBackup = folders[folders.length - 1];
    const databaseDir = path.join(backupsRoot, latestBackup, 'database');

    if (!fs.existsSync(databaseDir)) {
        console.error(`[RESTORE] No database folder found inside backup: ${latestBackup}`);
        process.exit(1);
    }

    console.log(`[RESTORE] Restoring database from backup folder: ${latestBackup}`);
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('[RESTORE] Connected to MongoDB.');
        const db = client.db();

        const files = fs.readdirSync(databaseDir).filter(file => file.endsWith('.json'));

        for (const file of files) {
            const collectionName = file.replace('.json', '');
            const filePath = path.join(databaseDir, file);
            
            // Read JSON file
            const fileContent = fs.readFileSync(filePath, 'utf8');
            let documents = JSON.parse(fileContent);

            if (!Array.isArray(documents)) {
                documents = [documents];
            }

            console.log(`[RESTORE] Restoring collection: "${collectionName}" (${documents.length} items)`);

            // Drop existing collection
            try {
                await db.collection(collectionName).drop();
            } catch (e) {
                // Ignore if collection doesn't exist
            }

            // Insert documents if there are any
            if (documents.length > 0) {
                await db.collection(collectionName).insertMany(documents);
            }
        }

        console.log('[RESTORE] Database restored successfully!');
    } catch (err) {
        console.error('[RESTORE] Error during restore:', err);
    } finally {
        await client.close();
    }
}

restoreDatabase();
