
const { MongoClient } = require('mongodb');

async function findExtraWorks() {
    const uri = "mongodb://localhost:27017";
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const admin = client.db().admin();
        const dbs = await admin.listDatabases();

        console.log("DATABASES FOUND:", dbs.databases.map(db => db.name));

        for (const dbInfo of dbs.databases) {
            const dbName = dbInfo.name;
            if (dbName === 'admin' || dbName === 'local' || dbName === 'config') continue;

            const db = client.db(dbName);
            const collections = await db.listCollections().toArray();

            for (const collInfo of collections) {
                const collName = collInfo.name;
                const coll = db.collection(collName);

                // Search for "Patrzyli" in any document
                const match = await coll.findOne({ $or: [{ title: /Patrzyli/i }, { reason: /Patrzyli/i }, { description: /Patrzyli/i }] });
                if (match) {
                    console.log(`FOUND MATCH IN DB: ${dbName}, COLLECTION: ${collName}`);
                    console.log(JSON.stringify(match, null, 2));

                    // Show latest 5 docs in this collection too
                    const latest = await coll.find({}).sort({ _id: -1 }).limit(5).toArray();
                    console.log(`LATEST 5 IN ${dbName}.${collName}:`);
                    console.log(JSON.stringify(latest, null, 2));
                }
            }
        }
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
    }
}

findExtraWorks();
