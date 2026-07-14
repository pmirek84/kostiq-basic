const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/costframe';

async function main() {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db();
        const rates = await db.collection('logistics-rates').find({}).toArray();
        console.log('LOGISTICS RATES IN DB:');
        console.log(JSON.stringify(rates, null, 2));
    } finally {
        await client.close();
    }
}
main();
