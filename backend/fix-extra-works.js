
const { MongoClient } = require('mongodb');

async function fixExtraWorks() {
    const uri = "mongodb://127.0.0.1:27017";
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('costframe');
        const collection = db.collection('extra-works');

        const docs = await collection.find({}).toArray();
        console.log(`Analyzing ${docs.length} extra-work records...`);

        let fixedCount = 0;
        for (const doc of docs) {
            const updates = {};
            const unset = {};

            // 1. Migrate photoBase64 -> photo
            if (doc.photoBase64 && !doc.photo) {
                updates.photo = doc.photoBase64;
                unset.photoBase64 = "";
            } else if (doc.photoBase64 && doc.photo) {
                // Both exist? Prefer photo if it's a URL, but if photo is empty, take Base64
                if (!doc.photo || doc.photo === "") {
                    updates.photo = doc.photoBase64;
                }
                unset.photoBase64 = "";
            }

            // 2. Migrate description -> reason
            if (doc.description && !doc.reason) {
                updates.reason = doc.description;
                unset.description = "";
            } else if (doc.description && doc.reason) {
                // If both exist, reason is usually newer/correct schema
                unset.description = "";
            }

            // 3. Fix requester info (reportedBy -> requestedBy)
            if (!doc.requestedBy || doc.requestedBy === 'System' || doc.requestedBy === 'Unknown') {
                if (doc.reportedBy) {
                    updates.requestedBy = doc.reportedBy;
                } else if (doc.employeeId || doc.reportedById) {
                    const empId = doc.employeeId || doc.reportedById;
                    const emp = await db.collection('employees').findOne({ id: empId });
                    if (emp) {
                        updates.requestedBy = `${emp.firstName} ${emp.lastName}`.trim();
                    }
                }
                if (doc.reportedBy) unset.reportedBy = "";
            }

            // 4. Fix dates (reportedDate -> requestedDate)
            if (!doc.requestedDate) {
                if (doc.reportedDate) {
                    updates.requestedDate = doc.reportedDate;
                } else if (doc.createdAt) {
                    updates.requestedDate = doc.createdAt.split('T')[0];
                } else {
                    updates.requestedDate = new Date().toISOString().split('T')[0];
                }
            }
            if (doc.reportedDate) unset.reportedDate = "";

            // 5. Ensure title exists
            if (!doc.title) {
                updates.title = doc.reason || updates.reason || "Praca dodatkowa";
                if (updates.title.length > 50) updates.title = updates.title.substring(0, 47) + "...";
            }

            // 6. Map legacy status
            if (!doc.status || doc.status === 'pending_quote' || doc.status === 'new') {
                updates.status = 'wysłana_do_akceptacji';
            }

            // Cleanup other legacy fields if they exist
            if (doc.reportedById) unset.reportedById = "";
            if (doc.reportedTime) unset.reportedTime = "";
            if (doc.statusLabel) unset.statusLabel = "";

            if (Object.keys(updates).length > 0 || Object.keys(unset).length > 0) {
                const query = {};
                if (Object.keys(updates).length > 0) query.$set = updates;
                if (Object.keys(unset).length > 0) query.$unset = unset;

                await collection.updateOne({ _id: doc._id }, query);
                fixedCount++;
            }
        }

        console.log(`Migration complete. Updated ${fixedCount} records.`);
    } finally {
        await client.close();
    }
}

fixExtraWorks();
