/**
 * Diagnoza — wypisuje strukturę pierwszych 3 zleceń z bazy
 */
const { MongoClient } = require('mongodb');
const MONGO_URI = 'mongodb://127.0.0.1:27017/costframe';

async function main() {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db();

        const allJobs = await db.collection('jobs').find({}).toArray();
        console.log(`\n=== Łączna liczba zleceń: ${allJobs.length} ===\n`);

        allJobs.slice(0, 5).forEach((job, i) => {
            console.log(`--- Zlecenie ${i + 1}: ${job.jobCode || job.id} ---`);
            // Show all keys
            const keys = Object.keys(job);
            console.log('Klucze:', keys.join(', '));
            // Show financial fields
            console.log('offerId:', job.offerId);
            console.log('sourceOfferId:', job.sourceOfferId);
            console.log('materialsPlannedNet:', job.materialsPlannedNet);
            console.log('laborPlannedNet:', job.laborPlannedNet);
            console.log('revenuePlannedNet:', job.revenuePlannedNet);
            console.log('totalPlannedRevenueNet:', job.totalPlannedRevenueNet);
            console.log('plannedTotalCost:', job.plannedTotalCost);
            console.log('');
        });

        // Check offers
        const allOffers = await db.collection('offers').find({}).toArray();
        console.log(`=== Łączna liczba ofert: ${allOffers.length} ===`);
        allOffers.slice(0, 3).forEach((o, i) => {
            console.log(`Oferta ${i + 1}: ${o.number} | id: ${o.id} | totalNet: ${o.totalNet} | totalCost: ${o.totalCost} | materialsCost: ${o.materialsCost} | laborCost: ${o.laborCost} | costBreakdown:`, o.costBreakdown);
        });

    } finally {
        await client.close();
    }
}
main().catch(console.error);
