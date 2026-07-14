const { MongoClient } = require('mongodb');

async function dumpSummary() {
    const uri = "mongodb://127.0.0.1:27017";
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('costframe');
        const collections = await db.listCollections().toArray();
        
        console.log("### Podsumowanie kolekcji w bazie `costframe`:\n");
        console.log("| Kolekcja | Liczba dokumentów | Przykładowe dane / Kluczowe pola |");
        console.log("|---|---|---|");
        
        for (const col of collections) {
            const name = col.name;
            const count = await db.collection(name).countDocuments();
            let sampleStr = "";
            
            if (count > 0) {
                const sampleDocs = await db.collection(name).find({}).limit(2).toArray();
                if (name === 'employees') {
                    sampleStr = sampleDocs.map(d => `${d.firstName} ${d.lastName || ''} (${d.role})`).join(', ');
                } else if (name === 'clients') {
                    sampleStr = sampleDocs.map(d => d.name).join(', ');
                } else if (name === 'jobs') {
                    sampleStr = sampleDocs.map(d => `${d.jobCode}: ${d.name} (${d.status})`).join(', ');
                } else if (name === 'offers') {
                    sampleStr = sampleDocs.map(d => `${d.number}: ${d.title || 'Oferta'} (${d.status})`).join(', ');
                } else if (name === 'crews') {
                    sampleStr = sampleDocs.map(d => d.name).join(', ');
                } else {
                    // Generycznie weź kluczowe właściwości
                    const keys = sampleDocs.map(d => {
                        return d.name || d.title || d.label || d.id || d._id;
                    });
                    sampleStr = keys.slice(0, 2).join(', ');
                }
            } else {
                sampleStr = "Brak dokumentów";
            }
            
            console.log(`| \`${name}\` | ${count} | ${sampleStr} |`);
        }
    } finally {
        await client.close();
    }
}

dumpSummary();
