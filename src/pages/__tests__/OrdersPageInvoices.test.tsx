import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OrdersPage from '../OrdersPage';
import { invoiceService } from '../../services/data/invoiceService';
import { useJobs } from '../../context/JobsContext';
import type { InvoiceDocument } from '../../../shared/contracts/invoice.generated';
import { validateInvoiceDomainRules } from '../../../shared/contracts/invoice';
import '@testing-library/jest-dom';

vi.mock('../../context/JobsContext');
vi.mock('../../services/data/invoiceService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../services/data/invoiceService')>();
    return {
        ...actual,
        invoiceService: {
            ...actual.invoiceService,
            getAllInvoices: vi.fn(),
        },
    };
});

vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('/cost-invoices')) {
        return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
        });
    }
    return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
    });
}) as any);

const mockJobs = [
    {
        id: 'job-101',
        jobCode: 'CF-2026-101',
        name: 'Montaż Witryn Szklanych',
        clientName: 'AluGlass Sp. z o.o.',
        expenses: [],
    },
];

const mockInvoices: InvoiceDocument[] = [
    {
        id: 'inv-draft-1',
        jobId: 'job-101',
        clientId: 'client-1',
        invoiceNumber: null,
        documentStatus: 'draft',
        paymentStatus: 'unpaid',
        amountNetMinor: 100000,
        vatRate: 23,
        vatAmountMinor: 23000,
        amountGrossMinor: 123000,
        paidAmountMinor: 0,
        remainingAmountMinor: 123000,
        currency: 'PLN',
        description: 'Szkic zaliczki',
        createdAt: '2026-10-04T10:00:00.000Z',
        updatedAt: '2026-10-04T10:00:00.000Z',
        editVersion: 1,
        isActive: true,
    },
    {
        id: 'inv-partial-2',
        jobId: 'job-101',
        clientId: 'client-1',
        invoiceNumber: 'FV/2026/001',
        documentStatus: 'issued',
        paymentStatus: 'partial',
        amountNetMinor: 200000,
        vatRate: 23,
        vatAmountMinor: 46000,
        amountGrossMinor: 246000,
        paidAmountMinor: 100000,
        remainingAmountMinor: 146000,
        currency: 'PLN',
        issueDate: '2026-10-01',
        dueDate: '2026-11-01',
        description: 'Faktura częściowa',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-02T10:00:00.000Z',
        editVersion: 2,
        isActive: true,
    },
    {
        id: 'inv-paid-3',
        jobId: 'job-101',
        clientId: 'client-1',
        invoiceNumber: 'FV/2026/002',
        documentStatus: 'issued',
        paymentStatus: 'paid',
        amountNetMinor: 300000,
        vatRate: 23,
        vatAmountMinor: 69000,
        amountGrossMinor: 369000,
        paidAmountMinor: 369000,
        remainingAmountMinor: 0,
        currency: 'PLN',
        issueDate: '2026-09-15',
        dueDate: '2026-09-30',
        paidDate: '2026-09-28',
        description: 'Faktura końcowa opłacona',
        createdAt: '2026-09-15T10:00:00.000Z',
        updatedAt: '2026-09-28T10:00:00.000Z',
        editVersion: 2,
        isActive: true,
    },
    {
        id: 'inv-cancelled-4',
        jobId: 'job-101',
        clientId: 'client-1',
        invoiceNumber: 'FV/2026/003',
        documentStatus: 'cancelled',
        paymentStatus: 'unpaid',
        amountNetMinor: 400000,
        vatRate: 23,
        vatAmountMinor: 92000,
        amountGrossMinor: 492000,
        paidAmountMinor: 0,
        remainingAmountMinor: 492000,
        currency: 'PLN',
        issueDate: '2026-09-10',
        cancellationDate: '2026-09-12',
        cancelledAt: '2026-09-12T12:00:00.000Z',
        cancelReason: 'Błąd w danych nabywcy',
        description: 'Faktura anulowana',
        createdAt: '2026-09-10T10:00:00.000Z',
        updatedAt: '2026-09-12T10:00:00.000Z',
        editVersion: 2,
        isActive: true,
    },
];

