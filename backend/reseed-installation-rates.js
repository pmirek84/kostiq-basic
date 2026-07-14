/**
 * reseed-installation-rates.js
 * Wypelnia kolekcje 'installation-rates' stawkami montazowymi pasujacymi do typow konstrukcji w aplikacji.
 */
const { MongoClient } = require('mongodb');
const { randomUUID } = require('crypto');

require('dotenv').config();
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/costframe';

const installationRates = [
    { type: 'Okno PVC', rate: 120, unit: 'm²' },
    { type: 'Okno Alu', rate: 150, unit: 'm²' },
    { type: 'Okno Drewno', rate: 140, unit: 'm²' },
    { type: 'Drzwi PVC', rate: 200, unit: 'szt.' },
    { type: 'Drzwi Alu', rate: 250, unit: 'szt.' },
    { type: 'Drzwi Drewno', rate: 220, unit: 'szt.' },
    { type: 'HS PVC', rate: 300, unit: 'm²' },
    { type: 'HS Alu', rate: 350, unit: 'm²' },
    { type: 'HS Drewno', rate: 330, unit: 'm²' },
    { type: 'Fasada', rate: 400, unit: 'm²' },
    { type: 'Witryna', rate: 300, unit: 'm²' },
    { type: 'Fix', rate: 150, unit: 'm²' },
    { type: 'Pergola', rate: 180, unit: 'm²' },
    { type: 'Roleta Zew.', rate: 100, unit: 'szt.' },
    { type: 'Żaluzja Fasad.', rate: 120, unit: 'm²' },
    { type: 'Zip Screen', rate: 90, unit: 'm²' }
].map(r => ({ ...r, id: randomUUID(), isActive: true }));

async function seed() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db();
    console.log('✅ Polaczono z MongoDB:', MONGO_URI);

    const coll = db.collection('installation-rates');
    await coll.deleteMany({});
    const result = await coll.insertMany(installationRates);
    console.log(`✅ Stawki montazowe: wstawiono ${result.insertedCount} rekordów do bazy MongoDB!`);

    await client.close();
    console.log('🎉 Seedowanie stawek zakonczone!');
}

seed().catch(err => {
    console.error('❌ Blad seedowania:', err.message);
    process.exit(1);
});
