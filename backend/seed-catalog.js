/**
 * KOSTIQ — Seed Script
 * Uzupełnia kolekcje "materials" i "offers" (szablony) przykładowymi danymi
 * dla firmy montażowo-budowlanej (okna, drzwi, fasady, hale).
 *
 * Uruchomienie: node backend/seed-catalog.js
 */
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/costframe';

const now = () => new Date().toISOString();

// =====================================================
// MATERIAŁY KATALOGOWE
// =====================================================
const MATERIALS = [
    // Elementy złączne
    { name: 'Kołek rozporowy 8x60mm', category: 'elementy_zlacze', unit: 'szt', defaultUnitPrice: 0.35 },
    { name: 'Kołek rozporowy 10x80mm', category: 'elementy_zlacze', unit: 'szt', defaultUnitPrice: 0.55 },
    { name: 'Wkręt do betonu 7,5x72mm', category: 'elementy_zlacze', unit: 'szt', defaultUnitPrice: 0.90 },
    { name: 'Wkręt samogwintujący TX 4,5x50mm', category: 'elementy_zlacze', unit: 'szt', defaultUnitPrice: 0.18 },
    { name: 'Kotwa chemiczna 380ml (Fischer)', category: 'elementy_zlacze', unit: 'szt', defaultUnitPrice: 38.50 },
    { name: 'Nakrętka M10 ocynkowana', category: 'elementy_zlacze', unit: 'szt', defaultUnitPrice: 0.22 },
    { name: 'Podkładka M10 ocynkowana', category: 'elementy_zlacze', unit: 'szt', defaultUnitPrice: 0.12 },
    { name: 'Profil stalowy montażowy 40x40x3mm', category: 'elementy_zlacze', unit: 'm', defaultUnitPrice: 12.80 },
    { name: 'Konsola montażowa ścienna L', category: 'elementy_zlacze', unit: 'szt', defaultUnitPrice: 8.40 },
    { name: 'Taśma montażowa dwustronna 19mm', category: 'elementy_zlacze', unit: 'm', defaultUnitPrice: 1.20 },

    // Izolacyjne
    { name: 'Pianka PUR niskoprężna 750ml', category: 'izolacyjne', unit: 'szt', defaultUnitPrice: 18.50 },
    { name: 'Pianka PUR wysokoprężna 750ml', category: 'izolacyjne', unit: 'szt', defaultUnitPrice: 22.00 },
    { name: 'Taśma rozprężna 10/4-9mm 8m (illbruck)', category: 'izolacyjne', unit: 'szt', defaultUnitPrice: 24.90 },
    { name: 'Taśma rozprężna 20/4-12mm 5m', category: 'izolacyjne', unit: 'szt', defaultUnitPrice: 28.50 },
    { name: 'Wełna mineralna 10cm lambda 0.032', category: 'izolacyjne', unit: 'm2', defaultUnitPrice: 32.00 },
    { name: 'Mata izolacyjna XPS 5cm', category: 'izolacyjne', unit: 'm2', defaultUnitPrice: 18.00 },
    { name: 'Taśma paroizolacyjna 60mm', category: 'izolacyjne', unit: 'm', defaultUnitPrice: 3.20 },
    { name: 'Folia paroprzepuszczalna STROTEX', category: 'izolacyjne', unit: 'm2', defaultUnitPrice: 4.50 },

    // Uszczelniające
    { name: 'Silikon budowlany biały 310ml', category: 'uszczelniajace', unit: 'szt', defaultUnitPrice: 12.00 },
    { name: 'Silikon budowlany szary 310ml', category: 'uszczelniajace', unit: 'szt', defaultUnitPrice: 12.00 },
    { name: 'Silikon budowlany brązowy 310ml', category: 'uszczelniajace', unit: 'szt', defaultUnitPrice: 12.00 },
    { name: 'Silikon acetonowy transparentny 310ml', category: 'uszczelniajace', unit: 'szt', defaultUnitPrice: 10.50 },
    { name: 'Akryl malarski biały 310ml', category: 'uszczelniajace', unit: 'szt', defaultUnitPrice: 8.00 },
    { name: 'Masa trwała plastyczna (Tremco)', category: 'uszczelniajace', unit: 'szt', defaultUnitPrice: 19.00 },
    { name: 'Uszczelka piankowa PE 9x6mm', category: 'uszczelniajace', unit: 'm', defaultUnitPrice: 0.80 },
    { name: 'Uszczelka szczotkowa 6mm', category: 'uszczelniajace', unit: 'm', defaultUnitPrice: 2.40 },
    { name: 'Taśma butylowa 15mm', category: 'uszczelniajace', unit: 'm', defaultUnitPrice: 1.80 },

    // Dodatkowe
    { name: 'Tarcza do cięcia aluminium 160mm', category: 'dodatkowe', unit: 'szt', defaultUnitPrice: 24.00 },
    { name: 'Tarcza do cięcia stali 125mm', category: 'dodatkowe', unit: 'szt', defaultUnitPrice: 8.50 },
    { name: 'Wiertło do betonu SDS 10mm', category: 'dodatkowe', unit: 'szt', defaultUnitPrice: 18.00 },
    { name: 'Listwa wykończeniowa PVC 9mm biała', category: 'dodatkowe', unit: 'm', defaultUnitPrice: 6.20 },
    { name: 'Podkładka amortyzująca EPDM 3mm', category: 'dodatkowe', unit: 'szt', defaultUnitPrice: 1.50 },
    { name: 'Folia ochronna okienna 100cm x 100m', category: 'dodatkowe', unit: 'szt', defaultUnitPrice: 45.00 },
    { name: 'Środek odtłuszczający IPA 1L', category: 'dodatkowe', unit: 'szt', defaultUnitPrice: 14.00 },
    { name: 'Rękawice robocze monterskie (para)', category: 'dodatkowe', unit: 'szt', defaultUnitPrice: 12.00 },
];

