/**
 * seed-costbase.js
 * Wypełnia domyślnymi danymi kolekcje:
 *   installation-rates, logistics-rates, rental-rates, sheet-metal
 *
 * Uruchomienie: node seed-costbase.js
 */
const { MongoClient } = require('mongodb');
const { randomUUID } = require('crypto');

require('dotenv').config();
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/costframe';

// ─── STAWKI MONTAŻU ───────────────────────────────────────────────────────────
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

// ─── LOGISTYKA (stawki km) ────────────────────────────────────────────────────
const logisticsRates = [
    { vehicleType: 'Samochód osobowy', ratePerKm: 0.89, description: 'Dojazd pracownika / pomiar' },
    { vehicleType: 'Bus dostawczy (do 3.5t)', ratePerKm: 1.50, description: 'Transport okien i akcesoriów' },
    { vehicleType: 'Ciężarówka (powyżej 3.5t)', ratePerKm: 2.80, description: 'Transport ciężkich konstrukcji' },
    { vehicleType: 'Laweta / transport specjalny', ratePerKm: 3.50, description: 'Duże gabaryty, bramy' },
].map(r => ({ ...r, id: randomUUID(), isActive: true }));

// ─── WYNAJEM SPRZĘTU ─────────────────────────────────────────────────────────
const rentalRates = [
    { name: 'Rusztowanie modułowe', unit: 'dzień', unitPrice: 80, category: 'Rusztowania', minRentalPeriod: '1 dzień', availability: 'Dostępne' },
    { name: 'Zwyżka spalinowa 12m', unit: 'dzień', unitPrice: 350, category: 'Podnośniki', minRentalPeriod: '1 dzień', availability: 'Dostępne' },
    { name: 'Zwyżka elektryczna 8m', unit: 'dzień', unitPrice: 250, category: 'Podnośniki', minRentalPeriod: '1 dzień', availability: 'Dostępne' },
    { name: 'Klejarka pianki PU', unit: 'dzień', unitPrice: 30, category: 'Narzędzia', minRentalPeriod: '1 dzień', availability: 'Dostępne' },
    { name: 'Klucz udarowy elektryczny', unit: 'dzień', unitPrice: 25, category: 'Narzędzia', minRentalPeriod: '1 dzień', availability: 'Dostępne' },
    { name: 'Agregat prądotwórczy', unit: 'dzień', unitPrice: 120, category: 'Energia', minRentalPeriod: '1 dzień', availability: 'Dostępne' },
    { name: 'Przyczepa laweta', unit: 'dzień', unitPrice: 180, category: 'Transport', minRentalPeriod: '1 dzień', availability: 'Dostępne' },
].map(r => ({ ...r, id: randomUUID(), isActive: true }));

// ─── OBRÓBKI BLACHARSKIE ─────────────────────────────────────────────────────
const sheetMetal = [
    { name: 'Parapet zewnętrzny stalowy', type: 'Parapet', material: 'Stal powlekana', finishing: 'Kolor RAL', thickness: 1.0, width: 240, length: 6000, color: 'Szary', unitPrice: 28, unit: 'mb', category: 'Parapety' },
    { name: 'Parapet zewnętrzny aluminiowy', type: 'Parapet', material: 'Aluminium', finishing: 'Anodowany', thickness: 1.5, width: 200, length: 6000, color: 'Srebrny', unitPrice: 45, unit: 'mb', category: 'Parapety' },
    { name: 'Obróbka podokiennika (góra)', type: 'Podokiennik', material: 'Stal powlekana', finishing: 'Gładki', thickness: 0.7, width: 150, length: 2000, color: 'Biały', unitPrice: 18, unit: 'mb', category: 'Podokienniki' },
    { name: 'Obróbka ościeżnicowa boczna', type: 'Ościeżnica', material: 'Stal powlekana', finishing: 'Gładki', thickness: 0.7, width: 120, length: 2000, color: 'Biały', unitPrice: 16, unit: 'mb', category: 'Ościeżnice' },
    { name: 'Kapinos nad oknem', type: 'Kapinos', material: 'Aluminium', finishing: 'Lakier', thickness: 1.5, width: 60, length: 6000, color: 'Srebrny', unitPrice: 22, unit: 'mb', category: 'Kapinosy' },
    { name: 'Obróbka attyki (czapka)', type: 'Attyka', material: 'Stal powlekana', finishing: 'Kolor RAL', thickness: 1.0, width: 300, length: 2000, color: 'Grafitowy', unitPrice: 35, unit: 'mb', category: 'Attyki' },
    { name: 'Blachowanie nadproża', type: 'Nadproże', material: 'Stal powlekana', finishing: 'Gładki', thickness: 0.7, width: 200, length: 2000, color: 'Biały', unitPrice: 20, unit: 'mb', category: 'Nadproża' },
    { name: 'Uszczelnienie kąt blachy Al', type: 'Uszczelnienie', material: 'Aluminium', finishing: 'Surowy', thickness: 1.0, width: 40, length: 2000, color: 'Srebrny', unitPrice: 12, unit: 'mb', category: 'Uszczelnienia' },
].map(r => ({ ...r, id: randomUUID(), isActive: true }));

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function seed() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db();
    console.log('✅ Połączono z MongoDB:', MONGO_URI);

    const collections = [
        { name: 'installation-rates', data: installationRates, label: 'Stawki Montażu' },
        { name: 'logistics-rates', data: logisticsRates, label: 'Logistyka' },
        { name: 'rental-rates', data: rentalRates, label: 'Wynajem Sprzętu' },
        { name: 'sheet-metal', data: sheetMetal, label: 'Obróbki Blacharskie' },
    ];

    for (const col of collections) {
        const coll = db.collection(col.name);
        const existing = await coll.countDocuments();
        if (existing > 0) {
            console.log(`⏭  ${col.label} (${col.name}): już ma ${existing} rekordów — pomijam`);
            continue;
        }
        const result = await coll.insertMany(col.data);
        console.log(`✅ ${col.label} (${col.name}): wstawiono ${result.insertedCount} rekordów`);
    }

    await client.close();
    console.log('\n🎉 Seedowanie zakończone!');
}

seed().catch(err => {
    console.error('❌ Błąd seedowania:', err.message);
    process.exit(1);
});
