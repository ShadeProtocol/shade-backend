import prisma from '../../config/prisma.js';
import { recordDailyStats } from '../../services/analytics.services.js';
import {
  decodeInvoiceCreatedEventData,
  decodeMerchantRegisteredEventData,
  decodeSubscribedEventData,
  type DecodedEvent,
} from '../types.js';

export const MERCHANT_REGISTERED_TOPIC = 'merchant_registered_event';
export const INVOICE_CREATED_TOPIC = 'invoice_created_event';
export const SUBSCRIBED_TOPIC = 'subscribed_event';

/**
 * Growth events only move PlatformDailyStats' "new X today" counters. The
 * point-in-time totals they feed into (how many merchants exist, how many
 * invoices are in each status) are counted live at request time off the
 * existing tables, so nothing else needs recording here.
 */
export const handleMerchantRegistered = async (event: DecodedEvent): Promise<void> => {
  const data = decodeMerchantRegisteredEventData(event.data);
  await recordDailyStats(prisma, new Date(data.timestamp * 1000), { newMerchants: 1 });
};

export const handleInvoiceCreated = async (event: DecodedEvent): Promise<void> => {
  // `InvoiceCreatedEvent` is the one growth event the contract emits without a
  // timestamp field, so the day is taken from when the indexer sees it. The
  // indexer runs a few ledgers behind at most, so the two only differ for an
  // event created within seconds of UTC midnight.
  decodeInvoiceCreatedEventData(event.data);
  await recordDailyStats(prisma, new Date(), { newInvoices: 1 });
};

export const handleSubscribed = async (event: DecodedEvent): Promise<void> => {
  const data = decodeSubscribedEventData(event.data);
  await recordDailyStats(prisma, new Date(data.timestamp * 1000), { newSubscriptions: 1 });
};
