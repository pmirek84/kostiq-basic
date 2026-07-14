const { MongoClient } = require('mongodb');

async function verifyAcceptance() {
    const client = new MongoClient('mongodb://127.0.0.1:27017');
    try {
        await client.connect();
        const db = client.db('costframe');

        // 1. Get or create an extra work item to accept
        let work = await db.collection('extra-works').findOne({ status: 'wysłana_do_akceptacji' });

        if (!work) {
            console.log('No pending extra works found. Creating a test entry...');
            const testId = 'test-work-' + Date.now();
            await db.collection('extra-works').insertOne({
                id: testId,
                jobId: 'job-001',
                title: 'Testowa praca dodatkowa',
                reason: 'Test automatu',
                plannedRevenueNet: 1000,
                status: 'wysłana_do_akceptacji',
                requestedDate: new Date().toISOString().split('T')[0]
            });
            work = await db.collection('extra-works').findOne({ id: testId });
        }

        console.log(`Testing acceptance for work: ${work.id} in Job: ${work.jobId}`);
        const initialJob = await db.collection('jobs').findOne({ id: work.jobId });
        const initialRevenue = initialJob.totalPlannedRevenueNet || initialJob.revenuePlannedNet || 0;
        const initialStagesCount = initialJob.stages?.length || 0;

        console.log(`Initial Job Revenue: ${initialRevenue}, Stages: ${initialStagesCount}`);

        // 2. Simulate the PATCH request side effect directly (since we can't easily trigger the PATCH and wait for interceptor log here easily)
        // Actually, let's just RUN a fetch request against the running backend if it's up.
        // Assuming backend is running on 3000.

        console.log('Sending PATCH request to backend...');
        const response = await fetch(`http://localhost:3000/api/extra-works/${work.id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.TOKEN}` // Reusing token from env if available
            },
            body: JSON.stringify({ status: 'zaakceptowana' })
        });

        if (!response.ok) {
            console.error('REST call failed:', await response.text());
            return;
        }

        console.log('Waiting for backend side effects...');
        await new Promise(r => setTimeout(r, 1000));

        // 3. Verify Job Updates
        const updatedJob = await db.collection('jobs').findOne({ id: work.jobId });
        const updatedRevenue = updatedJob.totalPlannedRevenueNet || updatedJob.revenuePlannedNet || 0;
        const updatedStagesCount = updatedJob.stages?.length || 0;

        console.log(`Updated Job Revenue: ${updatedRevenue}, Stages: ${updatedStagesCount}`);

        const expectedRevenue = initialRevenue + (work.plannedRevenueNet || 0);
        const revenueCorrect = updatedRevenue === expectedRevenue;
        const stageAdded = updatedStagesCount === initialStagesCount + 1;

        console.log('Verification Results:');
        console.log(`- Revenue Correct: ${revenueCorrect} (${updatedRevenue} vs expected ${expectedRevenue})`);
        console.log(`- Stage Added: ${stageAdded}`);

        if (revenueCorrect && stageAdded) {
            console.log('SUCCESS: Atomic acceptance verified!');
        } else {
            console.log('FAILURE: Atomic acceptance mismatch.');
        }

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await client.close();
    }
}

verifyAcceptance();
