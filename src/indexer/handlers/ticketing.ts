import { applyTicketPurchase, applyTicketResale } from '../../services/ticket.services.js';
import {
  decodeTicketPurchasedEventData,
  decodeTicketResoldEventData,
  type DecodedEvent,
} from '../types.js';

export const TICKET_PURCHASED_TOPIC = 'ticket_purchased_event';
export const TICKET_RESOLD_TOPIC = 'ticket_resold_event';

export const handleTicketPurchased = async (event: DecodedEvent): Promise<void> => {
  await applyTicketPurchase(decodeTicketPurchasedEventData(event.data), event.txHash);
};

export const handleTicketResold = async (event: DecodedEvent): Promise<void> => {
  await applyTicketResale(decodeTicketResoldEventData(event.data), event.txHash);
};
