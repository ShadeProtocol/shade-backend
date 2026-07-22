/**
 * Types for decoded Soroban events consumed by the indexer pipeline.
 *
 * The pipeline (decode -> dedupe -> dispatch, Issue #24) hands a fully decoded
 * event payload to a registered handler. These interfaces describe those
 * payloads at the boundary between the decoder and the handlers.
 */

/**
 * Decoded `InvoicePaidEvent` emitted by the Shade Soroban contract.
 *
 * Mirrors `contracts/shade/src/events.rs::InvoicePaidEvent`:
 *
 *   pub struct InvoicePaidEvent {
 *       pub invoice_id: u64,
 *       pub merchant_id: u64,
 *       pub merchant_account: Address,
 *       pub payer: Address,
 *       pub amount: i128,
 *       pub fee: i128,
 *       pub merchant_amount: i128,
 *       pub token: Address,
 *       pub timestamp: u64,
 *   }
 *
 * Amounts are `i128` on-chain. They are carried as decimal strings here so no
 * precision is lost passing through JavaScript `number` (safe only to 2^53).
 * The service parses them to `BigInt` before touching the database, whose
 * amount columns are `BigInt`.
 */
export interface InvoicePaidEventData {
  /** On-chain invoice id (contract `invoice_id: u64`). Maps to `Invoice.invoiceId`. */
  invoiceId: string;
  /** On-chain merchant id (contract `merchant_id: u64`). NOT the DB merchant uuid. */
  merchantId: string;
  /** Merchant's on-chain account address (contract `merchant_account`). */
  merchantAccount: string;
  /** Address that paid the invoice (contract `payer`). */
  payer: string;
  /** Gross amount paid, stroops/base units, as a decimal string (contract `amount: i128`). */
  amount: string;
  /** Protocol fee taken from the payment (contract `fee: i128`). */
  fee: string;
  /** Amount credited to the merchant after fee (contract `merchant_amount: i128`). */
  merchantAmount: string;
  /** Payment token contract address (contract `token`). */
  token: string;
  /** Ledger close time, seconds since epoch (contract `timestamp: u64`). */
  timestamp: number;
}
