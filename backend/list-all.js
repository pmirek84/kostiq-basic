
const { MongoClient } = require('mongodb');

async function listAll() {
    const uri = "mongodb://127.0.0.1:27017";
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('costframe');
        const collections = await db.listCollections().toArray();
        console.log("COLLECTIONS IN costframe:", collections.map(c => c.name));

        for (const c of collections) {
            const count = await db.collection(c.name).countDocuments();
            console.log(`- ${c.name}: ${count} docs`);
            if (c.name === 'extra-works') {
                const docs = await db.collection(c.name).find({}).toArray();
                console.log("EXTRA WORKS CONTENT:");
                console.log(JSON.stringify(docs, null, 2));
            }
        }
    } finally {
        await client.close();
    }
}

listAll();
