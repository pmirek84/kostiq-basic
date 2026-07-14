const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

// URI from env or default
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/costframe';

async function resetAndSeed() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db();

        // 1. Check if we should clear (only if requested via --force)
        const forceReset = process.argv.includes('--force');
        const collections = ['clients', 'offers', 'jobs', 'materials', 'standards', 'employees', 'subcontractors', 'time-entries', 'crews', 'settlements', 'messages', 'requests', 'constructions', 'site-logs', 'custom-events', 'client-reports'];

        if (forceReset) {
            console.log('Forced reset: Clearing collections...');
            for (const colName of collections) {
                try {
                    await db.collection(colName).drop();
                    console.log(` - Dropped ${colName}`);
                } catch (e) {
                    // Ignore if ns not found
                }
            }
        } else {
            console.log('Safe mode: Checking for existing data...');
        }

        // Helper to seed only if empty
        const seedIfEmpty = async (colName, data) => {
            const count = await db.collection(colName).countDocuments();
            if (count === 0) {
                console.log(`Seeding ${colName}...`);
                if (Array.isArray(data)) {
                    await db.collection(colName).insertMany(data);
                } else {
                    await db.collection(colName).insertOne(data);
                }
            } else {
                console.log(`Skipping ${colName} (already has ${count} records)`);
            }
        };

        // 2. Seed Clients
        console.log('Seeding Clients...');
        const budexId = "b6d091ed-bd8c-4efc-a93c-b4ea136b9504";
        const janId = "7888bfc3-db12-4ce9-bc9e-605bbb715760";

        const clients = [
            {
                id: budexId,
                type: 'company',
                name: 'Budex Sp. z o.o.',
                lastName: '',
                nip: '1234567890',
                email: 'biuro@budex.pl',
                phone: '500 123 456',
                address: [{ street: 'Budowlana 1', city: 'Warszawa', zipCode: '00-001', country: 'Polska' }],
                status: 'active',
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: janId,
                type: 'individual',
                name: 'Jan',
                lastName: 'Testowy',
                nip: '',
                email: 'jan@test.pl',
                phone: '600 700 800',
                address: [{ street: 'Testowa 2', city: 'Poznań', zipCode: '60-001', country: 'Polska' }],
                status: 'active',
                isActive: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        ];
        await seedIfEmpty('clients', clients);

        // 3. Seed Offers
        console.log('Seeding Offers...');
        const templateId = uuidv4();
        const offers = [
            {
                id: templateId,
                number: 'WZÓR-STD-01',
                clientId: '',
                location: 'Koszalin',
                status: 'draft',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                materialsCost: 0,
                laborCost: 0,
                totalCost: 0,
                totalNet: 0,
                vatRate: 23,
                title: 'Wzór Oferty',
                offerTemplateType: 'detailed'
            },
            {
                id: "offer-2026-05-budex",
                number: 'OF/2026/05',
                clientId: budexId,
                location: 'Warszawa',
                status: 'accepted',
                totalCost: 45000,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: "offer-2026-05-jan",
                number: 'OF/2026/05',
                clientId: janId,
                location: 'Warszawa',
                status: 'sent',
                totalCost: 45000,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        ];
        await seedIfEmpty('offers', offers);

        // 4. Seed Employees
        console.log('Seeding Employees...');
        const saszaId = 'emp-sasza-001';
        const kamilId = 'emp-kamil-001';
        const crew1Id = 'crew-ekipa-1';

        const employees = [
            { id: 'admin-dev-id', type: 'employee', firstName: 'Paweł', lastName: 'Mirek', email: 'admin@kostiq.pl', role: 'admin', hourlyRate: 150, currency: 'PLN', isActive: true, pwaPassword: 'pass' },
            { id: saszaId, type: 'employee', firstName: 'Sasza', lastName: '', role: 'worker', hourlyRate: 60, currency: 'PLN', isActive: true, pwaPassword: 'pass', crewId: crew1Id },
            { id: kamilId, type: 'employee', firstName: 'Kamil', lastName: '', role: 'worker', hourlyRate: 60, currency: 'PLN', isActive: true, pwaPassword: 'pass', crewId: crew1Id },
            { id: uuidv4(), type: 'employee', firstName: 'Lubczyk', lastName: '', role: 'worker', hourlyRate: 60, currency: 'PLN', isActive: true, pwaPassword: 'pass' },
            { id: uuidv4(), type: 'employee', firstName: 'Mateusz', lastName: '', role: 'worker', hourlyRate: 60, currency: 'PLN', isActive: true, pwaPassword: 'pass' },
            { id: uuidv4(), type: 'employee', firstName: 'Grzegorz', lastName: '', role: 'worker', hourlyRate: 45, currency: 'PLN', isActive: true, pwaPassword: 'pass' },
            { id: uuidv4(), type: 'employee', firstName: 'Jan', lastName: 'Kowalski', role: 'foreman', hourlyRate: 80, currency: 'PLN', isActive: true, pwaPassword: 'pass' },
            { id: uuidv4(), type: 'employee', firstName: 'Piotr', lastName: 'Nowak', role: 'worker', hourlyRate: 60, currency: 'PLN', isActive: true, pwaPassword: 'pass' }
        ];
        await seedIfEmpty('employees', employees);

        // Ensure admin user always exists (even in safe mode)
        await db.collection('employees').updateOne(
            { id: 'admin-dev-id' },
            {
                $setOnInsert: {
                    id: 'admin-dev-id',
                    type: 'employee',
                    firstName: 'Paweł',
                    lastName: 'Mirek',
                    email: 'admin@kostiq.pl',
                    role: 'admin',
                    hourlyRate: 150,
                    currency: 'PLN',
                    isActive: true,
                    pwaPassword: 'pass'
                }
            },
            { upsert: true }
        );

        // 4.1 Seed Crews
        console.log('Seeding Crews...');
        const crews = [
            { id: crew1Id, name: 'Ekipa 1', color: '#3B82F6', leadId: saszaId, memberIds: [saszaId, kamilId] }
        ];
        await seedIfEmpty('crews', crews);

        // 5. Seed Subcontractors
        console.log('Seeding Subcontractors...');
        const subcontractors = [
            { id: uuidv4(), name: 'Firma Budowlana "Solid"', email: 'biuro@solid.pl', phone: '500 600 700', type: 'company', hourlyRate: 100, currency: 'PLN', specializations: ['montaż', 'lekka mokra'], active: true, createdAt: new Date().toISOString() }
        ];
        await seedIfEmpty('subcontractors', subcontractors);

        // 6. Seed Materials & Standards
        const foamId = uuidv4();
        const vaporIntId = uuidv4();
        const vaporExtId = uuidv4();
        const epsSillId = uuidv4();

        const materials = [
            { id: foamId, name: 'Pianka montażowa krótka', category: 'izolacyjne', unit: 'szt', defaultUnitPrice: 25.00, isActive: true },
            { id: vaporIntId, name: 'Taśma paroizolacyjna wewnętrzna', category: 'izolacyjne', unit: 'm', defaultUnitPrice: 10.00, isActive: true },
            { id: vaporExtId, name: 'Taśma paroprzepuszczalna zewnętrzna', category: 'izolacyjne', unit: 'm', defaultUnitPrice: 12.00, isActive: true },
            { id: epsSillId, name: 'Ciepły parapet EPS', category: 'podbudowy', unit: 'szt', defaultUnitPrice: 45.00, isActive: true }
        ];
        await seedIfEmpty('materials', materials);

        const standards = [
            {
                id: uuidv4(),
                name: 'Standard Podstawowy',
                isDefault: true,
                applicableTypes: ['okno_pvc'],
                rules: [{ id: uuidv4(), edge: 'vertical', materialId: foamId, usagePerMeter: 0.5 }],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: uuidv4(),
                name: 'Standard Ciepły Montaż',
                isDefault: false,
                applicableTypes: ['okno_pvc', 'okno_aluminiowe'],
                rules: [
                    { id: uuidv4(), edge: 'vertical', materialId: foamId, usagePerMeter: 0.5 },
                    { id: uuidv4(), edge: 'vertical', materialId: vaporIntId, usagePerMeter: 1.0 },
                    { id: uuidv4(), edge: 'horizontal', materialId: vaporExtId, usagePerMeter: 1.0 }
                ],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: uuidv4(),
                name: 'Standard Pasywny',
                isDefault: false,
                applicableTypes: ['okno_pvc', 'okno_aluminiowe'],
                rules: [
                    { id: uuidv4(), edge: 'bottom', materialId: epsSillId, usagePerMeter: 1.0 },
                    { id: uuidv4(), edge: 'vertical', materialId: foamId, usagePerMeter: 0.5 }
                ],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        ];
        await seedIfEmpty('standards', standards);

        // 7. Seed Jobs
        console.log('Seeding Jobs...');
        const job1Id = 'job-001';
        const job2Id = 'job-002';
        const clientForJob = budexId;

        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const end = new Date(now.getFullYear(), now.getMonth(), 28).toISOString().split('T')[0];

        const jobs = [
            {
                id: job1Id,
                jobCode: 'CF-2026-001',
                name: 'Montaż hali magazynowej',
                clientId: clientForJob,
                clientName: 'Budex Sp. z o.o.',
                location: 'Poznań, ul. Magazynowa 4',
                status: 'in_progress',
                riskFlag: 'none',
                plannedStartDate: start,
                plannedEndDate: end,
                totalPlannedRevenueNet: 150000,
                laborPlannedNet: 960,
                materialsPlannedNet: 10000,
                logisticsPlannedNet: 1200,
                equipmentPlannedNet: 800,
                expenses: [
                    { id: uuidv4(), category: 'material', amountNet: 9500, description: 'Profile stalowe i akcesoria' },
                    { id: uuidv4(), category: 'transport', amountNet: 1200, description: 'Transport konstrukcji' }
                ],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                stages: [
                    {
                        id: 'stage-j1-s1',
                        jobId: job1Id,
                        name: 'Konstrukcja główna',
                        type: 'podstawowy',
                        status: 'w_toku',
                        plannedRevenueNet: 100000,
                        billingType: 'hourly',
                        startPlanned: start,
                        endPlanned: end,
                        assignedTeams: ['Ekipa 1']
                    }
                ]
            },
            {
                id: job2Id,
                jobCode: 'CF-2026-002',
                name: 'Remont fasady biurowca',
                clientId: clientForJob,
                clientName: 'Budex Sp. z o.o.',
                location: 'Warszawa, ul. Prosta 20',
                status: 'planned',
                riskFlag: 'warning',
                plannedStartDate: start,
                plannedEndDate: end,
                totalPlannedRevenueNet: 85000,
                laborPlannedNet: 8000,
                materialsPlannedNet: 45000,
                logisticsPlannedNet: 2500,
                equipmentPlannedNet: 5000,
                expenses: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                stages: [
                    {
                        id: 'stage-j2-s1',
                        jobId: job2Id,
                        name: 'Prace przygotowawcze',
                        type: 'podstawowy',
                        status: 'planowany',
                        plannedRevenueNet: 25000,
                        billingType: 'hourly',
                        startPlanned: start,
                        endPlanned: end
                    }
                ]
            },
            {
                id: 'job-003',
                jobCode: 'CF-2026-003',
                name: 'Montaż stolarki w willi',
                clientId: clientForJob,
                clientName: 'Budex Sp. z o.o.',
                location: 'Warszawa, ul. Leśna 5',
                status: 'done',
                riskFlag: 'none',
                plannedStartDate: '2026-06-01',
                plannedEndDate: '2026-06-15',
                totalPlannedRevenueNet: 50000,
                laborPlannedNet: 12000,
                materialsPlannedNet: 15000,
                logisticsPlannedNet: 2000,
                equipmentPlannedNet: 3000,
                actualRevenue: 52000,
                createdAt: new Date(now.getTime() - 30 * 86400000).toISOString(),
                updatedAt: new Date(now.getTime() - 15 * 86400000).toISOString(),
                closedAt: new Date(now.getTime() - 15 * 86400000).toISOString(),
                expenses: [
                    { id: uuidv4(), category: 'material', amountNet: 14200, description: 'Okna i uszczelki' },
                    { id: uuidv4(), category: 'transport', amountNet: 1800, description: 'Dostawa na budowę' },
                    { id: uuidv4(), category: 'equipment', amountNet: 2500, description: 'Wynajem podnośnika' }
                ],
                stages: [
                    {
                        id: 'stage-j3-s1',
                        jobId: 'job-003',
                        name: 'Instalacja okien',
                        type: 'podstawowy',
                        status: 'zakończony',
                        plannedRevenueNet: 50000,
                        billingType: 'hourly',
                        startPlanned: '2026-06-01',
                        endPlanned: '2026-06-15'
                    }
                ]
            }
        ];
        await seedIfEmpty('jobs', jobs);

        // 7a. Seed Constructions (BOM)
        console.log('Seeding Constructions for Jobs...');
        const constructions = [
            {
                id: uuidv4(),
                jobId: job1Id,
                name: 'Okno Aluminiowe Specjalne',
                quantity: 12,
                unit: 'szt',
                status: 'ordered',
                plannedLaborHours: 48,
                materialCosts: { total: 24000 }
            },
            {
                id: uuidv4(),
                jobId: job2Id,
                name: 'Panele Elewacyjne HPL',
                quantity: 200,
                unit: 'm2',
                status: 'pending',
                plannedLaborHours: 160,
                materialCosts: { total: 45000 }
            },
            {
                id: uuidv4(),
                offerId: 'offer-2026-05-budex',
                number: 1,
                name: 'Okno PVC Drutex Iglo 5',
                type: 'okno_pvc',
                width: 1500,
                height: 1500,
                area: 2.25,
                totalArea: 18.0,
                perimeter: 6.0,
                totalPerimeter: 48.0,
                installationLocation: 'zew',
                weight: 45,
                quantity: 8,
                materialCosts: {
                    items: [{ name: 'Profil i szkło', quantity: 8, unitPrice: 800, total: 6400 }],
                    total: 6400
                },
                installationCosts: {
                    rate: 80,
                    total: 1440
                },
                totalCost: 7840
            },
            {
                id: uuidv4(),
                offerId: 'offer-2026-05-budex',
                number: 2,
                name: 'Drzwi Aluminiowe Aluprof MB-86',
                type: 'okno_aluminiowe',
                width: 1000,
                height: 2100,
                area: 2.1,
                totalArea: 4.2,
                perimeter: 6.2,
                totalPerimeter: 12.4,
                installationLocation: 'zew',
                weight: 90,
                quantity: 2,
                materialCosts: {
                    items: [{ name: 'Skrzydło i ościeżnica', quantity: 2, unitPrice: 3500, total: 7000 }],
                    total: 7000
                },
                installationCosts: {
                    rate: 120,
                    total: 504
                },
                totalCost: 7504
            },
            {
                id: uuidv4(),
                offerId: 'offer-2026-05-jan',
                number: 1,
                name: 'Okno PVC Drutex Iglo 5',
                type: 'okno_pvc',
                width: 1500,
                height: 1500,
                area: 2.25,
                totalArea: 18.0,
                perimeter: 6.0,
                totalPerimeter: 48.0,
                installationLocation: 'zew',
                weight: 45,
                quantity: 8,
                materialCosts: {
                    items: [{ name: 'Profil i szkło', quantity: 8, unitPrice: 800, total: 6400 }],
                    total: 6400
                },
                installationCosts: {
                    rate: 80,
                    total: 1440
                },
                totalCost: 7840
            }
        ];
        await seedIfEmpty('constructions', constructions);

        // 7b. Seed Initial Time Entries for TiCo
        console.log('Seeding Time Entries...');
        const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0];
        const timeEntries = [
            {
                id: uuidv4(),
                employee_id: saszaId,
                employeeName: 'Sasza',
                date: yesterday,
                jobId: job1Id,
                jobName: 'Montaż hali magazynowej',
                hours: 8,
                status: 'approved',
                billingType: 'hourly',
                hourlyRate: 60,
                cost: 480,
                createdAt: new Date().toISOString()
            },
            {
                id: uuidv4(),
                employee_id: kamilId,
                employeeName: 'Kamil',
                date: yesterday,
                jobId: job1Id,
                jobName: 'Montaż hali magazynowej',
                hours: 8,
                status: 'approved',
                billingType: 'hourly',
                hourlyRate: 60,
                cost: 480,
                createdAt: new Date().toISOString()
            },
            {
                id: uuidv4(),
                employee_id: saszaId,
                employeeName: 'Sasza',
                date: '2026-06-05',
                jobId: 'job-003',
                jobName: 'Montaż stolarki w willi',
                hours: 80,
                status: 'approved',
                billingType: 'hourly',
                hourlyRate: 60,
                cost: 4800,
                createdAt: new Date(now.getTime() - 25 * 86400000).toISOString()
            },
            {
                id: uuidv4(),
                employee_id: kamilId,
                employeeName: 'Kamil',
                date: '2026-06-05',
                jobId: 'job-003',
                jobName: 'Montaż stolarki w willi',
                hours: 90,
                status: 'approved',
                billingType: 'hourly',
                hourlyRate: 60,
                cost: 5400,
                createdAt: new Date(now.getTime() - 25 * 86400000).toISOString()
            }
        ];
        await seedIfEmpty('time-entries', timeEntries);

        // 7c. Seed Custom Calendar Events
        console.log('Seeding Custom Events...');
        const customEvents = [
            {
                id: uuidv4(),
                type: 'measurement',
                title: 'Pomiar okien u klienta',
                subtitle: 'Gdańsk, ul. Morska 1',
                location: 'Gdańsk, ul. Morska 1',
                start: `${now.toISOString().split('T')[0]}T10:00:00`,
                end: `${now.toISOString().split('T')[0]}T12:00:00`,
                team: ['Sasza', 'Kamil'],
                status: 'planned'
            },
            {
                id: uuidv4(),
                type: 'custom',
                title: 'Przegląd techniczny narzędzi',
                subtitle: 'Magazyn główny',
                start: `${new Date(now.getTime() + 86400000).toISOString().split('T')[0]}T08:00:00`,
                end: `${new Date(now.getTime() + 86400000).toISOString().split('T')[0]}T16:00:00`,
                team: ['Sasza'],
                status: 'planned'
            }
        ];
        await db.collection('custom-events').deleteMany({}); // Ensure clean calendar view on seed
        await seedIfEmpty('custom-events', customEvents);

        // 7d. Seed Site Logs (Diary Entries)
        console.log('Seeding Site Logs...');
        const siteLogs = [
            {
                id: uuidv4(),
                jobId: job1Id,
                date: yesterday,
                authorId: saszaId,
                type: 'work_day',
                title: 'Montaż pierwszego rzędu słupów',
                text: 'Pogoda sprzyjająca. Zmontowano wszystkie stopy fundamentowe i rozpoczęto montaż konstrukcji stalowej pionowej. Wszystkie elementy zgodne ze specyfikacją.',
                photos: [],
                visibleToClient: true,
                source: 'pwa',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: uuidv4(),
                jobId: job1Id,
                date: yesterday,
                authorId: kamilId,
                type: 'issue',
                title: 'Opóźnienie w dostawie dźwigu',
                text: 'Wynajęty dźwig przyjechał na budowę z 2-godzinnym opóźnieniem z powodu awarii na trasie. Spowodowało to niewielki przestój ekipy montażowej.',
                photos: [],
                visibleToClient: true,
                source: 'pwa',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            {
                id: uuidv4(),
                jobId: 'job-003',
                date: '2026-06-10',
                authorId: saszaId,
                type: 'milestone',
                title: 'Zakończenie stanu surowego zamkniętego',
                text: 'Wszystkie okna i drzwi w willi zostały pomyślnie zamontowane i uszczelnione pianą poliuretanową. Dokonano odbioru technicznego.',
                photos: [],
                visibleToClient: true,
                source: 'pwa',
                createdAt: new Date(now.getTime() - 20 * 86400000).toISOString(),
                updatedAt: new Date(now.getTime() - 20 * 86400000).toISOString()
            }
        ];
        await seedIfEmpty('site-logs', siteLogs);

        console.log('Database seeded successfully.');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await client.close();
    }
}

resetAndSeed();
