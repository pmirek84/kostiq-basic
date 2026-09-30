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

test('seedInitialDataIfEmpty: repairs exact c4c2ac3 legacy standards without modifying custom user standards', async () => {
    // Exact documents as defined in git show c4c2ac3:backend/server.js
    const store = {
        system_migrations: new Map(),
        materials: new Map(),
        standards: new Map(),
        offers: new Map(),
        constructions: new Map()
    };

    // Exact std-pvc-01 from c4c2ac3 (rules: [{ id: 'rule-pvc-01', edge: 'perimeter', usagePerMeter: 1, basis: 'mb' }])
    store.standards.set('std-pvc-01', {
        id: 'std-pvc-01',
        name: 'Standard PVC – Piana + Taśma 3-warstwowa',
        description: 'Montaż okien PVC z pianką PU, taśmą rozprężną 3-warstw. i folią paroprzepuszczalną',
        applicableTypes: ['okno_pvc', 'drzwi_pvc', 'hs_pvc'],
        isDefault: true,
        rules: [
            { id: 'rule-pvc-01', edge: 'perimeter', usagePerMeter: 1, basis: 'mb' }
        ],
        createdAt: '2026-09-30T10:00:00Z',
        updatedAt: '2026-09-30T10:00:00Z'
    });

    // Exact std-alu-01 from c4c2ac3 (rules: [{ id: 'rule-alu-01', edge: 'perimeter', usagePerMeter: 1, basis: 'mb' }])
    store.standards.set('std-alu-01', {
        id: 'std-alu-01',
        name: 'Standard ALU – Montaż na konsolach + EPDM',
        description: 'Montaż konstrukcji aluminiowych na konsolach z folią EPDM i klejem hybrydowym',
        applicableTypes: ['okno_alu', 'drzwi_alu', 'fasada_alu'],
        isDefault: false,
        rules: [
            { id: 'rule-alu-01', edge: 'perimeter', usagePerMeter: 1, basis: 'mb' }
        ],
        createdAt: '2026-09-30T10:00:00Z',
        updatedAt: '2026-09-30T10:00:00Z'
    });

    // Custom user standard - must NEVER be touched or modified!
    const customUserStandard = {
        id: 'std-custom-user-01',
        name: 'Własny standard montażu klienta',
        description: 'Standard użytkownika z własną regułą',
        applicableTypes: ['okno_drewno'],
        isDefault: false,
        rules: [
            { id: 'custom-rule-drewno', edge: 'bottom', usagePerMeter: 2.5, basis: 'mb' }
        ],
        createdAt: '2026-09-30T11:00:00Z',
        updatedAt: '2026-09-30T11:00:00Z'
    };
    store.standards.set('std-custom-user-01', JSON.parse(JSON.stringify(customUserStandard)));

    const mockDb = createMockDb(store);

    // Verify rule-pvc-01 and rule-alu-01 do NOT have materialId before running
    assert.strictEqual(store.standards.get('std-pvc-01').rules[0].materialId, undefined);
    assert.strictEqual(store.standards.get('std-alu-01').rules[0].materialId, undefined);

    // Run seed / migration
    const res = await seedInitialDataIfEmpty(mockDb);
    assert.strictEqual(res.seeded, true);

    // Verify materials were seeded
    assert.ok(store.materials.size >= 5, 'Materials must be seeded');

    // 1. Verify std-pvc-01 received complete proper rules (2 rules) with proper materials
    const afterPvc = store.standards.get('std-pvc-01');
    assert.strictEqual(afterPvc.rules.length, 2);
    assert.strictEqual(afterPvc.rules[0].id, 'rule-pvc-piana');
    assert.strictEqual(afterPvc.rules[0].materialId, 'mat-pur-low-750');
    assert.strictEqual(afterPvc.rules[1].id, 'rule-pvc-tasma');
    assert.strictEqual(afterPvc.rules[1].materialId, 'mat-tasma-rozprezna-10');

    // 2. Verify std-alu-01 received complete proper rules (3 rules), NOT assigned to foam!
    const afterAlu = store.standards.get('std-alu-01');
    assert.strictEqual(afterAlu.rules.length, 3);
    assert.strictEqual(afterAlu.rules[0].id, 'rule-alu-konsole');
    assert.strictEqual(afterAlu.rules[0].materialId, 'mat-konsola-montazowa-l');
    assert.strictEqual(afterAlu.rules[1].id, 'rule-alu-epdm');
    assert.strictEqual(afterAlu.rules[1].materialId, 'mat-folia-epdm-zew');
    assert.strictEqual(afterAlu.rules[2].id, 'rule-alu-klej');
    assert.strictEqual(afterAlu.rules[2].materialId, 'mat-klej-hybrydowy');

    // 3. Verify custom user standard was COMPLETELY UNTOUCHED!
    const afterCustom = store.standards.get('std-custom-user-01');
    assert.deepStrictEqual(afterCustom.rules, customUserStandard.rules, 'User standard rules must not be modified');
    assert.strictEqual(afterCustom.rules[0].materialId, undefined, 'User rule must not be assigned heuristic materialId');
});

test('seedInitialDataIfEmpty: repairs c4c2ac3 standards even if initial_standards_and_templates_v1 marker was already present', async () => {
    // Simulates database where commit 2ece28e recorded marker before repairing standards
    const store = {
        system_migrations: new Map([
            ['initial_standards_and_templates_v1', { id: 'initial_standards_and_templates_v1', appliedAt: '2026-09-30T14:00:00Z' }]
        ]),
        materials: new Map([
            ['mat-pur-low-750', { id: 'mat-pur-low-750', name: 'Pianka PUR' }],
            ['mat-tasma-rozprezna-10', { id: 'mat-tasma-rozprezna-10', name: 'Taśma' }],
            ['mat-konsola-montazowa-l', { id: 'mat-konsola-montazowa-l', name: 'Konsola' }],
            ['mat-folia-epdm-zew', { id: 'mat-folia-epdm-zew', name: 'EPDM' }],
            ['mat-klej-hybrydowy', { id: 'mat-klej-hybrydowy', name: 'Klej' }]
        ]),
        standards: new Map([
            ['std-pvc-01', {
                id: 'std-pvc-01',
                name: 'Standard PVC',
                rules: [
                    { id: 'rule-pvc-01', edge: 'perimeter', usagePerMeter: 1, basis: 'mb' }
                ]
            }],
            ['std-alu-01', {
                id: 'std-alu-01',
                name: 'Standard ALU',
                rules: [
                    { id: 'rule-alu-01', edge: 'perimeter', usagePerMeter: 1, basis: 'mb' }
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

    // Standards must still have been repaired
    const pvc = store.standards.get('std-pvc-01');
    assert.strictEqual(pvc.rules.length, 2);
    assert.strictEqual(pvc.rules[0].materialId, 'mat-pur-low-750');

    const alu = store.standards.get('std-alu-01');
    assert.strictEqual(alu.rules.length, 3);
    assert.strictEqual(alu.rules[0].materialId, 'mat-konsola-montazowa-l');
});
