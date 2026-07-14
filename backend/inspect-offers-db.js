const { MongoClient } = require('mongodb');

async function inspect() {
    const uri = "mongodb://127.0.0.1:27017";
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('costframe');
        const offers = await db.collection('offers').find({}).toArray();
        console.log("=== OFFERS ===");
        for (const o of offers) {
            console.log(`ID: ${o.id || o._id}, Number: ${o.number}, Title: ${o.title}, ClientId: ${o.clientId}, Location: ${o.location}, Status: ${o.status}, TotalCost: ${o.totalCost}, TotalNet: ${o.totalNet}, CreatedAt: ${o.createdAt}`);
            const constructions = await db.collection('constructions').find({ offerId: o.id }).toArray();
            console.log(`  -> Constructions count: ${constructions.length}`);
            for (const c of constructions) {
                console.log(`     - Const ID: ${c.id}, Name: ${c.name}, Type: ${c.type}, TotalCost: ${c.totalCost}`);
            }
        }
    } finally {
        await client.close();
    }
}

inspect();
