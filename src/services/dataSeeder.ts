// Data seeder DISABLED — USE_MONGO=true means this would write demo data to production MongoDB
// All seeding functionality has been removed to prevent accidental data corruption.

export const seedDemoData = async (_force: boolean = false) => {
    console.warn('[DataSeeder] DISABLED — seedDemoData is no longer functional. Use the UI to add real data.');
    return;
};
