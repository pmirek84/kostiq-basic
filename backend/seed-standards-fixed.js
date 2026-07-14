/**
 * seed-standards-fixed.js
 * Wypelnia kolekcje 'standards' (standardy montazu) laczac je z realnymi materialami w bazie MongoDB.
 */
const { MongoClient } = require('mongodb');
const { randomUUID } = require('crypto');

require('dotenv').config();
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/costframe';

async function seed() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db();
    console.log('✅ Polaczono z MongoDB:', MONGO_URI);

    const materialsColl = db.collection('materials');
    const materials = await materialsColl.find({}).toArray();
    console.log(`Loaded ${materials.length} materials from DB.`);

    const findMatId = (name) => {
        const mat = materials.find(m => m.name.toLowerCase().includes(name.toLowerCase()));
        if (!mat) {
            console.warn(`Could not find material matching: ${name}`);
            return '';
        }
        return mat.id || mat._id.toString();
    };

    // Find specific materials
    const pianaLow = findMatId('Pianka PUR niskopręźna') || findMatId('Pianka PUR niskoprężna 750ml');
    const tape10 = findMatId('Taśma rozprężna 10/4-9mm');
    const tape20 = findMatId('Taśma rozprężna 20/4-12mm');
    const tapeParo = findMatId('Taśma paroizolacyjna 60mm') || findMatId('Folia paroprzepuszczalna');
    const uszczelkaPE = findMatId('Uszczelka piankowa PE 9x6mm');
    const silikonSzary = findMatId('Silikon budowlany szary');
    const listwaPVC = findMatId('Listwa wykończeniowa PVC 9mm');

    const now = new Date().toISOString();

    const standards = [
        {
            id: randomUUID(),
            name: 'Standard PVC – Piana + Taśma 3-warstwowa',
            description: 'Montaż okien PVC z pianką PU, taśmą rozprężną 3-warstw. i folią paroprzepuszczalną',
            applicableTypes: ['okno_pvc', 'drzwi_pvc', 'hs_pvc'],
            isDefault: true,
            rules: [
                { id: randomUUID(), edge: 'perimeter', materialId: pianaLow, usagePerMeter: 0.08, usageUnit: 'szt/mb' },
                { id: randomUUID(), edge: 'perimeter', materialId: tape10, usagePerMeter: 1.0, usageUnit: 'mb/mb' },
                { id: randomUUID(), edge: 'perimeter', materialId: tapeParo, usagePerMeter: 1.0, usageUnit: 'mb/mb' }
            ],
            createdAt: now,
            updatedAt: now,
            isActive: true
        },
        {
            id: randomUUID(),
            name: 'Standard PVC – Piana + Taśma 2-warstwowa',
            description: 'Montaż okien PVC z pianką PU i taśmą ILLMOD/NORM',
            applicableTypes: ['okno_pvc', 'drzwi_pvc'],
            isDefault: false,
            rules: [
                { id: randomUUID(), edge: 'perimeter', materialId: pianaLow, usagePerMeter: 0.08, usageUnit: 'szt/mb' },
                { id: randomUUID(), edge: 'perimeter', materialId: tape20, usagePerMeter: 1.0, usageUnit: 'mb/mb' }
            ],
            createdAt: now,
            updatedAt: now,
            isActive: true
        },
        {
            id: randomUUID(),
            name: 'Standard ALU – Piana + Sznur + Kit',
            description: 'Montaż alu: pianka PU, sznur polietylenowy, kit poliuretanowy',
            applicableTypes: ['okno_alu', 'drzwi_alu', 'hs_alu', 'fasada', 'witryna'],
            isDefault: true,
            rules: [
                { id: randomUUID(), edge: 'perimeter', materialId: pianaLow, usagePerMeter: 0.10, usageUnit: 'szt/mb' },
                { id: randomUUID(), edge: 'perimeter', materialId: uszczelkaPE, usagePerMeter: 1.0, usageUnit: 'mb/mb' },
                { id: randomUUID(), edge: 'perimeter', materialId: silikonSzary, usagePerMeter: 0.05, usageUnit: 'szt/mb' }
            ],
            createdAt: now,
            updatedAt: now,
            isActive: true
        },
        {
            id: randomUUID(),
            name: 'Standard ALU – Piana bez uszczelnień',
            description: 'Uproszczony montaż alu: tylko pianka PU (klient zapewnia uszczelnienie)',
            applicableTypes: ['okno_alu', 'drzwi_alu', 'witryna', 'fasada'],
            isDefault: false,
            rules: [
                { id: randomUUID(), edge: 'perimeter', materialId: pianaLow, usagePerMeter: 0.10, usageUnit: 'szt/mb' }
            ],
            createdAt: now,
            updatedAt: now,
            isActive: true
        },
        {
            id: randomUUID(),
            name: 'Standard Fasada słupowo-ryglowa',
            description: 'Montaż fasady sl-ry: pianka, uszczelki obwodowe, śruby montażowe',
            applicableTypes: ['fasada', 'fix'],
            isDefault: true,
            rules: [
                { id: randomUUID(), edge: 'perimeter', materialId: pianaLow, usagePerMeter: 0.12, usageUnit: 'szt/mb' },
                { id: randomUUID(), edge: 'perimeter', materialId: uszczelkaPE, usagePerMeter: 1.0, usageUnit: 'mb/mb' }
            ],
            createdAt: now,
            updatedAt: now,
            isActive: true
        },
        {
            id: randomUUID(),
            name: 'Standard Roleta zewnętrzna',
            description: 'Montaż rolet zew: kotwy, pianka montażowa, listy maskujące',
            applicableTypes: ['roleta_zew'],
            isDefault: true,
            rules: [
                { id: randomUUID(), edge: 'top', materialId: pianaLow, usagePerMeter: 1.0, usageUnit: 'szt/mb' },
                { id: randomUUID(), edge: 'vertical', materialId: listwaPVC, usagePerMeter: 0.5, usageUnit: 'mb/mb' }
            ],
            createdAt: now,
            updatedAt: now,
            isActive: true
        },
        {
            id: randomUUID(),
            name: 'Standard Żaluzja fasadowa / ZIP Screen',
            description: 'Montaż żaluzji/ZIP: prowadnice, śruby, uszczelki',
            applicableTypes: ['zaluzja_fasadowa', 'zip_screen'],
            isDefault: true,
            rules: [
                { id: randomUUID(), edge: 'vertical', materialId: uszczelkaPE, usagePerMeter: 1.0, usageUnit: 'mb/mb' },
                { id: randomUUID(), edge: 'top', materialId: listwaPVC, usagePerMeter: 1.0, usageUnit: 'mb/mb' }
            ],
            createdAt: now,
            updatedAt: now,
            isActive: true
        },
        {
            id: randomUUID(),
            name: 'Standard Pergola aluminiowa',
            description: 'Montaż pergoli alu: kotwy, śruby posadowienia, uszczelki dachowe',
            applicableTypes: ['pergola'],
            isDefault: true,
            rules: [
                { id: randomUUID(), edge: 'perimeter', materialId: uszczelkaPE, usagePerMeter: 0.15, usageUnit: 'mb/mb' }
            ],
            createdAt: now,
            updatedAt: now,
            isActive: true
        }
    ];

    const coll = db.collection('standards');
    await coll.deleteMany({});
    const result = await coll.insertMany(standards);
    console.log(`✅ Standardy montazu: wstawiono ${result.insertedCount} rekordów z połączonymi materialId!`);

    await client.close();
    console.log('🎉 Seedowanie standardów zakonczone!');
}

seed().catch(err => {
    console.error('❌ Blad seedowania:', err.message);
    process.exit(1);
});
