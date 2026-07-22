import { INVOICE_PAID_TOPIC } from './topics.js';
import { handleInvoicePaid } from './handlers/invoicePaid.js';
import type { InvoicePaidEventData } from './types.js';

/**
 * Structural signature of the Issue #24 registry's `registerEventHandler`.
 *
 * Declared here so this module compiles before #24 lands. When the registry
 * exists, replace this with its real type/import — only this file changes.
 */
export type RegisterEventHandler = (
  topic: string,
  handler: (event: InvoicePaidEventData, txHash: string) => Promise<void>,
) => void;

/**
 * Registers the indexer's event handlers against the pipeline registry.
 *
 * DEFERRED WIRING (Issue #24): the decode -> dedupe -> dispatch pipeline and its
 * `registerEventHandler` do not exist yet, so nothing calls this at runtime. The
 * registry function is injected rather than imported so this file does not
 * invent a competing registry (idempotency/dedupe stay #24's responsibility).
 *
 * When #24 merges, call `registerIndexerHandlers` from the indexer bootstrap
 * BEFORE polling starts, and confirm `INVOICE_PAID_TOPIC` against a real testnet
 * event first.
 */
export const registerIndexerHandlers = (register: RegisterEventHandler): void => {
  register(INVOICE_PAID_TOPIC, handleInvoicePaid);
};
