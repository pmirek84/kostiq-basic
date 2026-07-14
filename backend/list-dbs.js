
const { MongoClient } = require('mongodb');

async function listDbs() {
    const uri = "mongodb://127.0.0.1:27017";
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const adminDb = client.db().admin();
        const dbs = await adminDb.listDatabases();
        console.log("DATABASES:");
        console.log(JSON.stringify(dbs, null, 2));
    } finally {
        await client.close();
    }
}

listDbs();
