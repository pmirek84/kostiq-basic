
const { MongoClient } = require('mongodb');

async function diag() {
    const uri = "mongodb://127.0.0.1:27017";
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('costframe');
        const collection = db.collection('extra-works');

        const doc = await collection.findOne({ _id: "69ab01079d01243d97068d12" });
        if (!doc) {
            console.log("NOT FOUND by _id as string. Trying ObjectId.");
            const { ObjectId } = require('mongodb');
            const doc2 = await collection.findOne({ _id: new ObjectId("69ab01079d01243d97068d12") });
            if (doc2) report(doc2);
            else console.log("Still not found.");
        } else {
            report(doc);
        }

        function report(doc) {
            console.log("KEYS FOUND:");
            Object.keys(doc).forEach(key => {
                console.log(`- Key: [${key}] (Length: ${key.length})`);
                const val = doc[key];
                if (typeof val === 'string') {
                    console.log(`  Value Type: String, Length: ${val.length}, Snippet: ${val.substring(0, 50)}`);
                } else {
                    console.log(`  Value: ${JSON.stringify(val)}`);
                }
            });
        }

    } finally {
        await client.close();
    }
}

diag();
