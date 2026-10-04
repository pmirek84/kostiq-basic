import schema from './invoice.schema.json';
export * from './invoice.generated';

import type {
  InvoiceDocumentStatus,
  InvoiceImportDocumentStatus,
  InvoicePaymentStatus,
  InvoiceVatRate,
  InvoiceCurrency,
  InvoicePaymentMethod,
  InvoicePaymentType
} from './invoice.generated';

export const INVOICE_SCHEMA = schema;

export const INVOICE_DOCUMENT_STATUSES: readonly InvoiceDocumentStatus[] = Object.freeze([
  'draft',
  'issued',
  'cancelled'
]);

export const INVOICE_IMPORT_DOCUMENT_STATUSES: readonly InvoiceImportDocumentStatus[] = Object.freeze([
  'issued',
  'cancelled'
]);

export const INVOICE_PAYMENT_STATUSES: readonly InvoicePaymentStatus[] = Object.freeze([
  'unpaid',
  'partial',
  'paid'
]);

export const INVOICE_VAT_RATES: readonly InvoiceVatRate[] = Object.freeze([
  0,
  5,
  8,
  23
]);

export const INVOICE_CURRENCIES: readonly InvoiceCurrency[] = Object.freeze([
  'PLN'
]);

export const INVOICE_PAYMENT_METHODS: readonly InvoicePaymentMethod[] = Object.freeze([
  'transfer',
  'cash',
  'card',
  'blik',
  'other'
]);

export const INVOICE_PAYMENT_TYPES: readonly InvoicePaymentType[] = Object.freeze([
  'payment',
  'refund'
]);

/**
 * Returns YYYY-MM-DD calendar date in Europe/Warsaw timezone.
 */
export function getWarsawDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Calculates whether an issued invoice is currently overdue in Europe/Warsaw timezone.
 * Note: overdue is a dynamic computed attribute based on Warsaw date, not a stored state.
 */
export function isInvoiceOverdue(doc: { documentStatus: string; paymentStatus: string; dueDate?: string | null }, referenceDateStr?: string): boolean {
  if (doc.documentStatus !== 'issued') return false;
  if (doc.paymentStatus === 'paid') return false;
  if (!doc.dueDate) return false;
  const today = referenceDateStr || getWarsawDateString();
  return doc.dueDate < today;
}

/**
 * Domain validator ensuring invariant relations across document statuses, number formats, VAT calculations, and amounts.
 */