// =====================================================
// WZORY OFERT (Offer Templates)
// =====================================================
const OFFER_TEMPLATES = [
    {
        title: 'Montaż okien PVC — Standard',
        offerTemplateType: 'detailed',
        status: 'draft',
        settings: {
            margin: 20,
            discount: 0,
            workTime: { workTime: 8, workerCount: 2, hourlyRate: 85 },
            installationRates: { standard: 180, antywłamaniowe: 220 }
        },
        scopeOfWork: [
            'Demontaż starej stolarki okiennej',
            'Montaż okna PVC z pianką i taśmą rozprężną (3-warstwowa izolacja)',
            'Kołkowanie konsol do ościeżnicy',
            'Uszczelnienie sylikonem zewnętrznym i wewnętrznym',
            'Wywóz i utylizacja starej stolarki'
        ],
        customMaterials: {
            providedByUs: [
                'Pianka PUR niskoprężna 750ml',
                'Kołek rozporowy 10x80mm',
                'Silikon budowlany biały 310ml'
            ],
            providedByClient: [
                'Stolarka okienna PVC (dostarczona na plac budowy)'
            ]
        },
        notes: [
            'Cena zawiera materiały montażowe (pianka, taśma, śruby).',
            'Szklenie i obróbka parapetu wyceniana osobno.',
            'Gwarancja na montaż: 5 lat.',
            'Uwzględniona wartość montażu może ulec zmianie w drodze ewentualnych, przyszłych ustaleń.',
            'Oferta stanowi integralną całość a jej elementy nie mogą być sprzedawane/realizowane osobno.',
            'Prosimy o potwierdzenie, że powyższa oferta jest zgodna z zapytaniem i odeślij podpisany dokument.',
            'Warunki płatności: 50% zadatku płatne jest przed rozpoczęciem realizacji zamówienia, pozostała kwota płatna jest przed odbiorem.',
            'Realizacja zamówienia jest ustalana po ostatniej zaakceptowanej zmianie oferty i/lub wpłacie zadatku.',
            'Wszelkie spory, które wynikną w związku z realizacją niniejszej umowy, będą rozstrzygane w pierwszej kolejności w drodze negocjacji. W przypadku braku porozumienia, Sprzedający i Kupujący zgodnie oświadczają, że sądem właściwym do rozstrzygania sporów jest Sąd Polski właściwy dla siedziby Sprzedającego.',
            'W przypadku pytań do oferty należy odpowiedzieć autorowi, podając numer oferty.'
        ],
    },
    {
        title: 'Montaż drzwi zewnętrznych — Premium',
        offerTemplateType: 'detailed',
        status: 'draft',
        settings: {
            margin: 25,
            discount: 0,
            workTime: { workTime: 6, workerCount: 2, hourlyRate: 90 },
            installationRates: {}
        },
        scopeOfWork: [
            'Demontaż istniejących drzwi wraz z ościeżnicą',
            'Przygotowanie otworu — wyrównanie i podkład',
            'Montaż ościeżnicy stalowej regulowanej',
            'Zawieszenie skrzydła drzwiowego i regulacja',
            'Uszczelnienie pianką i taśmą rozprężną',
            'Montaż progu aluminiowego'
        ],
        customMaterials: {
            providedByUs: [
                'Pianka PUR niskoprężna 750ml',
                'Taśma rozprężna 20/4-12mm 5m',
                'Kołek rozporowy 10x80mm'
            ],
            providedByClient: [
                'Drzwi zewnętrzne z ościeżnicą i okuciem'
            ]
        },
        notes: [
            'Cena nie obejmuje samych drzwi — tylko robociznę i materiały montażowe.',
            'Regulacja i odbiór po 30 dniach od montażu w cenie.',
            'Uwzględniona wartość montażu może ulec zmianie w drodze ewentualnych, przyszłych ustaleń.',
            'Oferta stanowi integralną całość a jej elementy nie mogą być sprzedawane/realizowane osobno.',
            'Prosimy o potwierdzenie, że powyższa oferta jest zgodna z zapytaniem i odeślij podpisany dokument.',
            'Warunki płatności: 50% zadatku płatne jest przed rozpoczęciem realizacji zamówienia, pozostała kwota płatna jest przed odbiorem.',
            'Realizacja zamówienia jest ustalana po ostatniej zaakceptowanej zmianie oferty i/lub wpłacie zadatku.',
            'Wszelkie spory, które wynikną w związku z realizacją niniejszej umowy, będą rozstrzygane w pierwszej kolejności w drodze negocjacji. W przypadku braku porozumienia, Sprzedający i Kupujący zgodnie oświadczają, że sądem właściwym do rozstrzygania sporów jest Sąd Polski właściwy dla siedziby Sprzedającego.',
            'W przypadku pytań do oferty należy odpowiedzieć autorowi, podając numer oferty.'
        ],
    },
    {
        title: 'Elewacja klinkierowa — Razem z rusztem',
        offerTemplateType: 'detailed',
        status: 'draft',
        settings: {
            margin: 30,
            discount: 0,
            workTime: { workTime: 8, workerCount: 3, hourlyRate: 90 },
            installationRates: {}
        },
        scopeOfWork: [
            'Montaż rusztu aluminiowego na klamrach',
            'Ułożenie płyt klinkierowych na ruszcie',
            'Spoinowanie fugą elastyczną',
            'Obróbki blacharskie narożniki/wykończenia',
            'Rusztowanie (wynajem i montaż)'
        ],
        customMaterials: {
            providedByUs: [
                'Kotwy chemiczne i łączniki rusztu',
                'Fuga elastyczna do klinkieru'
            ],
            providedByClient: [
                'Płytki klinkierowe i ruszt aluminiowy'
            ]
        },
        notes: [
            'Ceny jednostkowe dotyczą montażu — materiał klinkier wyceniany wg projektu.',
            'Wymagana dokumentacja techniczna i projekt elewacji.',
            'Minimalny zakres zlecenia: 50 m².',
            'Uwzględniona wartość montażu może ulec zmianie w drodze ewentualnych, przyszłych ustaleń.',
            'Oferta stanowi integralną całość a jej elementy nie mogą być sprzedawane/realizowane osobno.',
            'Prosimy o potwierdzenie, że powyższa oferta jest zgodna z zapytaniem i odeślij podpisany dokument.',
            'Warunki płatności: 50% zadatku płatne jest przed rozpoczęciem realizacji zamówienia, pozostała kwota płatna jest przed odbiorem.',
            'Realizacja zamówienia jest ustalana po ostatniej zaakceptowanej zmianie oferty i/lub wpłacie zadatku.',
            'Wszelkie spory, które wynikną w związku z realizacją niniejszej umowy, będą rozstrzygane w pierwszej kolejności w drodze negocjacji. W przypadku braku porozumienia, Sprzedający i Kupujący zgodnie oświadczają, że sądem właściwym do rozstrzygania sporów jest Sąd Polski właściwy dla siedziby Sprzedającego.',
            'W przypadku pytań do oferty należy odpowiedzieć autorowi, podając numer oferty.'
        ],
    },
    {
        title: 'Montaż bramy garażowej segmentowej',
        offerTemplateType: 'detailed',
        status: 'draft',
        settings: {
            margin: 22,
            discount: 0,
            workTime: { workTime: 5, workerCount: 2, hourlyRate: 85 },
            installationRates: {}
        },
        scopeOfWork: [
            'Montaż prowadnic i sprężyn torsyjnych',
            'Montaż paneli segmentowych bramy',
            'Podłączenie napędu elektrycznego',
            'Programowanie pilotów i czujników bezpieczeństwa',
            'Uszczelnienie dna i boków bramy'
        ],
        customMaterials: {
            providedByUs: [
                'Elementy złączne i kotwy montażowe',
                'Pianka PUR i uszczelnienia silikonowe'
            ],
            providedByClient: [
                'Brama garażowa z napędem i szyną prowadzącą'
            ]
        },
        notes: [
            'Oferta obejmuje montaż — brama dostarczana przez klienta lub w osobnej wycenie.',
            'Przegląd gwarancyjny po 12 miesiącach w cenie.',
            'Uwzględniona wartość montażu może ulec zmianie w drodze ewentualnych, przyszłych ustaleń.',
            'Oferta stanowi integralną całość a jej elementy nie mogą być sprzedawane/realizowane osobno.',
            'Prosimy o potwierdzenie, że powyższa oferta jest zgodna z zapytaniem i odeślij podpisany dokument.',
            'Warunki płatności: 50% zadatku płatne jest przed rozpoczęciem realizacji zamówienia, pozostała kwota płatna jest przed odbiorem.',
            'Realizacja zamówienia jest ustalana po ostatniej zaakceptowanej zmianie oferty i/lub wpłacie zadatku.',
            'Wszelkie spory, które wynikną w związku z realizacją niniejszej umowy, będą rozstrzygane w pierwszej kolejności w drodze negocjacji. W przypadku braku porozumienia, Sprzedający i Kupujący zgodnie oświadczają, że sądem właściwym do rozstrzygania sporów jest Sąd Polski właściwy dla siedziby Sprzedającego.',
            'W przypadku pytań do oferty należy odpowiedzieć autorowi, podając numer oferty.'
        ],
    },
    {
        title: 'Wymiana rolety zewnętrznej skrzynkowej',
        offerTemplateType: 'detailed',
        status: 'draft',
        settings: {
            margin: 18,
            discount: 0,
            workTime: { workTime: 3, workerCount: 2, hourlyRate: 80 },
            installationRates: {}
        },
        scopeOfWork: [
            'Demontaż starej rolety/skrzynki',
            'Montaż nowej skrzynki nadpiennej',
            'Montaż pancerza i prowadnic',
            'Podłączenie sterowania (elektryczne)',
            'Uszczelnienie i obróbka tynkarska'
        ],
        customMaterials: {
            providedByUs: [
                'Materiały montażowe, pianka, śruby',
                'Kable przyłączeniowe zasilania'
            ],
            providedByClient: [
                'Komplet rolety zewnętrznej z silnikiem'
            ]
        },
        notes: [
            'Cena dotyczy rolety do 2m² — większe powierzchnie wyceniane indywidualnie.',
            'Uwzględniona wartość montażu może ulec zmianie w drodze ewentualnych, przyszłych ustaleń.',
            'Oferta stanowi integralną całość a jej elementy nie mogą być sprzedawane/realizowane osobno.',
            'Prosimy o potwierdzenie, że powyższa oferta jest zgodna z zapytaniem i odeślij podpisany dokument.',
            'Warunki płatności: 50% zadatku płatne jest przed rozpoczęciem realizacji zamówienia, pozostała kwota płatna jest przed odbiorem.',
            'Realizacja zamówienia jest ustalana po ostatniej zaakceptowanej zmianie oferty i/lub wpłacie zadatku.',
            'Wszelkie spory, które wynikną w związku z realizacją niniejszej umowy, będą rozstrzygane w pierwszej kolejności w drodze negocjacji. W przypadku braku porozumienia, Sprzedający i Kupujący zgodnie oświadczają, że sądem właściwym do rozstrzygania sporów jest Sąd Polski właściwy dla siedziby Sprzedającego.',
            'W przypadku pytań do oferty należy odpowiedzieć autorowi, podając numer oferty.'
        ],
    },
];

