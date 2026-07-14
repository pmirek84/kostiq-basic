const { MongoClient } = require('mongodb');
const MONGO_URI = 'mongodb://127.0.0.1:27017/costframe';

async function main() {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db();

        console.log('--- DIAGNOSTYKA MATERIAŁÓW (BOM) ---');

        // 1. Zlecenia
        const jobs = await db.collection('jobs').find({}).toArray();
        console.log(`\nLiczba zleceń w bazie: ${jobs.length}`);

        // 2. Standardy montażu
        const standards = await db.collection('standards').find({}).toArray();
        console.log(`Liczba standardów montażu: ${standards.length}`);
        standards.forEach(s => {
            console.log(` - Standard: "${s.name}" | isDefault: ${s.isDefault} | reguły: ${s.rules?.length || 0}`);
        });

        // 3. Materiały
        const materials = await db.collection('materials').find({}).toArray();
        console.log(`Liczba materiałów: ${materials.length}`);

        // 4. Konstrukcje w ofertach
        const constructions = await db.collection('constructions').find({}).toArray();
        console.log(`Liczba konstrukcji ogółem: ${constructions.length}`);

        // 5. Analiza powiązań dla każdego zlecenia
        for (const job of jobs) {
            console.log(`\nZlecenie: ${job.jobCode} (${job.name})`);
            const offerId = job.offerId || job.sourceOfferId;
            console.log(` - Powiązane offerId: ${offerId}`);

            if (offerId) {
                const jobConstructions = constructions.filter(c => c.offerId === offerId);
                console.log(` - Liczba konstrukcji dla tej oferty: ${jobConstructions.length}`);
                
                jobConstructions.forEach(c => {
                    console.log(`   * Konstrukcja: "${c.name}" (${c.id}) | wymiary: ${c.widthMm || c.width}x${c.heightMm || c.height} | ilość: ${c.quantity}`);
                    console.log(`     materialBreakdown:`, c.materialBreakdown);
                });
            } else {
                console.log(' - Brak powiązanego offerId!');
            }

            // Sprawdź JobStageItems
            const stageItems = await db.collection('jobStageItems').find({ jobId: job.id }).toArray();
            console.log(` - Liczba przypisanych etapów/konstrukcji (JobStageItem): ${stageItems.length}`);
        }

    } finally {
        await client.close();
    }
}

main().catch(console.error);
