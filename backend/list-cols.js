const { MongoClient } = require('mongodb');
const uri = 'mongodb://127.0.0.1:27017/costframe';
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        const db = client.db();
        const collections = await db.listCollections().toArray();
        console.log("COLLECTIONS:", collections.map(c => c.name));
    } catch (err) {
        console.error("FAILURE:", err);
    } finally {
        await client.close();
    }
}
run();
