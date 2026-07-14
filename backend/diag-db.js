
const { MongoClient } = require('mongodb');

async function diag() {
    const uri = "mongodb://127.0.0.1:27017";
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('costframe');
        const collection = db.collection('extra-works');

        const docs = await collection.find({}).toArray();
        console.log(`TOTAL RECORDS: ${docs.length}`);

        docs.forEach((doc, i) => {
            console.log(`\n--- RECORD ${i + 1} ---`);
            Object.keys(doc).forEach(key => {
                let val = doc[key];
                if (typeof val === 'string' && val.length > 100) {
                    console.log(`${key}: [STRING, length ${val.length}, starts with: ${val.substring(0, 50)}...]`);
                } else {
                    console.log(`${key}: ${JSON.stringify(val)}`);
                }
            });
        });
    } finally {
        await client.close();
    }
}

diag();
