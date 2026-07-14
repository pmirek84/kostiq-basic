const { MongoClient } = require('mongodb');
const mongoUri = 'mongodb://127.0.0.1:27017/costframe';

async function fix() {
    const client = new MongoClient(mongoUri);
    try {
        await client.connect();
        const db = client.db();

        // 1. Update Budex Sp. z o.o.
        await db.collection('clients').updateOne(
            { name: "Budex Sp. z o.o." },
            { $set: { id: "b6d091ed-bd8c-4efc-a93c-b4ea136b9504" } }
        );
        console.log('Updated Budex ID');

        // 2. Update Jan Testowy (if exists)
        await db.collection('clients').updateOne(
            { name: "Jan Testowy" },
            { $set: { id: "7888bfc3-db12-4ce9-bc9e-605bbb715780" } }
        );
        console.log('Updated Jan Testowy ID');

        // Check if there are other clients needing fix?
        // Diagnostic showed:
        // ID: 0515790f-97b7-4be4-a0c3-ff09d2d4433f, _ID: ..., Name: Budex
        // ID: 7888bfc3-db12-4ce9-bc9e-605bbb715780, Name: Jan Testowy? Or maybe it was already correct but missing?
        // Let's re-verify IDs in diag-db.js output from before:
        /*
        --- CLIENTS ---
        ID: 0515790f-97b7-4be4-a0c3-ff09d2d4433f, _ID: 69aaecb9d0..., Name: Budex Sp. z o.o.
        ...
        */

    } finally {
        await client.close();
    }
}
fix();
