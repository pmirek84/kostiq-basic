import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceDocument } from '../../../../shared/contracts/invoice.generated';
import type { Job } from '../../../models/types';

const { refreshJobs, issueInvoice, getJobInvoices } = vi.hoisted(() => ({
    refreshJobs: vi.fn(),
    issueInvoice: vi.fn(),
    getJobInvoices: vi.fn(),
}));

vi.mock('../../../context/JobsContext', () => ({
    useJobs: () => ({ updateJob: vi.fn(), refreshJobs }),
}));

vi.mock('../../../services/data/invoiceService', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../services/data/invoiceService')>();
    return {
        ...actual,
        createInvoiceMutationKey: () => 'stable-ui-key',
        invoiceService: {
            ...actual.invoiceService,
            getJobInvoices,
            issueInvoice,
        },
    };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import JobInvoicesTab from '../JobInvoicesTab';

const draft: InvoiceDocument = {
    id: 'inv-draft', jobId: 'job-1', invoiceNumber: null,
    documentStatus: 'draft', paymentStatus: 'unpaid',
    amountNetMinor: 10000, vatRate: 23, vatAmountMinor: 2300, amountGrossMinor: 12300,
    paidAmountMinor: 0, remainingAmountMinor: 12300, currency: 'PLN',
    issueDate: null, dueDate: null, paidDate: null, cancellationDate: null,
    cancelledAt: null, cancelReason: null, description: 'Szkic testowy', items: [],
    createdAt: '2026-10-04T10:00:00.000Z', updatedAt: '2026-10-04T10:00:00.000Z',
    editVersion: 1, isActive: true,
};

const job = {
    id: 'job-1', clientId: 'client-1', name: 'Test', status: 'planned',
    revenuePlannedNet: 100, stages: [], createdAt: '', updatedAt: '',
} as unknown as Job;

describe('JobInvoicesTab invoice lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getJobInvoices.mockResolvedValue([draft]);
        issueInvoice.mockResolvedValue({ ...draft, documentStatus: 'issued', invoiceNumber: 'FV/2026/001', editVersion: 2 });
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify([]), {
            status: 200, headers: { 'content-type': 'application/json' },
        }));
    });

    it('issues a draft through the new endpoint with a stable operation key', async () => {
        render(<JobInvoicesTab job={job} />);
        fireEvent.click(screen.getByRole('button', { name: /Przychodowe/i }));
        expect(await screen.findByText('Szkic testowy')).toBeInTheDocument();

        fireEvent.click(screen.getByTitle('Wystaw fakturę'));
        fireEvent.click(screen.getByRole('button', { name: 'Zapisz' }));

        await waitFor(() => expect(issueInvoice).toHaveBeenCalledWith(
            'inv-draft',
            expect.objectContaining({ issueDate: expect.any(String) }),
            1,
            'stable-ui-key',
        ));
        expect(refreshJobs).toHaveBeenCalled();
    });
});
