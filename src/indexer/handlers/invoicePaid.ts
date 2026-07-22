import type { InvoicePaidEventData } from '../types.js';
import { applyInvoicePayment } from '../../services/invoice.services.js';

/**
 * Indexer handler for the on-chain `InvoicePaidEvent`.
 *
 * Glue only. It delegates to the service layer, which owns all business logic
 * and database access. No Prisma, no computation, no state here.
 */
export const handleInvoicePaid = async (
  event: InvoicePaidEventData,
  txHash: string,
): Promise<void> => {
  console.info(`[handler] handleInvoicePaid invoice=${event.invoiceId} tx=${txHash}`);
  await applyInvoicePayment(event, txHash);
};
