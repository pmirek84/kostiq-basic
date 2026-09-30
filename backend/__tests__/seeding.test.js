process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const { seedInitialDataIfEmpty } = require('../server');

test('seedInitialDataIfEmpty is idempotent and seeds initial standards and templates if empty', async () => {
    const store = {
        standards: new Map(),
        offers: new Map(),
        constructions: new Map()
    };

    const mockDb = {
        collection: (name) => ({
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
                    coll.set(key, update.$setOnInsert);
                }
                return { acknowledged: true, upsertedCount: 1 };
            }
        })
    };

    // First call: seeds empty database
    const res1 = await seedInitialDataIfEmpty(mockDb);
    assert.strictEqual(res1.seeded, true);
    assert.strictEqual(res1.summary.standards, 2);
    assert.strictEqual(res1.summary.offers, 1);
    assert.strictEqual(res1.summary.constructions, 1);

    assert.strictEqual(store.standards.size, 2);
    assert.strictEqual(store.offers.size, 1);
    assert.strictEqual(store.constructions.size, 1);

    // Second call: database is no longer empty, must be completely idempotent
    const res2 = await seedInitialDataIfEmpty(mockDb);
    assert.strictEqual(res2.seeded, true);
    assert.strictEqual(res2.summary.standards, 0);
    assert.strictEqual(res2.summary.offers, 0);
    assert.strictEqual(res2.summary.constructions, 0);

    assert.strictEqual(store.standards.size, 2);
    assert.strictEqual(store.offers.size, 1);
    assert.strictEqual(store.constructions.size, 1);
});
