import prisma from '../config/prisma.js';
import type { SubscriptionChargedEventData } from '../indexer/types.js';
import { recordVolumeEvent } from './analytics.services.js';

// String constant matching the Prisma `TransactionType` enum. Defined locally so
// this module never imports a runtime value from `@prisma/client` (the generated
// client is mocked in tests and not generated in CI).
const TransactionType = {
  SUBSCRIPTION_CHARGE: 'SUBSCRIPTION_CHARGE',
} as const;

/**
 * Applies a confirmed on-chain subscription charge to the backend projection.
 *
 * The merchant is resolved through the stored Subscription rather than the
 * event's `merchant` address, so a charge can only ever be attributed to the
 * merchant the backend already has linked to that subscription. A charge for a
 * subscription the backend has not indexed yet is skipped rather than guessed
 * at; the indexer's IndexerEvent table remains the only replay guard.
 */
export const applySubscriptionCharge = async (
  event: SubscriptionChargedEventData,
  txHash: string,
) => {
  const subscription = await prisma.subscription.findUnique({
    where: { subscriptionId: event.subscriptionId },
  });

  if (!subscription) {
    console.warn(
      `SubscriptionCharged event for subscription ${event.subscriptionId} (${txHash}) skipped: subscription is not in the database.`,
    );
    return null;
  }

  const chargedAt = new Date(event.timestamp * 1000);
  const description = `Subscription #${event.subscriptionId} charge${txHash ? ` (${txHash})` : ''}`;

  return prisma.$transaction(async (tx: any) => {
    const updatedSubscription = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        // A replayed or out-of-order charge must not walk lastCharged backwards.
        lastCharged:
          subscription.lastCharged && subscription.lastCharged > chargedAt
            ? subscription.lastCharged
            : chargedAt,
      },
    });

    const transaction = await tx.transaction.create({
      data: {
        transactionType: TransactionType.SUBSCRIPTION_CHARGE,
        refId: event.subscriptionId,
        amount: event.amount,
        token: event.token,
        description,
        merchantId: subscription.merchantId,
        date: chargedAt,
      },
    });

    await recordVolumeEvent(tx, {
      merchantId: subscription.merchantId,
      token: event.token,
      // The contract records the gross plan amount as volume and the fee taken
      // out of it, so the projection mirrors that.
      volume: event.amount,
      fee: event.fee,
      occurredAt: chargedAt,
    });

    return { subscription: updatedSubscription, transaction };
  });
};
