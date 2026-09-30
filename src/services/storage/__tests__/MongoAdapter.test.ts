import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MongoAdapter } from '../MongoAdapter';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
    },
}));

describe('MongoAdapter - Comprehensive Error Handling & Pagination', () => {
    let adapter: MongoAdapter<any>;
    const mockFetch = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', mockFetch);
        adapter = new MongoAdapter('test-collection', 'http://localhost:3000/api');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('calls toast.error and throws when fetch fails with 500 error', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: async () => ({ error: 'KATASTROFA' }),
        });

        await expect(adapter.getAll()).rejects.toThrow('KATASTROFA');
        expect(toast.error).toHaveBeenCalledWith('KATASTROFA');
    });

    it('calls toast.error with generic message and throws when connection is refused', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));

        await expect(adapter.getAll()).rejects.toThrow('Failed to fetch');
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Błąd połączenia z serwerem'));
    });

    it('getById returns undefined ONLY for 404, without showing toast error', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            json: async () => ({ error: 'Record not found' }),
        });

        const result = await adapter.getById('missing-id');
        expect(result).toBeUndefined();
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('getById throws and shows toast for 500 server error', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: async () => ({ error: 'Database crash' }),
        });

        await expect(adapter.getById('some-id')).rejects.toThrow('Database crash');
        expect(toast.error).toHaveBeenCalledWith('Database crash');
    });

    it('handles plain unpaginated array (plain T[])', async () => {
        const plainData = [{ id: '1', name: 'Item 1' }, { id: '2', name: 'Item 2' }];
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => plainData,
        });

        const result = await adapter.getAll();
        expect(result).toEqual(plainData);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('handles empty collection cleanly when completely fetched', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                data: [],
                pagination: { page: 1, limit: 100, total: 0, totalPages: 0, hasMore: false }
            }),
        });

        const result = await adapter.getAll();
        expect(result).toEqual([]);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('fetches all 101 records across 2 pages without truncating at 100', async () => {
        const page1Items = Array.from({ length: 100 }, (_, i) => ({ id: `item-${i + 1}`, index: i + 1 }));
        const page2Items = [{ id: 'item-101', index: 101 }];

        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: page1Items,
                    pagination: { page: 1, limit: 100, total: 101, totalPages: 2, hasMore: true }
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: page2Items,
                    pagination: { page: 2, limit: 100, total: 101, totalPages: 2, hasMore: false }
                }),
            });

        const result = await adapter.getAll();
        expect(result).toHaveLength(101);
        expect(result[0].id).toBe('item-1');
        expect(result[100].id).toBe('item-101');
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('fetches > 500 records across multiple pages and eliminates duplicates', async () => {
        // Page 1: 500 items
        const page1Items = Array.from({ length: 500 }, (_, i) => ({ id: `rec-${i + 1}` }));
        // Page 2: 50 items (including 1 accidental duplicate from boundary shift)
        const page2Items = [
            { id: 'rec-500' }, // duplicate of last item from page 1
            ...Array.from({ length: 49 }, (_, i) => ({ id: `rec-${501 + i}` }))
        ];

        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: page1Items,
                    pagination: { page: 1, limit: 500, total: 549, totalPages: 2, hasMore: true }
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    data: page2Items,
                    pagination: { page: 2, limit: 500, total: 549, totalPages: 2, hasMore: false }
                }),
            });

        const result = await adapter.getAll();
        // 500 + 49 unique = 549 unique records
        expect(result).toHaveLength(549);
        const ids = result.map(r => r.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(549);
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });
});
