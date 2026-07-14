/**
 * seed-standards.js
 * Wypełnia kolekcję 'standards' (standardy montażu)
 * Uruchomienie: node seed-standards.js
 */
const { MongoClient } = require('mongodb');
const { randomUUID } = require('crypto');

require('dotenv').config();
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/costframe';

const now = new Date().toISOString();

// Każdy standard ma: id, name, description, applicableTypes, rules, isDefault, createdAt, updatedAt
// rules: [ { id, edge, materialId, usagePerMeter, usageUnit } ]
// materialId = '' gdy standardy są ogólne (bez powiązanego katalogu materiałów)

const standards = [

    // ─── OKNA PVC ─────────────────────────────────────────────────────────────
    {
        id: randomUUID(),
        name: 'Standard PVC – Piana + Taśma 3-warstwowa',
        description: 'Montaż okien PVC z pianką PU, taśmą rozprężną 3-warstw. i folią paroprzepuszczalną',
        applicableTypes: ['okno_pvc', 'drzwi_pvc', 'hs_pvc'],
        isDefault: true,
        rules: [
            { id: randomUUID(), edge: 'perimeter', materialId: '', usagePerMeter: 0.08, usageUnit: 'kg/mb' },   // Pianka PU
            { id: randomUUID(), edge: 'perimeter', materialId: '', usagePerMeter: 1.0, usageUnit: 'mb/mb' },   // Taśma rozprężna
            { id: randomUUID(), edge: 'perimeter', materialId: '', usagePerMeter: 1.0, usageUnit: 'mb/mb' }    // Folia paroprzep.
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
            { id: randomUUID(), edge: 'perimeter', materialId: '', usagePerMeter: 0.08, usageUnit: 'kg/mb' },
            { id: randomUUID(), edge: 'perimeter', materialId: '', usagePerMeter: 1.0, usageUnit: 'mb/mb' }
        ],
        createdAt: now,
        updatedAt: now,
        isActive: true
    },

    // ─── OKNA ALUMINIOWE ──────────────────────────────────────────────────────
    {
        id: randomUUID(),
        name: 'Standard ALU – Piana + Sznur + Kit',
        description: 'Montaż alu: pianka PU, sznur polietylenowy, kit poliuretanowy',
        applicableTypes: ['okno_alu', 'drzwi_alu', 'hs_alu', 'fasada', 'witryna'],
        isDefault: true,
        rules: [
            { id: randomUUID(), edge: 'perimeter', materialId: '', usagePerMeter: 0.10, usageUnit: 'kg/mb' },
            { id: randomUUID(), edge: 'perimeter', materialId: '', usagePerMeter: 1.0, usageUnit: 'mb/mb' },
            { id: randomUUID(), edge: 'perimeter', materialId: '', usagePerMeter: 0.05, usageUnit: 'kg/mb' }
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
            { id: randomUUID(), edge: 'perimeter', materialId: '', usagePerMeter: 0.10, usageUnit: 'kg/mb' }
        ],
        createdAt: now,
        updatedAt: now,
        isActive: true
    },

    // ─── FASADY / WITRYNY ─────────────────────────────────────────────────────
    {
        id: randomUUID(),
        name: 'Standard Fasada słupowo-ryglowa',
        description: 'Montaż fasady sl-ry: pianka, uszczelki obwodowe, śruby montażowe',
        applicableTypes: ['fasada', 'fix'],
        isDefault: true,
        rules: [
            { id: randomUUID(), edge: 'perimeter', materialId: '', usagePerMeter: 0.12, usageUnit: 'kg/mb' },
            { id: randomUUID(), edge: 'perimeter', materialId: '', usagePerMeter: 1.0, usageUnit: 'mb/mb' }
        ],
        createdAt: now,
        updatedAt: now,
        isActive: true
    },

    // ─── ROLETY ZEWNĘTRZNE ────────────────────────────────────────────────────
    {
        id: randomUUID(),
        name: 'Standard Roleta zewnętrzna',
        description: 'Montaż rolet zew: kotwy, pianka montażowa, listy maskujące',
        applicableTypes: ['roleta_zew'],
        isDefault: true,
        rules: [
            { id: randomUUID(), edge: 'top', materialId: '', usagePerMeter: 1.0, usageUnit: 'mb/mb' },
            { id: randomUUID(), edge: 'vertical', materialId: '', usagePerMeter: 0.5, usageUnit: 'mb/mb' }
        ],
        createdAt: now,
        updatedAt: now,
        isActive: true
    },

    // ─── ŻALUZJE FASADOWE / ZIP ───────────────────────────────────────────────
    {
        id: randomUUID(),
        name: 'Standard Żaluzja fasadowa / ZIP Screen',
        description: 'Montaż żaluzji/ZIP: prowadnice, śruby, uszczelki',
        applicableTypes: ['zaluzja_fasadowa', 'zip_screen'],
        isDefault: true,
        rules: [
            { id: randomUUID(), edge: 'vertical', materialId: '', usagePerMeter: 1.0, usageUnit: 'mb/mb' },
            { id: randomUUID(), edge: 'top', materialId: '', usagePerMeter: 1.0, usageUnit: 'mb/mb' }
        ],
        createdAt: now,
        updatedAt: now,
        isActive: true
    },

    // ─── PERGOLE ─────────────────────────────────────────────────────────────
    {
        id: randomUUID(),
        name: 'Standard Pergola aluminiowa',
        description: 'Montaż pergoli alu: kotwy, śruby posadowienia, uszczelki dachowe',
        applicableTypes: ['pergola'],
        isDefault: true,
        rules: [
            { id: randomUUID(), edge: 'perimeter', materialId: '', usagePerMeter: 0.15, usageUnit: 'kg/mb' }
        ],
        createdAt: now,
        updatedAt: now,
        isActive: true
    }
];

async function seed() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db();
    console.log('✅ Połączono z MongoDB:', MONGO_URI);

    const coll = db.collection('standards');
    const existing = await coll.countDocuments();

    if (existing > 0) {
        console.log(`⏭  Standardy: już ma ${existing} rekordów — pomijam`);
    } else {
        const result = await coll.insertMany(standards);
        console.log(`✅ Standardy montażu: wstawiono ${result.insertedCount} rekordów`);
    }

    await client.close();
    console.log('🎉 Seedowanie standardów zakończone!');
}

seed().catch(err => {
    console.error('❌ Błąd seedowania:', err.message);
    process.exit(1);
});
