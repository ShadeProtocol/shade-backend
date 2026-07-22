/**
 * Types for decoded Soroban events consumed by the indexer pipeline.
 *
 * The pipeline (decode -> dedupe -> dispatch, Issue #24) hands a fully decoded
 * event payload to a registered handler. These interfaces describe those
 * payloads at the boundary between the decoder and the handlers.
 */

export interface InvoicePaidEventData {
  invoiceId: string;
  merchantId: string;
  payer: string;
}
