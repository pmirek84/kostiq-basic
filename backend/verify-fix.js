const { MongoClient } = require('mongodb');
const mongoUri = 'mongodb://127.0.0.1:27017/costframe';

async function verify() {
    const client = new MongoClient(mongoUri);
    try {
        await client.connect();
        const db = client.db();

        console.log('--- CLIENTS (Detailed) ---');
        const clients = await db.collection('clients').find({}).toArray();
        clients.forEach(c => {
            console.log(`- [${c.name || c.company}] id: ${c.id}, _id: ${c._id}`);
        });

        console.log('\n--- OFFERS (Client Mapping Check) ---');
        const offers = await db.collection('offers').find({}).toArray();
        offers.forEach(o => {
            const found = clients.find(c => c.id === o.clientId);
            console.log(`- Offer ${o.number} refs client ${o.clientId} -> ${found ? (found.name || found.company) : 'NOT FOUND'}`);
        });

    } finally {
        await client.close();
    }
}
verify();
