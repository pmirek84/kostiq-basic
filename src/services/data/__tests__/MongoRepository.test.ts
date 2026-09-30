import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MongoRepository } from '../MongoRepository';

describe('MongoRepository - Pagination & Error Handling', () => {
    let repo: MongoRepository;
    const mockFetch = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', mockFetch);
        repo = new MongoRepository('http://localhost:3000/api');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('fetches all 101 time entries across 2 pages without truncating at 100', async () => {
        const page1Items = Array.from({ length: 100 }, (_, i) => ({ id: `te-${i + 1}`, hours: 8 }));
        const page2Items = [{ id: 'te-101', hours: 4 }];

        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: page1Items,
                    pagination: { page: 1, limit: 100, total: 101, totalPages: 2, hasMore: true }
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: page2Items,
                    pagination: { page: 2, limit: 100, total: 101, totalPages: 2, hasMore: false }
                })
            });

        const result = await repo.getTimeEntries();
        expect(result).toHaveLength(101);
        expect(result[0].id).toBe('te-1');
        expect(result[100].id).toBe('te-101');
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('fetches > 500 settlements across pages and eliminates duplicate IDs', async () => {
        const page1 = Array.from({ length: 500 }, (_, i) => ({ id: `s-${i + 1}`, totalAmount: 100 }));
        const page2 = [
            { id: 's-500', totalAmount: 100 }, // duplicate
            ...Array.from({ length: 25 }, (_, i) => ({ id: `s-${501 + i}`, totalAmount: 100 }))
        ];

        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: page1,
                    pagination: { page: 1, limit: 500, total: 525, totalPages: 2, hasMore: true }
                })
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: page2,
                    pagination: { page: 2, limit: 500, total: 525, totalPages: 2, hasMore: false }
                })
            });

        const result = await repo.getSettlements();
        expect(result).toHaveLength(525);
        const uniqueIds = new Set(result.map(s => s.id));
        expect(uniqueIds.size).toBe(525);
    });

    it('handles empty collection cleanly', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                data: [],
                pagination: { page: 1, limit: 100, total: 0, totalPages: 0, hasMore: false }
            })
        });

        const result = await repo.getTimeEntries();
        expect(result).toEqual([]);
    });

    it('handles plain unpaginated array cleanly', async () => {
        const emps = [{ id: 'e1', firstName: 'Jan' }];
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => emps
        });

        const result = await repo.getEmployees();
        expect(result).toEqual(emps);
    });

    it('throws error when server returns 500', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
        });

        await expect(repo.getTimeEntries()).rejects.toThrow('API Error: 500');
    });
    it('calls POST /time-entries/batch-import with items payload and returns counts', async () => {
        const entries = [{ id: 'te-1', employeeId: 'e1', jobId: 'j1', hours: 8 }] as any;
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                status: 'success',
                succeeded: 1,
                failed: 0,
                errors: []
            })
        });

        const result = await repo.batchImportTimeEntries(entries);
        expect(result.succeeded).toBe(1);
        expect(result.failed).toBe(0);
        expect(mockFetch).toHaveBeenCalledWith(
            'http://localhost:3000/api/time-entries/batch-import',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ items: entries })
            })
        );
    });
});