import type { InvoicePaidEventData } from '../types.js';
import { applyInvoicePayment } from '../../services/invoice.services.js';

/**
 * Indexer handler for the on-chain `InvoicePaidEvent`.
 *
 * Glue only. It delegates to the service layer, which owns all business logic
 * and database access. No Prisma, no computation, no state here.
 */
export const handleInvoicePaid = (
  event: InvoicePaidEventData,
  txHash: string,
): Promise<void> => applyInvoicePayment(event, txHash);