// =====================================================
// GŁÓWNA FUNKCJA SEED
// =====================================================
async function seed() {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        const db = client.db();
        console.log('✅ Połączono z MongoDB:', MONGO_URI);

        // --- MATERIALS ---
        const matColl = db.collection('materials');
        const existingMat = await matColl.countDocuments();
        if (existingMat > 0) {
            console.log(`ℹ️  Kolekcja 'materials' już ma ${existingMat} dokumentów — pomijam.`);
        } else {
            const docs = MATERIALS.map(m => ({
                ...m,
                id: uuidv4(),
                isActive: true,
                createdAt: now(),
                updatedAt: now(),
            }));
            await matColl.insertMany(docs);
            console.log(`✅ Dodano ${docs.length} materiałów do kolekcji 'materials'`);
        }

        // --- OFFER TEMPLATES ---
        const offerColl = db.collection('offers');
        
        // Remove empty placeholders like WZÓR-STD-01 or title 'Wzór Oferty'
        const deletePlaceholderResult = await offerColl.deleteMany({
            $or: [
                { number: 'WZÓR-STD-01' },
                { title: 'Wzór Oferty' },
                { title: 'Oferta montażu konstrukcji aluminiowych' }
            ]
        });
        if (deletePlaceholderResult.deletedCount > 0) {
            console.log(`🧹 Usunięto ${deletePlaceholderResult.deletedCount} pustych szablonów/placeholderów.`);
        }

        const existingTemplates = await offerColl.countDocuments({ offerTemplateType: { $exists: true } });
        if (existingTemplates > 0) {
            console.log(`ℹ️  Wzory ofert już istnieją (${existingTemplates}) — pomijam.`);
        } else {
            const num = (i) => `TPL-${String(i + 1).padStart(3, '0')}`;
            const docs = OFFER_TEMPLATES.map((t, i) => ({
                ...t,
                id: uuidv4(),
                number: num(i),
                clientId: null,
                createdAt: now(),
                updatedAt: now(),
            }));
            await offerColl.insertMany(docs);
            console.log(`✅ Dodano ${docs.length} wzorów ofert do kolekcji 'offers'`);
        }

        // --- PODSUMOWANIE ---
        const matCount = await matColl.countDocuments();
        const tplCount = await offerColl.countDocuments({ offerTemplateType: { $exists: true } });
        console.log('\n📊 Stan bazy po seedzie:');
        console.log(`   materials:       ${matCount} dokumentów`);
        console.log(`   offer templates: ${tplCount} dokumentów`);

    } catch (err) {
        console.error('❌ Błąd:', err.message);
    } finally {
        await client.close();
    }
}

seed();