export function validateInvoiceDomainRules(doc: any): boolean {
  if (!doc || typeof doc !== 'object') {
    throw new Error('Dokument faktury musi być obiektem.');
  }

  // 1. Lifecycle status rules
  if (doc.documentStatus === 'draft') {
    if (doc.invoiceNumber !== null && doc.invoiceNumber !== undefined) {
      throw new Error(`Szkic faktury nie może posiadać przydzielonego numeru (otrzymano: '${doc.invoiceNumber}').`);
    }
    if (doc.issueDate !== null && doc.issueDate !== undefined) {
      throw new Error(`Szkic faktury nie może posiadać daty wystawienia (otrzymano: '${doc.issueDate}').`);
    }
    if (doc.cancelledAt !== null && doc.cancelledAt !== undefined) {
      throw new Error('Szkic faktury nie może posiadać znacznika anulowania.');
    }
    if (doc.cancelReason !== null && doc.cancelReason !== undefined) {
      throw new Error('Szkic faktury nie może posiadać powodu anulowania.');
    }
    if (doc.paymentStatus !== 'unpaid') {
      throw new Error(`Szkic faktury musi mieć status płatności 'unpaid' (otrzymano: '${doc.paymentStatus}').`);
    }
    if (doc.paidAmountMinor !== 0) {
      throw new Error(`Szkic faktury nie może posiadać wpłat (paidAmountMinor: ${doc.paidAmountMinor}).`);
    }
  } else if (doc.documentStatus === 'issued') {
    if (!doc.invoiceNumber || !/^FV\/\d{4}\/\d{3,}$/.test(doc.invoiceNumber)) {
      throw new Error(`Wystawiona faktura musi posiadać prawidłowy numer FV/YYYY/NNN z min. 3 cyframi (otrzymano: '${doc.invoiceNumber}').`);
    }
    if (!doc.issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(doc.issueDate)) {
      throw new Error(`Wystawiona faktura musi posiadać poprawną kalendarzową datę wystawienia (otrzymano: '${doc.issueDate}').`);
    }
    const numYear = doc.invoiceNumber.split('/')[1];
    const issueYear = doc.issueDate.slice(0, 4);
    if (numYear !== issueYear) {
      throw new Error(`Rok w numerze faktury '${doc.invoiceNumber}' (${numYear}) nie zgadza się z rokiem daty wystawienia '${doc.issueDate}' (${issueYear}).`);
    }
    if (doc.cancelledAt !== null && doc.cancelledAt !== undefined) {
      throw new Error('Wystawiona (nieanulowana) faktura nie może posiadać znacznika anulowania.');
    }
    if (doc.cancelReason !== null && doc.cancelReason !== undefined) {
      throw new Error('Wystawiona (nieanulowana) faktura nie może posiadać powodu anulowania.');
    }
  } else if (doc.documentStatus === 'cancelled') {
    if (!doc.invoiceNumber || !/^FV\/\d{4}\/\d{3,}$/.test(doc.invoiceNumber)) {
      throw new Error(`Anulowana faktura musi posiadać numer wystawienia FV/YYYY/NNN (otrzymano: '${doc.invoiceNumber}').`);
    }
    if (!doc.issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(doc.issueDate)) {
      throw new Error(`Anulowana faktura musi posiadać datę wcześniejszego wystawienia (otrzymano: '${doc.issueDate}').`);
    }
    const numYear = doc.invoiceNumber.split('/')[1];
    const issueYear = doc.issueDate.slice(0, 4);
    if (numYear !== issueYear) {
      throw new Error(`Rok w numerze faktury '${doc.invoiceNumber}' (${numYear}) nie zgadza się z rokiem daty wystawienia '${doc.issueDate}' (${issueYear}).`);
    }
    if (!doc.cancelledAt) {
      throw new Error('Anulowana faktura musi posiadać znacznik czasu anulowania (cancelledAt).');
    }
    if (!doc.cancelReason || typeof doc.cancelReason !== 'string' || doc.cancelReason.trim().length === 0) {
      throw new Error('Anulowana faktura musi posiadać niepusty powód anulowania (cancelReason).');
    }
    if (doc.paidAmountMinor !== 0) {
      throw new Error(`Anulowanie faktury z nierozliczonymi wpłatami jest niedozwolone. Saldo wpłat musi wynosić 0 (aktualnie: ${doc.paidAmountMinor}).`);
    }
  } else {
    throw new Error(`Nieznany documentStatus faktury: '${doc.documentStatus}'.`);
  }

  // 2. Amount and VAT parity
  if (typeof doc.amountNetMinor !== 'number' || doc.amountNetMinor < 0 || !Number.isInteger(doc.amountNetMinor)) {
    throw new Error(`Nieprawidłowa kwota netto amountNetMinor: ${doc.amountNetMinor}.`);
  }
  if (typeof doc.vatAmountMinor !== 'number' || doc.vatAmountMinor < 0 || !Number.isInteger(doc.vatAmountMinor)) {
    throw new Error(`Nieprawidłowa kwota VAT vatAmountMinor: ${doc.vatAmountMinor}.`);
  }
  if (typeof doc.amountGrossMinor !== 'number' || doc.amountGrossMinor < 0 || !Number.isInteger(doc.amountGrossMinor)) {
    throw new Error(`Nieprawidłowa kwota brutto amountGrossMinor: ${doc.amountGrossMinor}.`);
  }
  if (doc.amountGrossMinor !== doc.amountNetMinor + doc.vatAmountMinor) {
    throw new Error(`Niezgodność sumy brutto: amountGrossMinor (${doc.amountGrossMinor}) != net (${doc.amountNetMinor}) + vat (${doc.vatAmountMinor}).`);
  }

  // 3. Items consistency or simplified header verification
  if (Array.isArray(doc.items) && doc.items.length > 0) {
    if (doc.vatRate !== null) {
      throw new Error(`Dla faktury pozycyjnej nagłówkowy vatRate musi wynosić null (otrzymano: ${doc.vatRate}). Stawki VAT wynikają z pozycji.`);
    }
    let sumNet = 0;
    let sumVat = 0;
    let sumGross = 0;
    for (let i = 0; i < doc.items.length; i++) {
      const item = doc.items[i];
      if (!Number.isInteger(item.unitNetMinor) || item.unitNetMinor < 0) {
        throw new Error(`Pozycja #${i + 1} faktury posiada nieprawidłową cenę jednostkową netto: ${item.unitNetMinor}.`);
      }
      const expectedItemNet = Math.round(item.quantity * item.unitNetMinor);
      if (item.amountNetMinor !== expectedItemNet) {
        throw new Error(`Pozycja #${i + 1} faktury posiada błędną kwotę netto (${item.amountNetMinor} != oczekiwane ${expectedItemNet}).`);
      }
      const expectedItemVat = Math.round(item.amountNetMinor * (item.vatRate / 100));
      if (item.vatAmountMinor !== expectedItemVat) {
        throw new Error(`Pozycja #${i + 1} faktury posiada błędną kwotę VAT (${item.vatAmountMinor} != oczekiwane ${expectedItemVat}).`);
      }
      const expectedItemGross = item.amountNetMinor + item.vatAmountMinor;
      if (item.amountGrossMinor !== expectedItemGross) {
        throw new Error(`Pozycja #${i + 1} faktury posiada błędną kwotę brutto (${item.amountGrossMinor} != oczekiwane ${expectedItemGross}).`);
      }
      sumNet += item.amountNetMinor;
      sumVat += item.vatAmountMinor;
      sumGross += item.amountGrossMinor;
    }
    if (sumNet !== doc.amountNetMinor) {
      throw new Error(`Suma pozycji netto (${sumNet}) różni się od kwoty netto faktury (${doc.amountNetMinor}).`);
    }
    if (sumVat !== doc.vatAmountMinor) {
      throw new Error(`Suma pozycji VAT (${sumVat}) różni się od kwoty VAT faktury (${doc.vatAmountMinor}).`);
    }
    if (sumGross !== doc.amountGrossMinor) {
      throw new Error(`Suma pozycji brutto (${sumGross}) różni się od kwoty brutto faktury (${doc.amountGrossMinor}).`);
    }
  } else {
    if (doc.vatRate === null || doc.vatRate === undefined || typeof doc.vatRate !== 'number' || ![0, 5, 8, 23].includes(doc.vatRate)) {
      throw new Error(`Dla faktury uproszczonej nagłówkowy vatRate jest wymagany i musi być jedną z dozwolonych stawek (0, 5, 8, 23) (otrzymano: ${doc.vatRate}).`);
    }
    const expectedDocVat = Math.round(doc.amountNetMinor * (doc.vatRate / 100));
    if (doc.vatAmountMinor !== expectedDocVat) {
      throw new Error(`Błędna kwota VAT w nagłówku faktury (${doc.vatAmountMinor} != oczekiwane ${expectedDocVat} dla stawki ${doc.vatRate}%).`);
    }
  }

  // 4. Payment status, paidAmountMinor, and remainingAmountMinor parity
  if (typeof doc.paidAmountMinor !== 'number' || doc.paidAmountMinor < 0 || !Number.isInteger(doc.paidAmountMinor)) {
    throw new Error(`Nieprawidłowa kwota opłacona paidAmountMinor: ${doc.paidAmountMinor}.`);
  }
  if (doc.paidAmountMinor > doc.amountGrossMinor) {
    throw new Error(`Kwota wpłat paidAmountMinor (${doc.paidAmountMinor}) przekracza kwotę brutto (${doc.amountGrossMinor}).`);
  }
  const expectedRemaining = doc.amountGrossMinor - doc.paidAmountMinor;
  if (doc.remainingAmountMinor !== expectedRemaining) {
    throw new Error(`Niezgodność remainingAmountMinor: ${doc.remainingAmountMinor} != oczekiwane gross - paid (${expectedRemaining}).`);
  }

  if (doc.paidAmountMinor === 0) {
    if (doc.paymentStatus !== 'unpaid') {
      throw new Error(`Faktura z wpłatami = 0 musi mieć paymentStatus 'unpaid' (otrzymano: '${doc.paymentStatus}').`);
    }
  } else if (doc.paidAmountMinor < doc.amountGrossMinor) {
    if (doc.paymentStatus !== 'partial') {
      throw new Error(`Częściowo opłacona faktura (${doc.paidAmountMinor} < ${doc.amountGrossMinor}) musi mieć paymentStatus 'partial' (otrzymano: '${doc.paymentStatus}').`);
    }
  } else {
    if (doc.paymentStatus !== 'paid') {
      throw new Error(`W pełni opłacona faktura (${doc.paidAmountMinor} >= ${doc.amountGrossMinor}) musi mieć paymentStatus 'paid' (otrzymano: '${doc.paymentStatus}').`);
    }
  }

  return true;
}

