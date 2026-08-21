import { applySubscriptionPlanCreated } from '../../services/subscription.services.js';
import { fetchSubscriptionPlanDescription } from '../contractReader.js';
import { decodeSubscriptionPlanCreatedEventData, type DecodedEvent } from '../types.js';

// Confirmed against a live testnet event.
export const SUBSCRIPTION_PLAN_CREATED_TOPIC = 'subscription_plan_created_event';

/**
 * `SubscriptionPlanCreatedEvent` omits the plan's `description`, which is a
 * required column here and in the contract's own struct, so it is read back off
 * the contract at the indexer edge. The read is best-effort and returns null on
 * failure; the service stores a placeholder in that case rather than dropping
 * the plan.
 */
export const handleSubscriptionPlanCreated = async (event: DecodedEvent): Promise<void> => {
  const data = decodeSubscriptionPlanCreatedEventData(event.data);
  const description = await fetchSubscriptionPlanDescription(data.planId);

  await applySubscriptionPlanCreated(data, event.txHash, description);
};
