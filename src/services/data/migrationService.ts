import { getDB } from '../storage/db';
import { getAdapter } from '../storage/adapterFactory';
import type { Client, Offer, Job, Construction, Material, InstallationStandard, CompanySettings, SubcontractorContract, Settlement } from '../../models/types';
import type { CalendarEvent } from '../../models/calendar';

export const migrationService = {
    async migrateAll() {
        console.log('Starting migration from IndexedDB to MongoDB...');
        const db = await getDB();

        const stores = [
            { name: 'clients', adapter: getAdapter<Client>('clients') },
            { name: 'offers', adapter: getAdapter<Offer>('offers') },
            { name: 'jobs', adapter: getAdapter<Job>('jobs') },
            { name: 'constructions', adapter: getAdapter<Construction>('constructions') },
            { name: 'materials', adapter: getAdapter<Material>('materials') },
            { name: 'standards', adapter: getAdapter<InstallationStandard>('standards') },
            { name: 'settings', adapter: getAdapter<CompanySettings>('settings') },
            { name: 'jobStageItems', adapter: getAdapter<any>('jobStageItems') },
            { name: 'custom-events', adapter: getAdapter<CalendarEvent>('custom-events') },
            { name: 'subcontractor_contracts', adapter: getAdapter<SubcontractorContract>('subcontractor_contracts') },
            { name: 'settlements', adapter: getAdapter<Settlement>('settlements') }
        ];

        let totalMigrated = 0;

        for (const store of stores) {
            // @ts-ignore - IDB version might differ in types but runtime is safe
            const items = await db.getAll(store.name);
            console.log(`Migrating ${items.length} items from ${store.name}...`);

            for (const item of items) {
                try {
                    // @ts-ignore - adapter expects {id: string}
                    await store.adapter.save(item);
                    totalMigrated++;
                } catch (e) {
                    console.error(`Failed to migrate item from ${store.name}`, item, e);
                }
            }
        }

        console.log(`Migration complete! Total items migrated: ${totalMigrated}`);
        return totalMigrated;
    }
};
