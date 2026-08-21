import { applySubscribed } from '../../services/subscription.services.js';
import { decodeSubscribedEventData, type DecodedEvent } from '../types.js';

// Confirmed against a live testnet event.
export const SUBSCRIBED_TOPIC = 'subscribed_event';

export const handleSubscribed = async (event: DecodedEvent): Promise<void> => {
  await applySubscribed(decodeSubscribedEventData(event.data), event.txHash);
};
