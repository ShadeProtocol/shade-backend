import type { DecodedEvent } from './types.js';

/**
 * Close time of the ledger that contained an event.
 *
 * Used by handlers for the events the contract emits without their own
 * timestamp field, so a historical replay attributes them to when they
 * actually happened rather than to whenever the replay ran. Falls back to the
 * indexing time only if the RPC response carried no ledger close time — every
 * real `getEvents` response does.
 */
export const ledgerCloseTime = (event: DecodedEvent): Date => {
  if (!event.ledgerClosedAt) return new Date();
  const closedAt = new Date(event.ledgerClosedAt);
  return Number.isNaN(closedAt.getTime()) ? new Date() : closedAt;
};
