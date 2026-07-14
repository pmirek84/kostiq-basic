/**
 * fix-job-financials.js (v2)
 * 
 * Migracja: uzupełnia zerowe pola finansowe w zleceniach.
 * Obsługuje trzy przypadki:
 *   1. Zlecenie ma offerId/sourceOfferId → pull z oferty
 *   2. Zlecenie ma zera w polach kosztów → próbuje dopasować ofertę po numerze lub kwocie
 *   3. Fallback: szacuje proporcje na podstawie revenuePlannedNet
 * 
 * Uruchomienie:
 *   node fix-job-financials.js            ← zapisuje zmiany
 *   node fix-job-financials.js --dry-run  ← tylko podgląd, bez zapisu
 */

const { MongoClient } = require('mongodb');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/costframe';
const DRY_RUN = process.argv.includes('--dry-run');

// Typowe proporcje kosztów własnych w branży stolarki aluminiowej/PVC
// Ukryte założenie: revenue = totalCost * (1 + margin)
// Gdy nie ma danych szczegółowych, szacujemy strukturę kosztów:
const COST_RATIOS = {
    materials: 0.55,   // 55% - materiały
    labor: 0.30,   // 30% - robocizna
    logistics: 0.10,   // 10% - transport
    equipment: 0.05,   // 5%  - sprzęt
};

function buildPatchFromOffer(offer, job) {
    const cb = offer.costBreakdown || {};
    const mat = cb.material_cost ?? offer.materialsCost ?? 0;
    const lab = cb.assembly_cost ?? offer.laborCost ?? 0;
    const log = cb.transport_cost ?? offer.constructionTransportCost ?? offer.logisticsCost ?? 0;
    const eqp = cb.equipment_rental_cost ?? offer.equipmentRentalCost ?? 0;
    const oth = offer.otherCosts ?? 0;
    const totalCost = mat + lab + log + eqp + oth;
    const revenue = offer.totalNet || offer.totalCost || totalCost || 0;

    return { mat, lab, log, eqp, oth, totalCost, revenue, source: `oferta ${offer.number}` };
}

function buildPatchFromRevenue(revenue) {
    // Estymuj koszty własne = ~75% przychodu (marża ~25%)
    const ownCostEstimate = revenue * 0.75;
    const mat = parseFloat((ownCostEstimate * COST_RATIOS.materials).toFixed(2));
    const lab = parseFloat((ownCostEstimate * COST_RATIOS.labor).toFixed(2));
    const log = parseFloat((ownCostEstimate * COST_RATIOS.logistics).toFixed(2));
    const eqp = parseFloat((ownCostEstimate * COST_RATIOS.equipment).toFixed(2));
    const totalCost = mat + lab + log + eqp;
    return { mat, lab, log, eqp, oth: 0, totalCost, revenue, source: 'estymacja (75% przychodu)' };
}

async function main() {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db();

        const jobs = await db.collection('jobs').find({}).toArray();
        const offers = await db.collection('offers').find({}).toArray();

        const offerById = new Map(offers.map(o => [o.id, o]));
        const offerByNumber = new Map(offers.map(o => [o.number, o]));

        console.log(`\n📋 Znaleziono ${jobs.length} zleceń | ${offers.length} ofert`);
        if (DRY_RUN) console.log('⚠️  TRYB DRY-RUN — brak zapisu\n');
        else console.log();

        let updated = 0, skipped = 0;

        for (const job of jobs) {
            const revenue = job.revenuePlannedNet || job.totalPlannedRevenueNet || 0;

            // Check if needs fixing
            const hasCosts = (job.materialsPlannedNet || 0) > 0
                || (job.laborPlannedNet || 0) > 0
                || (job.plannedTotalCost || 0) > 0;

            if (hasCosts) {
                console.log(`  ✅ [${job.jobCode}] OK — ma dane kosztów`);
                skipped++;
                continue;
            }

            // Try to resolve offer
            let resolved = null;
            const offerId = job.sourceOfferId || job.offerId;

            if (offerId && offerById.has(offerId)) {
                resolved = buildPatchFromOffer(offerById.get(offerId), job);
            } else if (job.offerNumber && offerByNumber.has(job.offerNumber)) {
                resolved = buildPatchFromOffer(offerByNumber.get(job.offerNumber), job);
            } else if (revenue > 0) {
                // Try to match offer by totalNet/totalCost close to revenue
                const matchingOffer = offers.find(o =>
                    Math.abs((o.totalNet || o.totalCost || 0) - revenue) < 1
                );
                if (matchingOffer) {
                    resolved = buildPatchFromOffer(matchingOffer, job);
                } else {
                    // No offer — estimate from revenue
                    resolved = buildPatchFromRevenue(revenue);
                }
            }

            if (!resolved) {
                console.log(`  ⚠️  [${job.jobCode}] Brak danych do uzupełnienia (brak przychodu i oferty)`);
                skipped++;
                continue;
            }

            const { mat, lab, log, eqp, oth, totalCost, source } = resolved;
            const margin = resolved.revenue > 0
                ? parseFloat((((resolved.revenue - totalCost) / resolved.revenue) * 100).toFixed(2))
                : 0;

            const patch = {
                materialsPlannedNet: mat,
                laborPlannedNet: lab,
                logisticsPlannedNet: log,
                equipmentPlannedNet: eqp,
                otherCostsNet: oth,
                plannedTotalCost: parseFloat(totalCost.toFixed(2)),
                revenuePlannedNet: resolved.revenue,
                totalPlannedRevenueNet: resolved.revenue,
                marginPlannedPercent: margin,
                updatedAt: new Date().toISOString(),
            };

            // Only set laborPlannedCost if laborPlannedNet was set
            if (lab > 0 && !(job.plannedLaborCost > 0)) {
                patch.plannedLaborCost = lab;
            }

            console.log(`  🔧 [${job.jobCode}] "${job.name}" ← źródło: ${source}`);
            console.log(`     Mat: ${mat} zł | Rob: ${lab} zł | Log: ${log} zł | Eqp: ${eqp} zł | Razem: ${totalCost.toFixed(2)} zł | Rev: ${resolved.revenue} zł | Marża: ${margin}%`);

            if (!DRY_RUN) {
                const result = await db.collection('jobs').updateOne(
                    { id: job.id },
                    { $set: patch }
                );
                if (result.modifiedCount > 0) console.log(`     → ✅ Zapisano`);
                else console.log(`     → ⚠️ Nie zapisano (może id nie pasuje do filtru?)`);
            }
            updated++;
        }

        console.log(`\n${'─'.repeat(50)}`);
        console.log(`✅ Wynik: ${updated} zaktualizowanych, ${skipped} pominiętych`);
        if (DRY_RUN) {
            console.log(`\n   ℹ️  Aby zapisać zmiany, uruchom:`);
            console.log(`   node fix-job-financials.js\n`);
        }

    } finally {
        await client.close();
    }
}

main().catch(err => {
    console.error('❌ Błąd:', err);
    process.exit(1);
});
