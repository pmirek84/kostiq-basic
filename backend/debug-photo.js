
const { MongoClient } = require('mongodb');

async function checkExtraWorks() {
    const uri = "mongodb://localhost:27017";
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const database = client.db('costframe');
        const collection = database.collection('extra-works');

        const docs = await collection.find({}).sort({ createdAt: -1 }).limit(5).toArray();
        console.log("RECENT EXTRA WORKS:");
        console.log(JSON.stringify(docs, null, 2));
    } catch (err) {
        console.error("DB Error:", err);
    } finally {
        await client.close();
    }
}

checkExtraWorks();
