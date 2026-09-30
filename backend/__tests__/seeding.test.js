process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const { seedInitialDataIfEmpty } = require('../server');

test('seedInitialDataIfEmpty: verifies complete standard schema with valid materialId and persistent migration marker', async () => {
    const store = {
        system_migrations: new Map(),
        materials: new Map(),
        standards: new Map(),
        offers: new Map(),
        constructions: new Map()
    };

    const mockDb = {
        collection: (name) => ({
            findOne: async (filter = {}) => {
                const coll = store[name] || new Map();
                for (const v of coll.values()) {
                    let match = true;
                    for (const [k, val] of Object.entries(filter)) {
                        if (v[k] !== val) match = false;
                    }
                    if (match) return v;
                }
                return null;
            },
            countDocuments: async (filter = {}) => {
                const coll = store[name] || new Map();
                if (filter.number) {
                    let count = 0;
                    for (const v of coll.values()) {
                        if (v.number === filter.number) count++;
                    }
                    return count;
                }
                return coll.size;
            },
            updateOne: async (filter, update, options) => {
                const coll = store[name] || (store[name] = new Map());
                const key = filter.id || filter.number;
                if (!coll.has(key)) {
                    coll.set(key, { ...update.$setOnInsert });
                }
                return { acknowledged: true, upsertedCount: 1 };
            }
        })
    };

    // 1. First run: Seeds materials, standards with valid materialId, and templates
    const res1 = await seedInitialDataIfEmpty(mockDb);
    assert.strictEqual(res1.seeded, true);
    assert.strictEqual(res1.summary.materials >= 5, true);
    assert.strictEqual(res1.summary.standards >= 2, true);

    // Verify standards have valid materialId referencing seeded materials
    const pvcStandard = store.standards.get('std-pvc-01');
    assert.ok(pvcStandard, 'std-pvc-01 must exist');
    assert.ok(Array.isArray(pvcStandard.rules), 'rules must be an array');
    assert.ok(pvcStandard.rules.length > 0, 'must have rules');

    for (const rule of pvcStandard.rules) {
        assert.ok(rule.materialId, `Rule ${rule.id} must have non-empty materialId`);
        const materialExists = store.materials.has(rule.materialId);
        assert.ok(materialExists, `Material ${rule.materialId} must exist in materials collection`);
        assert.ok(rule.edge, 'Rule must specify edge');
        assert.ok(rule.usagePerMeter > 0, 'usagePerMeter must be > 0');
    }

    // Verify persistent migration was marked in system_migrations
    const migrationDoc = store.system_migrations.get('initial_standards_and_templates_v1');
    assert.ok(migrationDoc, 'system_migrations must contain initial_standards_and_templates_v1');

    // 2. Simulate intentional data wipe by user: collections emptied
    store.standards.clear();
    store.materials.clear();
    store.offers.clear();
    assert.strictEqual(store.standards.size, 0);

    // 3. Second run: MUST NOT re-seed because migration version is already applied!
    const res2 = await seedInitialDataIfEmpty(mockDb);
    assert.strictEqual(res2.seeded, false);
    assert.strictEqual(res2.reason, 'Migration already applied');
    assert.strictEqual(store.standards.size, 0, 'Wiped standards must remain 0 and not be unexpectedly re-seeded');
});
