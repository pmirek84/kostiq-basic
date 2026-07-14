
const { MongoClient } = require('mongodb');

async function listExtraWorks() {
    const uri = "mongodb://127.0.0.1:27017";
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('costframe');
        const collection = db.collection('extra-works');

        const docs = await collection.find({}).toArray();
        console.log(`TOTAL RECORDS: ${docs.length}`);

        for (const doc of docs) {
            console.log(`--- Record ID: ${doc._id} ---`);
            console.log(`Title: ${doc.title}`);
            console.log(`JobId: ${doc.jobId}`);
            console.log(`RequestedBy: ${doc.requestedBy}`);
            console.log(`RequestedDate: ${doc.requestedDate}`);
            if (doc.photo) {
                console.log(`Photo exists. Length: ${doc.photo.length}`);
                console.log(`Photo starts with: ${doc.photo.substring(0, 50)}...`);
            } else {
                console.log(`No photo.`);
            }
        }
    } finally {
        await client.close();
    }
}

listExtraWorks();
