import { applyInvoicePayment } from '../../services/invoice.services.js';
import { decodeInvoicePaidEventData, type DecodedEvent } from '../types.js';

// The `#[contractevent] InvoicePaidEvent` macro emits this first topic symbol.
export const INVOICE_PAID_TOPIC = 'InvoicePaid';

/**
 * Keeps contract-specific payload normalization at the indexer edge; all
 * persistence is delegated to applyInvoicePayment.
 */
export const handleInvoicePaid = async (event: DecodedEvent): Promise<void> => {
  await applyInvoicePayment(decodeInvoicePaidEventData(event.data), event.txHash);
};
