# Indexer

Consumes decoded Soroban events and applies them to the database.

## Status

The decode -> dedupe -> dispatch pipeline and the handler registry
(`registerEventHandler`) are delivered by **Issue #24** and are not in this
module yet. What lives here now:

- `types.ts` — `InvoicePaidEventData`, the decoded `InvoicePaidEvent` payload.
  i128 amounts are carried as strings to avoid JS number precision loss; see the
  contract's `events.rs::InvoicePaidEvent`.
- `topics.ts` — `INVOICE_PAID_TOPIC`. Derived from the `#[contractevent]` struct
  name; **must be confirmed against a real testnet event** before it is used to
  register the handler.
- `handlers/invoicePaid.ts` — `handleInvoicePaid`, glue only. Delegates to
  `applyInvoicePayment` in `services/invoice.services.ts`, which owns all
  business logic and Prisma access.
- `bootstrap.ts` — `registerIndexerHandlers(register)`, the wiring point. The
  registry function is injected, so this compiles before #24 lands and does not
  invent a competing registry.

## Deferred until Issue #24 merges

1. Call `registerIndexerHandlers` from the indexer bootstrap, before polling.
2. Confirm `INVOICE_PAID_TOPIC` against a real emitted testnet event.
3. End-to-end verification against testnet.
4. Deprecate `POST /pay/:slug/confirm` to log-only, after the handler is verified.

Idempotency (replay / dedupe) is the pipeline's responsibility (Issue #24);
handlers add no replay guards.
