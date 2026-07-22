/**
 * Public surface of the indexer module.
 *
 * The decode -> dedupe -> dispatch pipeline and its handler registry land in
 * Issue #24. This barrel re-exports the pieces the InvoicePaid handler needs so
 * the #24 bootstrap can wire them up in one import.
 */
export type { InvoicePaidEventData } from './types.js';
export { INVOICE_PAID_TOPIC } from './topics.js';
export { handleInvoicePaid } from './handlers/invoicePaid.js';
