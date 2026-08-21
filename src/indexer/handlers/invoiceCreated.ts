import { applyInvoiceCreated } from '../../services/invoice.services.js';
import { fetchInvoiceDetails } from '../contractReader.js';
import { ledgerCloseTime } from '../ledgerTime.js';
import { decodeInvoiceCreatedEventData, type DecodedEvent } from '../types.js';

// Confirmed against a live testnet event: Soroban's `#[contractevent]` macro
// publishes a single fixed first topic, the struct name in lower snake case.
export const INVOICE_CREATED_TOPIC = 'invoice_created_event';

/**
 * Normalizes the event at the indexer edge and delegates all persistence to
 * applyInvoiceCreated.
 *
 * Part of that normalization is reading back what `InvoiceCreatedEvent` leaves
 * out: it carries neither the invoice's description nor its expiry, and both
 * matter downstream — the description is a required column and the strongest
 * signal available for correlating this event with an off-chain invoice row.
 * The read is best-effort and returns null on failure; keeping it here rather
 * than in the service also keeps the Soroban RPC client out of the HTTP app's
 * module graph, since nothing but the indexer reaches this path.
 *
 * `InvoiceCreatedEvent` is also one of the events the contract emits without a
 * timestamp field, so the occurrence time comes from the close time of the
 * ledger that contained it. Using the indexing time instead would attribute a
 * historical replay to whatever day the replay happened to run.
 */
export const handleInvoiceCreated = async (event: DecodedEvent): Promise<void> => {
  const data = decodeInvoiceCreatedEventData(event.data);
  const onChain = await fetchInvoiceDetails(data.invoiceId);

  await applyInvoiceCreated(data, event.txHash, ledgerCloseTime(event), onChain);
};
