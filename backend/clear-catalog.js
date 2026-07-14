const { MongoClient } = require('mongodb');
const c = new MongoClient('mongodb://127.0.0.1:27017/costframe');
c.connect().then(async () => {
    const db = c.db();
    const m = await db.collection('materials').deleteMany({});
    console.log('Deleted materials:', m.deletedCount);
    const o = await db.collection('offers').deleteMany({ offerTemplateType: { $exists: true } });
    console.log('Deleted offer templates:', o.deletedCount);
    await c.close();
    console.log('Done — run seed-catalog.js now');
}).catch(e => console.error(e.message));