/**
 * Validates the deterministic sequence of payments/refunds in import or ledger.
 * Enforces per-paymentId balance tracking (cannot refund more than the specific payment) and sequential ordering.
 * Returns the final calculated paidAmountMinor (net collected cash).
 */
export function validateInvoicePaymentsLedger(payments: any[] = [], options: { isCancelled?: boolean; amountGrossMinor?: number } = {}): number {
  if (!Array.isArray(payments)) {
    throw new Error('Płatności muszą być tablicą zdarzeń.');
  }

  const { isCancelled = false, amountGrossMinor = 0 } = options;
  let runningBalance = 0;
  let lastSequence = 0;
  let lastDate = '';
  const eventIds = new Set<string>();
  const paymentBalanceMap = new Map<string, number>();

  for (let i = 0; i < payments.length; i++) {
    const p = payments[i];
    if (!p || typeof p !== 'object') {
      throw new Error(`Zdarzenie płatnicze #${i + 1} jest nieprawidłowe.`);
    }
    if (!p.id || typeof p.id !== 'string') {
      throw new Error(`Zdarzenie płatnicze #${i + 1} musi posiadać unikalny identyfikator 'id'.`);
    }
    if (eventIds.has(p.id)) {
      throw new Error(`Zduplikowane id zdarzenia płatniczego: '${p.id}'.`);
    }
    eventIds.add(p.id);

    if (!Number.isInteger(p.sequence) || p.sequence <= lastSequence) {
      throw new Error(`Zdarzenie płatnicze #${i + 1} posiada nieprawidłową lub malejącą sekwencję (sequence: ${p.sequence}, poprzednia: ${lastSequence}).`);
    }
    lastSequence = p.sequence;

    if (p.paymentDate < lastDate) {
      throw new Error(`Zdarzenie płatnicze #${i + 1} narusza kolejność chronologiczną (${p.paymentDate} wcześniejsza niż ${lastDate}).`);
    }
    lastDate = p.paymentDate;

    if (!Number.isInteger(p.amountMinor) || p.amountMinor <= 0) {
      throw new Error(`Zdarzenie płatnicze #${i + 1} posiada nieprawidłową kwotę amountMinor (${p.amountMinor}). Wymagana dodatnia liczba całkowita.`);
    }

    if (p.type === 'payment') {
      paymentBalanceMap.set(p.id, p.amountMinor);
      runningBalance += p.amountMinor;
    } else if (p.type === 'refund') {
      if (!p.reversesPaymentId) {
        throw new Error(`Zwrot #${i + 1} ('${p.id}') musi wskazywać reversesPaymentId.`);
      }
      if (!paymentBalanceMap.has(p.reversesPaymentId)) {
        throw new Error(`Zwrot #${i + 1} odwołuje się do nieznanego wcześniejszego ID wpłaty: '${p.reversesPaymentId}'.`);
      }
      const availablePaymentBalance = paymentBalanceMap.get(p.reversesPaymentId)!;
      if (p.amountMinor > availablePaymentBalance) {
        throw new Error(`Zwrot #${i + 1} (${p.amountMinor}) przewyższa dostępne saldo wpłaty '${p.reversesPaymentId}' (${availablePaymentBalance}).`);
      }
      paymentBalanceMap.set(p.reversesPaymentId, availablePaymentBalance - p.amountMinor);
      runningBalance -= p.amountMinor;
    } else {
      throw new Error(`Nieznany typ zdarzenia płatniczego: '${p.type}'.`);
    }
  }

  if (amountGrossMinor > 0 && runningBalance > amountGrossMinor) {
    throw new Error(`Łączna kwota wpłat (${runningBalance}) przekracza kwotę brutto faktury (${amountGrossMinor}).`);
  }

  if (isCancelled && runningBalance !== 0) {
    throw new Error(`Anulowana faktura nie może posiadać dodatniego salda wpłat. Saldo końcowe wynosi: ${runningBalance}.`);
  }

  return runningBalance;
}
