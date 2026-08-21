import { applyInvoicePayment } from '../../services/invoice.services.js';
import { decodeInvoicePaidEventData, type DecodedEvent } from '../types.js';

// Soroban's `#[contractevent]` macro publishes a single fixed first topic: the
// struct name in lower snake case. `InvoicePaidEvent` therefore arrives as
// "invoice_paid_event".
export const INVOICE_PAID_TOPIC = 'invoice_paid_event';

/**
 * Keeps contract-specific payload normalization at the indexer edge; all
 * persistence is delegated to applyInvoicePayment.
 */
export const handleInvoicePaid = async (event: DecodedEvent): Promise<void> => {
  await applyInvoicePayment(decodeInvoicePaidEventData(event.data), event.txHash);
};
