/**
 * Soroban event topic symbols the indexer subscribes to.
 *
 * The Shade contract declares `InvoicePaidEvent` with `#[contractevent]` and no
 * explicit `topics = [...]` override, so the on-wire topic symbol is derived by
 * the soroban-sdk macro from the struct name. The exact symbol (e.g.
 * `invoice_paid` vs `InvoicePaidEvent`) depends on the SDK version's macro
 * expansion and MUST be confirmed against a real emitted testnet event before it
 * is used to register the handler in the Issue #24 pipeline.
 *
 * Source of truth: contracts/shade/src/events.rs::InvoicePaidEvent
 *
 * PENDING VERIFICATION — do not treat as final until confirmed against a real
 * testnet event. It is intentionally not yet wired into a live subscription.
 */
export const INVOICE_PAID_TOPIC = 'invoice_paid' as const;
