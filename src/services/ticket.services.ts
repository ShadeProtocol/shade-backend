import prisma from '../config/prisma.js';
import type { TicketPurchasedEventData, TicketResoldEventData } from '../indexer/types.js';
import { recordDailyStats, recordVolumeEvent } from './analytics.services.js';

/**
 * Event ticketing has no backend models yet — there is no `Event` or `Ticket`
 * table to write a sale into, and building one is a separate piece of work.
 * What these handlers can do without it is keep the analytics projections
 * honest: a ticket sale moves real volume for a merchant that *is* in the
 * database (the event carries the on-chain `merchant_id`), so it is folded into
 * MerchantAnalytics/TokenAnalytics/PlatformDailyStats exactly like an invoice
 * payment. No Transaction row is written: the Prisma `TransactionType` enum has
 * no ticketing member, and adding one belongs with the ticketing models.
 */
const findMerchant = async (merchantId: number, label: string, txHash: string) => {
  const merchant = await prisma.merchant.findUnique({ where: { merchantId } });

  if (!merchant) {
    console.warn(
      `${label} event (${txHash}) skipped: merchant ${merchantId} is not in the database.`,
    );
    return null;
  }

  return merchant;
};

export const applyTicketPurchase = async (event: TicketPurchasedEventData, txHash: string) => {
  const merchant = await findMerchant(event.merchantId, 'TicketPurchased', txHash);
  if (!merchant) return null;

  const purchasedAt = new Date(event.timestamp * 1000);

  return prisma.$transaction(async (tx: any) => {
    await recordVolumeEvent(tx, {
      merchantId: merchant.id,
      token: event.token,
      volume: event.amount,
      fee: event.fee,
      occurredAt: purchasedAt,
    });

    await recordDailyStats(tx, purchasedAt, { newTickets: 1 });
  });
};

export const applyTicketResale = async (event: TicketResoldEventData, txHash: string) => {
  const merchant = await findMerchant(event.merchantId, 'TicketResold', txHash);
  if (!merchant) return null;

  const resoldAt = new Date(event.timestamp * 1000);

  return prisma.$transaction(async (tx: any) => {
    // A resale is peer-to-peer: the merchant's take is the royalty and the
    // contract charges no platform fee on it, so the royalty is the volume and
    // the fee is zero. `newTickets` is not incremented — no ticket was minted.
    await recordVolumeEvent(tx, {
      merchantId: merchant.id,
      token: event.token,
      volume: event.royalty,
      fee: 0n,
      occurredAt: resoldAt,
    });
  });
};
