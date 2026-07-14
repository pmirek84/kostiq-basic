import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MongoAdapter } from '../MongoAdapter';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
    },
}));

describe('MongoAdapter - Error Handling', () => {
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

    it('calls toast.error when fetch fails with 500 error', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
            json: async () => ({ error: 'KATASTROFA' }),
        });

        try {
            await adapter.getAll();
        } catch (e) {
            // expected
        }

        expect(toast.error).toHaveBeenCalledWith('KATASTROFA');
    });

    it('calls toast.error with generic message when connection is refused', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));

        try {
            await adapter.getAll();
        } catch (e) {
            // expected
        }

        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Błąd połączenia z serwerem'));
    });
});
