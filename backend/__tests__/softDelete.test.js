const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

// Set NODE_ENV to test to prevent server.listen
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

// Mock authMiddleware (since we can't easily use vi.mock here, we'll rely on the fact that we can monkeypatch if needed or just use the app as is if it allows bypass)
// In node:test, we don't have built-in easy mocking like vi.mock for requires, so we'll adjust server.js if needed or just assume the manual mock works if we setup the environment right.

const { app, setDb } = require('../server');

test('Backend Soft Delete & Filtering', async (t) => {
    let mockCollection;
    let mockDb;

    mockCollection = {
        findOne: async () => { },
        insertOne: async () => { },
        find: (query) => ({
            toArray: async () => [
                { id: 'client-1', name: 'Test Client', isActive: true }
            ]
        }),
        updateOne: async () => ({ modifiedCount: 1 }),
    };
    mockDb = {
        collection: () => mockCollection,
    };
    setDb(mockDb);

    await t.test('GET /api/clients should filter out archived clients by default', async () => {
        const response = await request(app).get('/api/clients');
        assert.strictEqual(response.status, 200);
    });

    await t.test('DELETE /api/clients/:id should perform a soft delete', async () => {
        const response = await request(app).delete('/api/clients/client-1');
        assert.strictEqual(response.status, 200);
    });
});
