import prisma from '../../config/prisma.js';
import { recordDailyStats } from '../../services/analytics.services.js';
import { decodeMerchantRegisteredEventData, type DecodedEvent } from '../types.js';

export const MERCHANT_REGISTERED_TOPIC = 'merchant_registered_event';

/**
 * `MerchantRegistered` only moves PlatformDailyStats' "new merchants today"
 * counter. The point-in-time total it feeds into (how many merchants exist) is
 * counted live at request time off the existing table, so nothing else needs
 * recording here.
 *
 * The other two growth events, `invoice_created_event` and `subscribed_event`,
 * used to live here as stats-only handlers. They now project real rows as well,
 * so they have moved to ./invoiceCreated.ts and ./subscribed.ts — each still
 * increments the same daily counter it did here, from inside its service.
 */
export const handleMerchantRegistered = async (event: DecodedEvent): Promise<void> => {
  const data = decodeMerchantRegisteredEventData(event.data);
  await recordDailyStats(prisma, new Date(data.timestamp * 1000), { newMerchants: 1 });
};
