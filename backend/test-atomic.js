const { MongoClient } = require('mongodb');

async function test() {
    const client = new MongoClient('mongodb://127.0.0.1:27017');
    await client.connect();
    const db = client.db('costframe');

    const work = await db.collection('extra-works').findOne({ id: 'test-work-1772824175320' });
    if (!work) {
        console.log('Work not found');
        await client.close();
        return;
    }

    const jobBefore = await db.collection('jobs').findOne({ id: work.jobId });
    console.log('--- Before ---');
    console.log('Revenue:', jobBefore.totalPlannedRevenueNet);
    console.log('Stages:', jobBefore.stages?.length);

    // Side effect logic from server.js (since we are doing it via DB directly for test)
    const newStage = {
        id: 'stage-' + Date.now(),
        name: `Praca dodatkowa: ${work.reason || work.title || 'bez nazwy'}`,
        type: 'dodatkowy',
        status: 'planned',
        plannedRevenueNet: work.plannedRevenueNet || 0,
        plannedCostNet: work.plannedCostNet || 0,
        plannedStartDate: work.requestedDate || new Date().toISOString().split('T')[0],
        plannedEndDate: work.requestedDate || new Date().toISOString().split('T')[0],
    };

    const currentRevenue = jobBefore.totalPlannedRevenueNet || jobBefore.revenuePlannedNet || 0;
    const newRevenue = currentRevenue + (work.plannedRevenueNet || 0);

    await db.collection('jobs').updateOne(
        { id: work.jobId },
        {
            $push: { stages: newStage },
            $set: {
                totalPlannedRevenueNet: newRevenue,
                revenuePlannedNet: newRevenue,
                updatedAt: new Date().toISOString()
            }
        }
    );
    await db.collection('extra-works').updateOne({ id: work.id }, { $set: { status: 'zaakceptowana' } });

    const jobAfter = await db.collection('jobs').findOne({ id: work.jobId });
    console.log('--- After ---');
    console.log('Revenue:', jobAfter.totalPlannedRevenueNet);
    console.log('Stages:', jobAfter.stages?.length);

    await client.close();
}
test();
