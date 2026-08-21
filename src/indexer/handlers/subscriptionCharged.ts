import { applySubscriptionCharge } from '../../services/subscription.services.js';
import { decodeSubscriptionChargedEventData, type DecodedEvent } from '../types.js';

export const SUBSCRIPTION_CHARGED_TOPIC = 'subscription_charged_event';

export const handleSubscriptionCharged = async (event: DecodedEvent): Promise<void> => {
  await applySubscriptionCharge(decodeSubscriptionChargedEventData(event.data), event.txHash);
};
