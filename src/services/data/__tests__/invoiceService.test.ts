import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoiceService, plnToMinor } from '../invoiceService';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
});

describe('invoiceService', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('converts decimal PLN input to minor units without floating point multiplication', () => {
        expect(plnToMinor('10,05')).toBe(1005);
        expect(plnToMinor(12.34)).toBe(1234);
        expect(() => plnToMinor('1.234')).toThrow();
    });

    it('sends stable idempotency key and expectedVersion when issuing an invoice', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ id: 'inv-1' }));
        await invoiceService.issueInvoice('inv-1', { issueDate: '2026-10-04' }, 3, 'stable-key-1');
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/invoices/inv-1/issue'),
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ 'Idempotency-Key': 'stable-key-1' }),
                body: JSON.stringify({ issueDate: '2026-10-04', expectedVersion: 3 }),
            }),
        );
    });

    it('loads every paginated invoice page and filters by job', async () => {
        const invoice = (id: string, jobId: string) => ({ id, jobId }) as never;
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ data: [invoice('a', 'job-1')], pagination: { hasMore: true } }))
            .mockResolvedValueOnce(jsonResponse({ data: [invoice('b', 'job-1'), invoice('x', 'job-2')], pagination: { hasMore: false } }));
        await expect(invoiceService.getJobInvoices('job-1')).resolves.toMatchObject([{ id: 'a' }, { id: 'b' }]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][0]).toContain('page=2');
    });

    it('sends a quoted If-Match token for draft deletion', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
        await invoiceService.deleteInvoiceDraft('inv-1', 4);
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/invoices/inv-1'),
            expect.objectContaining({ headers: expect.objectContaining({ 'If-Match': '"4"' }) }),
        );
    });

    it('preserves conflict details from the backend', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ code: 'VERSION_CONFLICT', error: 'Konflikt wersji' }, 409));
        await expect(invoiceService.deleteInvoiceDraft('inv-1', 1)).rejects.toMatchObject({
            status: 409,
            code: 'VERSION_CONFLICT',
        });
    });

    it('getAllInvoices traverses all pages without job filtering', async () => {
        const invoice = (id: string) => ({ id }) as never;
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ data: [invoice('inv-1')], pagination: { hasMore: true } }))
            .mockResolvedValueOnce(jsonResponse({ data: [invoice('inv-2')], pagination: { hasMore: false } }));
        await expect(invoiceService.getAllInvoices()).resolves.toMatchObject([{ id: 'inv-1' }, { id: 'inv-2' }]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0][0]).toContain('/invoices?limit=500&page=1');
        expect(fetchMock.mock.calls[1][0]).toContain('/invoices?limit=500&page=2');
    });

    it('re-exports canonical isInvoiceOverdue adhering strictly to dueDate < today in Warsaw timezone', async () => {
        const { isInvoiceOverdue } = await import('../invoiceService');
        const refDay = '2026-10-04';
        // On the due date itself: not overdue yet
        expect(isInvoiceOverdue({ documentStatus: 'issued', paymentStatus: 'unpaid', dueDate: '2026-10-04' }, refDay)).toBe(false);
        // Past the due date: overdue
        expect(isInvoiceOverdue({ documentStatus: 'issued', paymentStatus: 'unpaid', dueDate: '2026-10-03' }, refDay)).toBe(true);
        // Drafts and cancelled invoices are never overdue
        expect(isInvoiceOverdue({ documentStatus: 'draft', paymentStatus: 'unpaid', dueDate: '2026-09-01' }, refDay)).toBe(false);
        expect(isInvoiceOverdue({ documentStatus: 'cancelled', paymentStatus: 'unpaid', dueDate: '2026-09-01' }, refDay)).toBe(false);
        // Paid invoices are never overdue
        expect(isInvoiceOverdue({ documentStatus: 'issued', paymentStatus: 'paid', dueDate: '2026-09-01' }, refDay)).toBe(false);
    });
});