describe('OrdersPage - Income Invoices Aggregate View (Contract & Service Integration)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (useJobs as any).mockReturnValue({
            jobs: mockJobs,
        });
        vi.mocked(invoiceService.getAllInvoices).mockResolvedValue(mockInvoices);
    });

    it('all mock fixtures strictly pass canonical domain rules validation', () => {
        for (const doc of mockInvoices) {
            expect(() => validateInvoiceDomainRules(doc)).not.toThrow();
        }
    });

    it('renders all statuses (draft, partial, paid, cancelled) and calculates stats strictly for issued invoices', async () => {
        render(
            <MemoryRouter>
                <OrdersPage />
            </MemoryRouter>
        );

        // Switch to 'Przychodowe' tab
        const incomeTabButton = screen.getByRole('button', { name: /Przychodowe/i });
        fireEvent.click(incomeTabButton);

        // Verify full pagination fetch was called
        await waitFor(() => {
            expect(invoiceService.getAllInvoices).toHaveBeenCalledTimes(1);
        });

        // 1. Verify all 4 documents are rendered with proper badges
        expect(await screen.findByText('(Szkic)')).toBeInTheDocument();
        expect(screen.getByText('Szkic')).toBeInTheDocument();

        expect(screen.getByText('FV/2026/001')).toBeInTheDocument();
        expect(screen.getByText(/Częściowa/)).toBeInTheDocument();

        expect(screen.getByText('FV/2026/002')).toBeInTheDocument();
        expect(screen.getByText('Opłacona')).toBeInTheDocument();

        expect(screen.getByText('FV/2026/003')).toBeInTheDocument();
        expect(screen.getByText('Anulowana')).toBeInTheDocument();

        // 2. Verify Client name resolved from jobs
        const clientCells = screen.getAllByText('AluGlass Sp. z o.o.');
        expect(clientCells.length).toBeGreaterThanOrEqual(4);

        // 3. Verify Issued Totals (Drafts and Cancelled are strictly excluded!):
        // Invoiced Net: 2000 (FV/2026/001) + 3000 (FV/2026/002) = 5 000,00 PLN
        // Invoiced Gross: 2460 + 3690 = 6 150,00 PLN
        // Paid gross: 1000 + 3690 = 4 690,00 PLN
        // Remaining gross: 1460 + 0 = 1 460,00 PLN
        expect(screen.getAllByText(/5000,00/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/6150,00/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/4690,00/).length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText(/1460,00/).length).toBeGreaterThanOrEqual(1);

        // 4. Verify footer label is SUMA WYSTAWIONYCH
        expect(screen.getByText('SUMA WYSTAWIONYCH')).toBeInTheDocument();
    });

    it('classifies pending invoices correctly: includes drafts and unpaid/partial, excludes paid and cancelled', async () => {
        render(
            <MemoryRouter>
                <OrdersPage />
            </MemoryRouter>
        );

        // Switch to 'Do wystawienia' / pending tab
        const pendingTabButton = screen.getByRole('button', { name: /Do wystawienia/i });
        fireEvent.click(pendingTabButton);

        await waitFor(() => {
            expect(invoiceService.getAllInvoices).toHaveBeenCalled();
        });

        // 1. MUST include: Draft (inv-draft-1) and Partially paid (inv-partial-2)
        expect(await screen.findByText('(Szkic)')).toBeInTheDocument();
        expect(screen.getByText('Szkic (do wystawienia)')).toBeInTheDocument();

        expect(screen.getByText('FV/2026/001')).toBeInTheDocument();
        expect(screen.getByText(/Częściowa/)).toBeInTheDocument();

        // 2. MUST EXCLUDE: Fully paid (inv-paid-3) and Cancelled (inv-cancelled-4)
        expect(screen.queryByText('FV/2026/002')).not.toBeInTheDocument();
        expect(screen.queryByText('FV/2026/003')).not.toBeInTheDocument();
        expect(screen.queryByText('Anulowana')).not.toBeInTheDocument();

        // 3. Sum of pending amounts: 1230 (draft) + 1460 (partial remaining) = 2690,00
        expect(screen.getByText(/2690,00/)).toBeInTheDocument();
    });
});
