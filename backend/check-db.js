const { MongoClient } = require('mongodb');
const uri = 'mongodb://127.0.0.1:27017/costframe';
const client = new MongoClient(uri);

async function run() {
    try {
        await client.connect();
        console.log("SUCCESS: Connected to MongoDB");
        const db = client.db();

        const collections = ['clients', 'offers', 'constructions', 'jobs', 'employees'];
        for (const col of collections) {
            const items = await db.collection(col).find({}).toArray();
            console.log(`--- ${col} ---`);
            console.log(`Count: ${items.length}`);

            const idCounts = {};
            items.forEach(item => {
                const id = item.id || item._id.toString();
                idCounts[id] = (idCounts[id] || 0) + 1;
            });
            const duplicates = Object.keys(idCounts).filter(id => idCounts[id] > 1);
            if (duplicates.length > 0) {
                console.log(`FOUND ${duplicates.length} DUPLICATE IDs in ${col}`);
                duplicates.forEach(id => console.log(` - Duplicate ID: ${id} (${idCounts[id]} times)`));
            } else {
                console.log(`No duplicates in ${col}`);
            }
        }
    } catch (err) {
        console.error("FAILURE:", err);
    } finally {
        await client.close();
    }
}
run();
