process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const { seedInitialDataIfEmpty } = require('../server');

function createMockDb(store) {
    return {
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
                if (coll.has(key)) {
                    const existing = coll.get(key);
                    if (update.$set) {
                        Object.assign(existing, update.$set);
                    }
                } else if (options?.upsert || update.$setOnInsert) {
                    coll.set(key, { ...(update.$setOnInsert || update.$set || {}) });
                }
                return { acknowledged: true, upsertedCount: 1, modifiedCount: 1 };
            }
        })
    };
}

test('seedInitialDataIfEmpty: verifies complete standard schema with valid materialId and persistent migration marker', async () => {
    const store = {
        system_migrations: new Map(),
        materials: new Map(),
        standards: new Map(),
        offers: new Map(),
        constructions: new Map()
    };

    const mockDb = createMockDb(store);

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

test('seedInitialDataIfEmpty: repairs existing standards created by commit c4c2ac3 lacking materialId', async () => {
    // Exact data shape created by commit c4c2ac3 (standards with rules missing materialId, empty materials, no migration marker)
    const store = {
        system_migrations: new Map(),
        materials: new Map(),
        standards: new Map(),
        offers: new Map(),
        constructions: new Map()
    };

    store.standards.set('std-pvc-01', {
        id: 'std-pvc-01',
        name: 'Ciepły montaż PVC (standard)',
        description: 'Trójwarstwowy montaż stolarki PVC z taśmami paroszczelną i paroprzepuszczalną',
        systemType: 'pvc',
        rules: [
            {
                id: 'rule-pvc-pianka',
                edge: 'perimeter',
                usagePerMeter: 0.2,
                usageUnit: 'puszka/mb',
                basis: 'mb',
                wastePercent: 5
            },
            {
                id: 'rule-pvc-tasma-wew',
                edge: 'perimeter',
                usagePerMeter: 1.05,
                usageUnit: 'mb',
                basis: 'mb',
                wastePercent: 5
            },
            {
                id: 'rule-pvc-tasma-zew',
                edge: 'perimeter',
                usagePerMeter: 1.05,
                usageUnit: 'mb',
                basis: 'mb',
                wastePercent: 5
            }
        ],
        createdAt: '2026-09-30T10:00:00Z',
        updatedAt: '2026-09-30T10:00:00Z'
    });

    store.standards.set('std-alu-01', {
        id: 'std-alu-01',
        name: 'Ciepły montaż Aluminium (standard)',
        description: 'Montaż stolarki aluminiowej z taśmą rozprężną i klejem',
        systemType: 'alu',
        rules: [
            {
                id: 'rule-alu-pianka',
                edge: 'perimeter',
                usagePerMeter: 0.25,
                usageUnit: 'puszka/mb',
                basis: 'mb',
                wastePercent: 5
            },
            {
                id: 'rule-alu-tasma-rozprezna',
                edge: 'perimeter',
                usagePerMeter: 1.05,
                usageUnit: 'mb',
                basis: 'mb',
                wastePercent: 5
            },
            {
                id: 'rule-alu-klej',
                edge: 'perimeter',
                usagePerMeter: 0.15,
                usageUnit: 'szt/mb',
                basis: 'mb',
                wastePercent: 10
            }
        ],
        createdAt: '2026-09-30T10:00:00Z',
        updatedAt: '2026-09-30T10:00:00Z'
    });

    const mockDb = createMockDb(store);

    // Verify rules do NOT have materialId before running migration
    const beforePvc = store.standards.get('std-pvc-01');
    assert.strictEqual(beforePvc.rules[0].materialId, undefined);

    // Run seed / migration
    const res = await seedInitialDataIfEmpty(mockDb);
    assert.strictEqual(res.seeded, true);

    // Verify materials were seeded
    assert.ok(store.materials.size >= 5, 'Materials must be seeded');

    // Verify existing std-pvc-01 and std-alu-01 were repaired in-place
    const afterPvc = store.standards.get('std-pvc-01');
    assert.ok(afterPvc.rules.length >= 3);
    for (const rule of afterPvc.rules) {
        assert.ok(rule.materialId, `Repaired rule ${rule.id} must have non-empty materialId`);
        assert.ok(store.materials.has(rule.materialId), `Material ${rule.materialId} must exist`);
    }

    const afterAlu = store.standards.get('std-alu-01');
    assert.ok(afterAlu.rules.length >= 3);
    for (const rule of afterAlu.rules) {
        assert.ok(rule.materialId, `Repaired rule ${rule.id} must have non-empty materialId`);
        assert.ok(store.materials.has(rule.materialId), `Material ${rule.materialId} must exist`);
    }

    // Verify system_migrations marker was written
    assert.ok(store.system_migrations.has('initial_standards_and_templates_v1'));
});

test('seedInitialDataIfEmpty: repairs existing standards even if initial_standards_and_templates_v1 marker was already present', async () => {
    // Simulates database where 2ece28e recorded marker before repairing standards
    const store = {
        system_migrations: new Map([
            ['initial_standards_and_templates_v1', { id: 'initial_standards_and_templates_v1', appliedAt: '2026-09-30T14:00:00Z' }]
        ]),
        materials: new Map([
            ['mat-pur-low-750', { id: 'mat-pur-low-750', name: 'Pianka PUR' }],
            ['mat-tasma-rozprezna-10', { id: 'mat-tasma-rozprezna-10', name: 'Taśma' }]
        ]),
        standards: new Map([
            ['std-pvc-01', {
                id: 'std-pvc-01',
                name: 'Ciepły montaż PVC',
                rules: [
                    { id: 'rule-pvc-pianka', edge: 'perimeter', usagePerMeter: 0.2 }
                ]
            }]
        ]),
        offers: new Map(),
        constructions: new Map()
    };

    const mockDb = createMockDb(store);

    const res = await seedInitialDataIfEmpty(mockDb);
    assert.strictEqual(res.seeded, false);
    assert.strictEqual(res.reason, 'Migration already applied');

    // Standard must still have been repaired
    const std = store.standards.get('std-pvc-01');
    assert.strictEqual(std.rules[0].materialId, 'mat-pur-low-750');
});
