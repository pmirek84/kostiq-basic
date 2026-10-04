import schema from './offer.schema.json';
export * from './offer.generated';

import type {
  OfferRecordKind,
  OfferStatus,
  OfferVatRate,
  OfferDiscountType
} from './offer.generated';

export const OFFER_SCHEMA = schema;

export const OFFER_RECORD_KINDS: readonly OfferRecordKind[] = Object.freeze([
  'offer',
  'template'
]);

export const OFFER_STATUSES: readonly OfferStatus[] = Object.freeze([
  'draft',
  'sent',
  'accepted',
  'rejected',
  'converted',
  'archived'
]);

export const OFFER_VAT_RATES: readonly OfferVatRate[] = Object.freeze([
  0,
  8,
  23
]);

export const OFFER_DISCOUNT_TYPES: readonly OfferDiscountType[] = Object.freeze([
  'none',
  'percent',
  'amount'
]);
