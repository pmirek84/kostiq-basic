import { v4 as uuidv4 } from 'uuid';
import type {
    InvoiceCancelPayload,
    InvoiceDocument,
    InvoiceIssuePayload,
    InvoicePatchPayload,
    InvoicePaymentDocument,
    InvoicePaymentPayload,
    InvoicePostPayload,
} from '../../../shared/contracts/invoice.generated';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

export class InvoiceApiError extends Error {
    readonly status: number;
    readonly code?: string;
    readonly responseBody?: unknown;

    constructor(
        message: string,
        status: number,
        code?: string,
        responseBody?: unknown,
    ) {
        super(message);
        this.name = 'InvoiceApiError';
        this.status = status;
        this.code = code;
        this.responseBody = responseBody;
    }

    get isConflict(): boolean {
        return this.status === 409;
    }
}

export type InvoiceMutationKey = string;
export type InvoiceDraftPatch = Omit<InvoicePatchPayload, 'expectedVersion'>;
export type InvoiceIssueInput = Omit<InvoiceIssuePayload, 'expectedVersion'>;
export type InvoicePaymentInput = Omit<InvoicePaymentPayload, 'expectedVersion'>;
export type InvoiceCancelInput = Omit<InvoiceCancelPayload, 'expectedVersion'>;

export function createInvoiceMutationKey(): InvoiceMutationKey {
    return uuidv4();
}

export function plnToMinor(value: string | number): number {
    const normalized = String(value).trim().replace(',', '.');
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
        throw new Error('Kwota musi być nieujemną liczbą z maksymalnie dwoma miejscami po przecinku.');
    }
    const [whole, fraction = ''] = normalized.split('.');
    const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(minor)) throw new Error('Kwota jest zbyt duża.');
    return minor;
}

export function minorToPln(value: number): number {
    return value / 100;
}

export { isInvoiceOverdue } from '../../../shared/contracts/invoice';

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const token = localStorage.getItem('kostiq_token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extra,
    };
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, init);
    const contentType = response.headers.get('content-type') || '';
    const body = response.status === 204
        ? undefined
        : contentType.includes('application/json')
            ? await response.json()
            : await response.text();
    if (!response.ok) {
        const errorBody = body as { error?: string; code?: string } | undefined;
        throw new InvoiceApiError(
            errorBody?.error || `Operacja faktury nie powiodła się (HTTP ${response.status}).`,
            response.status,
            errorBody?.code,
            body,
        );
    }
    return body as T;
}

function mutationHeaders(idempotencyKey: InvoiceMutationKey): Record<string, string> {
    if (!idempotencyKey?.trim()) throw new Error('Brak klucza idempotencji dla operacji faktury.');
    return authHeaders({ 'Idempotency-Key': idempotencyKey.trim() });
}

function versionHeaders(expectedVersion: number): Record<string, string> {
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw new Error('Brak prawidłowej wersji faktury. Odśwież dane i spróbuj ponownie.');
    }
    return authHeaders({ 'If-Match': `"${expectedVersion}"` });
}

export const invoiceService = {
    async getAllInvoices(): Promise<InvoiceDocument[]> {
        const byId = new Map<string, InvoiceDocument>();
        let page = 1;
        while (true) {
            const raw = await requestJson<InvoiceDocument[] | {
                data?: InvoiceDocument[];
                pagination?: { hasMore?: boolean };
            }>(`/invoices?limit=500&page=${page}`, { headers: authHeaders() });
            const invoices = Array.isArray(raw) ? raw : (raw.data || []);
            for (const invoice of invoices) {
                byId.set(invoice.id, invoice);
            }
            if (Array.isArray(raw) || !raw.pagination?.hasMore) break;
            page += 1;
        }
        return [...byId.values()];
    },

    async getJobInvoices(jobId: string): Promise<InvoiceDocument[]> {
        const byId = new Map<string, InvoiceDocument>();
        let page = 1;
        while (true) {
            const raw = await requestJson<InvoiceDocument[] | {
                data?: InvoiceDocument[];
                pagination?: { hasMore?: boolean };
            }>(`/invoices?jobId=${encodeURIComponent(jobId)}&limit=500&page=${page}`, { headers: authHeaders() });
            const invoices = Array.isArray(raw) ? raw : (raw.data || []);
            for (const invoice of invoices) {
                if (invoice.jobId === jobId) byId.set(invoice.id, invoice);
            }
            if (Array.isArray(raw) || !raw.pagination?.hasMore) break;
            page += 1;
        }
        return [...byId.values()];
    },

    async createInvoiceDraft(payload: InvoicePostPayload, idempotencyKey: InvoiceMutationKey): Promise<InvoiceDocument> {
        return requestJson('/invoices', { method: 'POST', headers: mutationHeaders(idempotencyKey), body: JSON.stringify(payload) });
    },

    async updateInvoiceDraft(id: string, payload: InvoiceDraftPatch, expectedVersion: number): Promise<InvoiceDocument> {
        return requestJson(`/invoices/${encodeURIComponent(id)}`, {
            method: 'PATCH', headers: versionHeaders(expectedVersion), body: JSON.stringify({ ...payload, expectedVersion }),
        });
    },

    async deleteInvoiceDraft(id: string, expectedVersion: number): Promise<void> {
        await requestJson<void>(`/invoices/${encodeURIComponent(id)}`, { method: 'DELETE', headers: versionHeaders(expectedVersion) });
    },

    async issueInvoice(id: string, payload: InvoiceIssueInput, expectedVersion: number, idempotencyKey: InvoiceMutationKey): Promise<InvoiceDocument> {
        return requestJson(`/invoices/${encodeURIComponent(id)}/issue`, {
            method: 'POST', headers: mutationHeaders(idempotencyKey), body: JSON.stringify({ ...payload, expectedVersion }),
        });
    },

    async registerPayment(id: string, payload: InvoicePaymentInput, expectedVersion: number, idempotencyKey: InvoiceMutationKey): Promise<{ invoice: InvoiceDocument; payment: InvoicePaymentDocument }> {
        return requestJson(`/invoices/${encodeURIComponent(id)}/pay`, {
            method: 'POST', headers: mutationHeaders(idempotencyKey), body: JSON.stringify({ ...payload, expectedVersion }),
        });
    },

    async cancelInvoice(id: string, payload: InvoiceCancelInput, expectedVersion: number, idempotencyKey: InvoiceMutationKey): Promise<InvoiceDocument> {
        return requestJson(`/invoices/${encodeURIComponent(id)}/cancel`, {
            method: 'POST', headers: mutationHeaders(idempotencyKey), body: JSON.stringify({ ...payload, expectedVersion }),
        });
    },

    async getInvoicePayments(id: string): Promise<InvoicePaymentDocument[]> {
        return requestJson(`/invoices/${encodeURIComponent(id)}/payments`, { headers: authHeaders() });
    },
};
