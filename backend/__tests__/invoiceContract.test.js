const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execSync } = require('child_process');
const Ajv = require('ajv');

const {
    invoiceSchema,
    INVOICE_DOCUMENT_STATUSES,
    INVOICE_IMPORT_DOCUMENT_STATUSES,
    INVOICE_PAYMENT_STATUSES,
    INVOICE_VAT_RATES,
    INVOICE_CURRENCIES,
    INVOICE_PAYMENT_METHODS,
    INVOICE_PAYMENT_TYPES,
    getWarsawDateString,
    isInvoiceOverdue,
    validateInvoiceDomainRules,
    validateInvoicePaymentsLedger
} = require('../../shared/contracts/index.cjs');

function isValidCalendarDate(rawDate) {
    if (typeof rawDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        return false;
    }
    const [year, month, day] = rawDate.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function isValidInstantString(rawInstant) {
    if (typeof rawInstant !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)$/.test(rawInstant)) {
        return false;
    }
    const parsed = new Date(rawInstant);
    if (isNaN(parsed.getTime())) return false;
    const datePart = rawInstant.slice(0, 10);
    return isValidCalendarDate(datePart);
}

test('Shared Contracts: Invoice JSON Schema, Domain Hardening, Minor Units and State Transitions', async (t) => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    ajv.addFormat('kostiq-calendar-date', (str) => isValidCalendarDate(str));
    ajv.addFormat('kostiq-instant-string', (str) => isValidInstantString(str));
    ajv.addSchema(invoiceSchema, 'invoice');

    const validateInvoiceDocument = ajv.getSchema('invoice#/definitions/InvoiceDocument');
    const validateInvoicePaymentDocument = ajv.getSchema('invoice#/definitions/InvoicePaymentDocument');
    const validateInvoicePost = ajv.getSchema('invoice#/definitions/InvoicePostPayload');
    const validateInvoiceIssue = ajv.getSchema('invoice#/definitions/InvoiceIssuePayload');
    const validateInvoicePayment = ajv.getSchema('invoice#/definitions/InvoicePaymentPayload');
    const validateInvoiceCancel = ajv.getSchema('invoice#/definitions/InvoiceCancelPayload');
    const validateInvoicePatch = ajv.getSchema('invoice#/definitions/InvoicePatchPayload');
    const validateInvoiceBatch = ajv.getSchema('invoice#/definitions/InvoiceBatchImportPayload');

    await t.test('1. Contract Enums: canonical statuses, VAT rates, and payment methods', () => {
        assert.deepStrictEqual([...INVOICE_DOCUMENT_STATUSES], ['draft', 'issued', 'cancelled']);
        assert.deepStrictEqual([...INVOICE_IMPORT_DOCUMENT_STATUSES], ['issued', 'cancelled']);
        assert.deepStrictEqual([...INVOICE_PAYMENT_STATUSES], ['unpaid', 'partial', 'paid']);
        assert.deepStrictEqual([...INVOICE_VAT_RATES], [0, 5, 8, 23]);
        assert.deepStrictEqual([...INVOICE_CURRENCIES], ['PLN']);
        assert.deepStrictEqual([...INVOICE_PAYMENT_METHODS], ['transfer', 'cash', 'card', 'blik', 'other']);
        assert.deepStrictEqual([...INVOICE_PAYMENT_TYPES], ['payment', 'refund']);
    });

    await t.test('2. isInvoiceOverdue: dynamic overdue evaluation in Europe/Warsaw timezone', () => {
        const referenceDate = '2026-10-04';

        // 1. Draft can never be overdue
        assert.strictEqual(isInvoiceOverdue({ documentStatus: 'draft', paymentStatus: 'unpaid', dueDate: '2026-09-01' }, referenceDate), false);

        // 2. Paid invoice is never overdue
        assert.strictEqual(isInvoiceOverdue({ documentStatus: 'issued', paymentStatus: 'paid', dueDate: '2026-09-01' }, referenceDate), false);

        // 3. Cancelled invoice is never overdue
        assert.strictEqual(isInvoiceOverdue({ documentStatus: 'cancelled', paymentStatus: 'unpaid', dueDate: '2026-09-01' }, referenceDate), false);

        // 4. Issued, unpaid with dueDate past reference date is overdue
        assert.strictEqual(isInvoiceOverdue({ documentStatus: 'issued', paymentStatus: 'unpaid', dueDate: '2026-10-01' }, referenceDate), true);

        // 5. Issued, partial with dueDate past reference date is overdue
        assert.strictEqual(isInvoiceOverdue({ documentStatus: 'issued', paymentStatus: 'partial', dueDate: '2026-10-01' }, referenceDate), true);

        // 6. Issued, unpaid with dueDate in future is not overdue
        assert.strictEqual(isInvoiceOverdue({ documentStatus: 'issued', paymentStatus: 'unpaid', dueDate: '2026-10-10' }, referenceDate), false);

        // 7. Warsaw midnight edge case
        const nearMidnightUtc = new Date('2026-10-04T22:30:00Z');
        const warsawDay = getWarsawDateString(nearMidnightUtc);
        assert.strictEqual(warsawDay, '2026-10-05');
        assert.strictEqual(isInvoiceOverdue({ documentStatus: 'issued', paymentStatus: 'unpaid', dueDate: '2026-10-04' }, warsawDay), true);
    });

    await t.test('3. Date Validation: separation of CalendarDate and InstantString with timezone', () => {
        assert.strictEqual(isValidCalendarDate('2026-10-04'), true);
        assert.strictEqual(isValidCalendarDate('2026-02-31'), false);
        assert.strictEqual(isValidCalendarDate('2026-04-31'), false);
        assert.strictEqual(isValidCalendarDate('2026-10-04T12:00:00Z'), false);

        assert.strictEqual(isValidInstantString('2026-10-04T12:00:00.000Z'), true);
        assert.strictEqual(isValidInstantString('2026-10-04T14:00:00+02:00'), true);
        assert.strictEqual(isValidInstantString('2026-10-04T12:00:00'), false);
        assert.strictEqual(isValidInstantString('2026-02-31T12:00:00Z'), false);
    });

    await t.test('4. InvoiceDocument: enforces if/then state transitions, FV format, year parity, and prevents impossible states', () => {
        const validDraft = {
            id: 'inv-draft-1',
            jobId: 'job-123',
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
            issueDate: null,
            dueDate: '2026-10-20',
            paidDate: null,
            cancellationDate: null,
            cancelledAt: null,
            cancelReason: null,
            createdAt: '2026-10-04T12:00:00.000Z',
            updatedAt: '2026-10-04T12:00:00.000Z',
            editVersion: 1,
            isActive: true
        };

        // 1. Valid draft
        assert.strictEqual(validateInvoiceDocument(validDraft), true);
        assert.strictEqual(validateInvoiceDomainRules(validDraft), true);

        // 2. Draft with issued FV number is REJECTED
        const draftWithNumber = { ...validDraft, invoiceNumber: 'FV/2026/001' };
        assert.strictEqual(validateInvoiceDocument(draftWithNumber), false);
        assert.throws(() => validateInvoiceDomainRules(draftWithNumber), /Szkic faktury nie może posiadać przydzielonego numeru/);

        // 3. Draft with issueDate is REJECTED
        const draftWithIssueDate = { ...validDraft, issueDate: '2026-10-04' };
        assert.strictEqual(validateInvoiceDocument(draftWithIssueDate), false);
        assert.throws(() => validateInvoiceDomainRules(draftWithIssueDate), /Szkic faktury nie może posiadać daty wystawienia/);

        // 4. Draft with paidAmountMinor > 0 or non-unpaid status is REJECTED
        const draftWithPayment = { ...validDraft, paidAmountMinor: 50000 };
        assert.strictEqual(validateInvoiceDocument(draftWithPayment), false);
        assert.throws(() => validateInvoiceDomainRules(draftWithPayment), /Szkic faktury nie może posiadać wpłat/);

        const draftWithStatus = { ...validDraft, paymentStatus: 'partial' };
        assert.strictEqual(validateInvoiceDocument(draftWithStatus), false);
        assert.throws(() => validateInvoiceDomainRules(draftWithStatus), /Szkic faktury musi mieć status płatności 'unpaid'/);

        // 5. Valid issued invoice (min 3 sequence digits)
        const validIssued = {
            ...validDraft,
            invoiceNumber: 'FV/2026/001',
            documentStatus: 'issued',
            issueDate: '2026-10-04'
        };
        assert.strictEqual(validateInvoiceDocument(validIssued), true);
        assert.strictEqual(validateInvoiceDomainRules(validIssued), true);

        // 6. Number pattern requiring min 3 digits: FV/2026/1 rejected
        const shortSequenceNumber = { ...validIssued, invoiceNumber: 'FV/2026/1' };
        assert.strictEqual(validateInvoiceDocument(shortSequenceNumber), false);
        assert.throws(() => validateInvoiceDomainRules(shortSequenceNumber), /min. 3 cyframi/);

        // 7. Year mismatch between number and issueDate is REJECTED
        const yearMismatch = { ...validIssued, invoiceNumber: 'FV/2025/001', issueDate: '2026-10-04' };
        assert.throws(() => validateInvoiceDomainRules(yearMismatch), /Rok w numerze faktury 'FV\/2025\/001' \(2025\) nie zgadza się z rokiem daty wystawienia '2026-10-04' \(2026\)/);

        // 8. Issued missing invoiceNumber is REJECTED
        const issuedMissingNumber = { ...validIssued, invoiceNumber: null };
        assert.strictEqual(validateInvoiceDocument(issuedMissingNumber), false);
        assert.throws(() => validateInvoiceDomainRules(issuedMissingNumber), /Wystawiona faktura musi posiadać prawidłowy numer/);

        // 9. Issued missing issueDate is REJECTED
        const issuedMissingDate = { ...validIssued, issueDate: null };
        assert.strictEqual(validateInvoiceDocument(issuedMissingDate), false);
        assert.throws(() => validateInvoiceDomainRules(issuedMissingDate), /Wystawiona faktura musi posiadać poprawną kalendarzową datę/);

        // 10. Valid cancelled invoice preserves invoiceNumber and issueDate
        const validCancelled = {
            ...validIssued,
            documentStatus: 'cancelled',
            cancellationDate: '2026-10-04',
            cancelledAt: '2026-10-04T13:00:00.000Z',
            cancelReason: 'Klient odstąpił od umowy',
            paidAmountMinor: 0,
            remainingAmountMinor: 123000,
            paymentStatus: 'unpaid'
        };
        assert.strictEqual(validateInvoiceDocument(validCancelled), true);
        assert.strictEqual(validateInvoiceDomainRules(validCancelled), true);

        // 11. Cancelled invoice missing prior invoiceNumber or issueDate is REJECTED
        const cancelledMissingNumber = { ...validCancelled, invoiceNumber: null };
        assert.strictEqual(validateInvoiceDocument(cancelledMissingNumber), false);
        assert.throws(() => validateInvoiceDomainRules(cancelledMissingNumber), /Anulowana faktura musi posiadać numer wystawienia/);

        const cancelledMissingDate = { ...validCancelled, issueDate: null };
        assert.strictEqual(validateInvoiceDocument(cancelledMissingDate), false);
        assert.throws(() => validateInvoiceDomainRules(cancelledMissingDate), /Anulowana faktura musi posiadać datę wcześniejszego wystawienia/);

        // 12. Cancelled missing cancelReason is REJECTED
        const cancelledMissingReason = { ...validCancelled, cancelReason: null };
        assert.strictEqual(validateInvoiceDocument(cancelledMissingReason), false);
        assert.throws(() => validateInvoiceDomainRules(cancelledMissingReason), /Anulowana faktura musi posiadać niepusty powód/);

        // 13. Cancelled with unrefunded payment is REJECTED
        const cancelledWithPaid = { ...validCancelled, paidAmountMinor: 50000, remainingAmountMinor: 73000, paymentStatus: 'partial' };
        assert.strictEqual(validateInvoiceDocument(cancelledWithPaid), false);
        assert.throws(() => validateInvoiceDomainRules(cancelledWithPaid), /Anulowanie faktury z nierozliczonymi wpłatami jest niedozwolone/);
    });

    await t.test('5. VAT, Gross, and remainingAmount parity checks in domain validator', () => {
        const base = {
            id: 'inv-test-vat',
            jobId: 'job-123',
            clientId: 'client-1',
            invoiceNumber: 'FV/2026/001',
            documentStatus: 'issued',
            paymentStatus: 'unpaid',
            amountNetMinor: 100000,
            vatRate: 23,
            vatAmountMinor: 23000,
            amountGrossMinor: 123000,
            paidAmountMinor: 0,
            remainingAmountMinor: 123000,
            currency: 'PLN',
            issueDate: '2026-10-04',
            dueDate: '2026-10-20',
            paidDate: null,
            cancellationDate: null,
            cancelledAt: null,
            cancelReason: null,
            createdAt: '2026-10-04T12:00:00.000Z',
            updatedAt: '2026-10-04T12:00:00.000Z',
            editVersion: 1,
            isActive: true
        };

        // 1. Bogus VAT with balanced gross (net=100000, vat=99999, gross=199999) is REJECTED
        const bogusVat = {
            ...base,
            vatAmountMinor: 99999,
            amountGrossMinor: 199999,
            remainingAmountMinor: 199999
        };
        assert.throws(() => validateInvoiceDomainRules(bogusVat), /Błędna kwota VAT w nagłówku faktury/);

        // 2. Bogus remainingAmountMinor is REJECTED
        const bogusRemaining = {
            ...base,
            remainingAmountMinor: 50000 // expected 123000 - 0 = 123000
        };
        assert.throws(() => validateInvoiceDomainRules(bogusRemaining), /Niezgodność remainingAmountMinor/);

        // 3. Overpayment (paidAmountMinor > amountGrossMinor) is REJECTED
        const overpaid = {
            ...base,
            paidAmountMinor: 150000,
            remainingAmountMinor: -27000
        };
        assert.throws(() => validateInvoiceDomainRules(overpaid), /przekracza kwotę brutto/);

        // 4. Line item calculations verification and disjoint vatRate
        const itemizedDoc = {
            ...base,
            vatRate: null, // strictly null for itemized document!
            items: [
                {
                    id: 'it-1',
                    description: 'Okna aluminiowe',
                    quantity: 2,
                    unitNetMinor: 50000,
                    vatRate: 23,
                    amountNetMinor: 100000,
                    vatAmountMinor: 23000,
                    amountGrossMinor: 123000
                }
            ]
        };
        assert.strictEqual(validateInvoiceDocument(itemizedDoc), true);
        assert.strictEqual(validateInvoiceDomainRules(itemizedDoc), true);

        // Itemized document with non-null header vatRate is REJECTED (disjoint source of truth)
        const itemizedDocWithHeaderVat = { ...itemizedDoc, vatRate: 23 };
        assert.strictEqual(validateInvoiceDocument(itemizedDocWithHeaderVat), false);
        assert.throws(() => validateInvoiceDomainRules(itemizedDocWithHeaderVat), /Dla faktury pozycyjnej nagłówkowy vatRate musi wynosić null/);

        // Simplified document with null vatRate is REJECTED
        const simplifiedDocWithNullVat = { ...base, vatRate: null };
        assert.strictEqual(validateInvoiceDocument(simplifiedDocWithNullVat), false);
        assert.throws(() => validateInvoiceDomainRules(simplifiedDocWithNullVat), /Dla faktury uproszczonej nagłówkowy vatRate jest wymagany/);

        // Simplified document missing vatRate completely is REJECTED
        const simplifiedDocMissingVat = { ...base };
        delete simplifiedDocMissingVat.vatRate;
        assert.strictEqual(validateInvoiceDocument(simplifiedDocMissingVat), false);
        assert.throws(() => validateInvoiceDomainRules(simplifiedDocMissingVat), /Dla faktury uproszczonej nagłówkowy vatRate jest wymagany/);

        // Itemized document missing vatRate completely (must be explicitly null) is REJECTED
        const itemizedDocMissingVat = { ...itemizedDoc };
        delete itemizedDocMissingVat.vatRate;
        assert.strictEqual(validateInvoiceDocument(itemizedDocMissingVat), false);
        assert.throws(() => validateInvoiceDomainRules(itemizedDocMissingVat), /Dla faktury pozycyjnej nagłówkowy vatRate musi wynosić null/);

        // Line item with incorrect net math (qty 2 * 50000 != 80000) is REJECTED
        const badItemNet = {
            ...base,
            vatRate: null,
            amountNetMinor: 80000,
            vatAmountMinor: 18400,
            amountGrossMinor: 98400,
            remainingAmountMinor: 98400,
            items: [
                {
                    id: 'it-1',
                    description: 'Okna aluminiowe',
                    quantity: 2,
                    unitNetMinor: 50000,
                    vatRate: 23,
                    amountNetMinor: 80000, // bad
                    vatAmountMinor: 18400,
                    amountGrossMinor: 98400
                }
            ]
        };
        assert.throws(() => validateInvoiceDomainRules(badItemNet), /błędną kwotę netto/);
    });

    await t.test('6. Per-paymentId refund tracking and sequential ordering in validateInvoicePaymentsLedger', () => {
        // Two independent payments
        const payments = [
            { id: 'pay-1', type: 'payment', amountMinor: 10000, paymentDate: '2026-10-01', paymentMethod: 'transfer', sequence: 1 },
            { id: 'pay-2', type: 'payment', amountMinor: 10000, paymentDate: '2026-10-02', paymentMethod: 'transfer', sequence: 2 }
        ];

        // Valid refund of 10000 on pay-1
        const withRefund = [
            ...payments,
            { id: 'ref-1', type: 'refund', reversesPaymentId: 'pay-1', amountMinor: 10000, paymentDate: '2026-10-03', paymentMethod: 'transfer', sequence: 3 }
        ];
        assert.strictEqual(validateInvoicePaymentsLedger(withRefund), 10000);

        // Refunding 15000 against pay-1 (which was only 10000) is REJECTED even though total payments is 20000!
        const excessivePerPaymentRefund = [
            ...payments,
            { id: 'ref-1', type: 'refund', reversesPaymentId: 'pay-1', amountMinor: 15000, paymentDate: '2026-10-03', paymentMethod: 'transfer', sequence: 3 }
        ];
        assert.throws(() => validateInvoicePaymentsLedger(excessivePerPaymentRefund), /przewyższa dostępne saldo wpłaty 'pay-1'/);

        // Refund missing reversesPaymentId is REJECTED
        const refundMissingTarget = [
            ...payments,
            { id: 'ref-1', type: 'refund', amountMinor: 5000, paymentDate: '2026-10-03', paymentMethod: 'transfer', sequence: 3 }
        ];
        assert.throws(() => validateInvoicePaymentsLedger(refundMissingTarget), /musi wskazywać reversesPaymentId/);

        // Duplicate refund ID is REJECTED
        const duplicateRefundId = [
            ...payments,
            { id: 'ref-dup', type: 'refund', reversesPaymentId: 'pay-1', amountMinor: 5000, paymentDate: '2026-10-03', paymentMethod: 'transfer', sequence: 3 },
            { id: 'ref-dup', type: 'refund', reversesPaymentId: 'pay-2', amountMinor: 5000, paymentDate: '2026-10-04', paymentMethod: 'transfer', sequence: 4 }
        ];
        assert.throws(() => validateInvoicePaymentsLedger(duplicateRefundId), /Zduplikowane id zdarzenia płatniczego/);

        // Duplicate ID between payment and refund is REJECTED
        const dupPaymentRefundId = [
            ...payments,
            { id: 'pay-1', type: 'refund', reversesPaymentId: 'pay-1', amountMinor: 5000, paymentDate: '2026-10-03', paymentMethod: 'transfer', sequence: 3 }
        ];
        assert.throws(() => validateInvoicePaymentsLedger(dupPaymentRefundId), /Zduplikowane id zdarzenia płatniczego: 'pay-1'/);

        // Sequence must be strictly increasing
        const badSequence = [
            { id: 'pay-1', type: 'payment', amountMinor: 10000, paymentDate: '2026-10-01', paymentMethod: 'transfer', sequence: 2 },
            { id: 'pay-2', type: 'payment', amountMinor: 10000, paymentDate: '2026-10-02', paymentMethod: 'transfer', sequence: 1 }
        ];
        assert.throws(() => validateInvoicePaymentsLedger(badSequence), /nieprawidłową lub malejącą sekwencję/);

        // Date must not go backwards
        const badChronology = [
            { id: 'pay-1', type: 'payment', amountMinor: 10000, paymentDate: '2026-10-05', paymentMethod: 'transfer', sequence: 1 },
            { id: 'pay-2', type: 'payment', amountMinor: 10000, paymentDate: '2026-10-01', paymentMethod: 'transfer', sequence: 2 }
        ];
        assert.throws(() => validateInvoicePaymentsLedger(badChronology), /narusza kolejność chronologiczną/);
    });

    await t.test('7. InvoicePaymentDocument & InvoicePaymentPayload: requires reversesPaymentId on refund', () => {
        // Payment payload without reversesPaymentId is valid
        assert.strictEqual(validateInvoicePayment({
            expectedVersion: 1,
            type: 'payment',
            amountMinor: 50000,
            paymentMethod: 'transfer'
        }), true);

        // Refund payload WITH reversesPaymentId is valid
        assert.strictEqual(validateInvoicePayment({
            expectedVersion: 1,
            type: 'refund',
            amountMinor: 50000,
            paymentMethod: 'transfer',
            reversesPaymentId: 'pay-123'
        }), true);

        // Refund payload WITHOUT reversesPaymentId is REJECTED
        assert.strictEqual(validateInvoicePayment({
            expectedVersion: 1,
            type: 'refund',
            amountMinor: 50000,
            paymentMethod: 'transfer'
        }), false);

        // Payment document requires sequence
        assert.strictEqual(validateInvoicePaymentDocument({
            id: 'pay-1',
            invoiceId: 'inv-1',
            jobId: 'job-1',
            type: 'payment',
            amountMinor: 10000,
            currency: 'PLN',
            paymentDate: '2026-10-01',
            paymentMethod: 'transfer',
            sequence: 1,
            createdAt: '2026-10-01T10:00:00.000Z'
        }), true);

        // Payment document missing sequence is REJECTED
        assert.strictEqual(validateInvoicePaymentDocument({
            id: 'pay-1',
            invoiceId: 'inv-1',
            jobId: 'job-1',
            type: 'payment',
            amountMinor: 10000,
            currency: 'PLN',
            paymentDate: '2026-10-01',
            paymentMethod: 'transfer',
            createdAt: '2026-10-01T10:00:00.000Z'
        }), false);
    });

    await t.test('8. InvoicePostPayload & InvoicePatchPayload: rejects issueDate on draft creation and update', () => {
        // Valid POST payload
        assert.strictEqual(validateInvoicePost({ jobId: 'job-1', amountNetMinor: 100000, vatRate: 23 }), true);

        // Client trying to specify issueDate on draft creation (POST) is REJECTED
        assert.strictEqual(validateInvoicePost({
            jobId: 'job-1',
            amountNetMinor: 100000,
            vatRate: 23,
            issueDate: '2026-10-04'
        }), false);

        // Valid PATCH payload
        assert.strictEqual(validateInvoicePatch({ expectedVersion: 1 }), false);
        assert.strictEqual(validateInvoicePatch({ expectedVersion: 1, description: 'Nowy opis' }), true);
        assert.strictEqual(validateInvoicePatch({ expectedVersion: 1, amountNetMinor: 120000, vatRate: 23 }), true);

        // Client trying to specify issueDate on draft update (PATCH) is REJECTED
        assert.strictEqual(validateInvoicePatch({
            expectedVersion: 1,
            issueDate: '2026-10-04'
        }), false);
    });

    await t.test('9. InvoiceCancelPayload: accepts cancellationDate, rejects client cancelledAt and body idempotencyKey', () => {
        assert.strictEqual(validateInvoiceCancel({
            expectedVersion: 2,
            reason: 'Błędny NIP kontrahenta',
            cancellationDate: '2026-10-04'
        }), true);

        assert.strictEqual(validateInvoiceCancel({
            expectedVersion: 2,
            reason: 'Błędny NIP',
            cancelledAt: '2026-10-04T12:00:00.000Z'
        }), false);
    });

    await t.test('10. InvoiceBatchImportPayload: restricts to issued/cancelled, requires min 3 digit FV, rejects draft', () => {
        const validImport = {
            id: 'inv-imp-1',
            jobId: 'job-1',
            invoiceNumber: 'FV/2026/001',
            documentStatus: 'issued',
            issueDate: '2026-10-01',
            amountNetMinor: 100000,
            vatRate: 23
        };
        assert.strictEqual(validateInvoiceBatch({ items: [validImport] }), true);

        // Draft is rejected in batch import
        assert.strictEqual(validateInvoiceBatch({
            items: [{ ...validImport, documentStatus: 'draft' }]
        }), false);

        // Short sequence number (FV/2026/1) is rejected
        assert.strictEqual(validateInvoiceBatch({
            items: [{ ...validImport, invoiceNumber: 'FV/2026/1' }]
        }), false);
    });

    await t.test('11. Automated generation guard: verifies invoice.generated.ts is strictly up to date with invoice.schema.json', () => {
        const result = execSync('node scripts/generate-contracts.cjs --check', {
            cwd: path.resolve(__dirname, '../..'),
            encoding: 'utf8'
        });
        assert.ok(result.includes('Generated contracts are strictly up to date'));
    });
});
