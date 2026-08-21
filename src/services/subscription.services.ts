import type {
  SubscriptionPlan,
  SubscriptionStatus as PrismaSubscriptionStatus,
} from '@prisma/client';
import prisma from '../config/prisma.js';
import type {
  SubscribedEventData,
  SubscriptionChargedEventData,
  SubscriptionPlanCreatedEventData,
} from '../indexer/types.js';
import { recordDailyStats, recordVolumeEvent } from './analytics.services.js';
import { recordAuditLog, ActorType } from './audit-log.services.js';

// String constants matching the Prisma enums. Defined locally so this module
// never imports a runtime value from `@prisma/client` (the generated client is
// mocked in tests and not generated in CI).
const TransactionType = {
  SUBSCRIPTION_CHARGE: 'SUBSCRIPTION_CHARGE',
} as const;

const SubscriptionStatus = {
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
} as const satisfies Record<string, PrismaSubscriptionStatus>;

/**
 * Applies an on-chain `SubscriptionPlanCreatedEvent` to the backend projection.
 *
 * Unlike invoices, plans have no off-chain-first creation path anywhere in this
 * backend — nothing writes a SubscriptionPlan row except this function — so
 * there is no correlation problem to solve. The plan is keyed on the on-chain
 * `planId`, which is unique, making this a plain create-if-not-exists.
 *
 * `SubscriptionPlanCreatedEvent` does not carry the plan's `description`
 * (verified against a live testnet event: its fields are plan_id, merchant,
 * token, amount, interval, timestamp), but `SubscriptionPlan.description` is
 * required here and in the contract's own struct. It is therefore read back
 * with `get_subscription_plan`; if that read fails the row is still created,
 * with a placeholder description that marks it as needing reconciliation.
 *
 * The IndexerEvent table remains the only replay guard; the `planId` lookup is
 * a natural-key existence check, not a second idempotency mechanism.
 */
export const applySubscriptionPlanCreated = async (
  event: SubscriptionPlanCreatedEventData,
  txHash: string,
  /**
   * What `get_subscription_plan` returned for this plan's description, or null
   * if the contract could not be read. Passed in by the handler rather than
   * fetched here so the RPC round-trip stays at the indexer edge and this
   * service remains pure persistence — see
   * ../indexer/handlers/subscriptionPlanCreated.ts.
   */
  description: string | null,
) => {
  const existing = await prisma.subscriptionPlan.findUnique({
    where: { planId: event.planId },
  });
  if (existing) {
    return existing;
  }

  // The event carries the merchant's Address, not the plan's numeric
  // merchant_id (the contract struct has both; the event emits the Address).
  const merchant = await prisma.merchant.findUnique({
    where: { address: event.merchant },
  });

  if (!merchant) {
    console.warn(
      `SubscriptionPlanCreated event for plan ${event.planId} (${txHash}) skipped: merchant ${event.merchant} is not in the database.`,
    );
    return null;
  }

  if (description === null) {
    console.warn(
      `SubscriptionPlanCreated event for plan ${event.planId} (${txHash}) stored a placeholder description: the event omits it and get_subscription_plan could not be read.`,
    );
  }

  const plan: SubscriptionPlan = await prisma.subscriptionPlan.create({
    data: {
      planId: event.planId,
      merchantId: merchant.id,
      description: description ?? `On-chain plan #${event.planId}`,
      token: event.token,
      amount: event.amount,
      interval: event.interval,
      active: true,
      // Backdated to the on-chain timestamp so a historical replay does not
      // report every plan as created on the day of the replay.
      createdAt: new Date(event.timestamp * 1000),
    },
  });

  await recordAuditLog({
    action: 'subscription_plan.created',
    actorType: ActorType.MERCHANT,
    actorId: merchant.id,
    actorLabel: event.merchant,
    targetType: 'SubscriptionPlan',
    targetId: plan.id,
    metadata: {
      source: 'on-chain',
      planId: event.planId,
      amount: event.amount.toString(),
      token: event.token,
      interval: event.interval,
      txHash,
    },
  });

  return plan;
};

/**
 * Applies an on-chain `SubscribedEvent` to the backend projection.
 *
 * Like plans, subscriptions have no off-chain-first creation path, so this is a
 * plain create-if-not-exists keyed on the unique on-chain `subscriptionId`.
 *
 * `merchantId` is taken from the resolved plan, never from the event (which
 * carries no merchant at all): the schema's composite FK requires a
 * subscription's merchant to match its plan's merchant, so the plan is the only
 * correct source. A subscription for a plan the backend has not indexed yet is
 * skipped rather than guessed at, matching applySubscriptionCharge.
 *
 * The IndexerEvent table remains the only replay guard; the `subscriptionId`
 * lookup is a natural-key existence check, not a second idempotency mechanism.
 */
export const applySubscribed = async (event: SubscribedEventData, txHash: string) => {
  const subscribedAt = new Date(event.timestamp * 1000);

  const existing = await prisma.subscription.findUnique({
    where: { subscriptionId: event.subscriptionId },
  });

  const plan = existing
    ? null
    : await prisma.subscriptionPlan.findUnique({ where: { planId: event.planId } });

  const subscription = await prisma.$transaction(async (tx: any) => {
    // The protocol-wide "new subscriptions today" counter is driven by the
    // event itself, not by whether a row could be created, so growth reporting
    // is unchanged from when this event only recorded daily stats.
    await recordDailyStats(tx, subscribedAt, { newSubscriptions: 1 });

    if (existing) {
      return null;
    }

    if (!plan) {
      console.warn(
        `Subscribed event for subscription ${event.subscriptionId} (${txHash}) skipped: plan ${event.planId} is not in the database.`,
      );
      return null;
    }

    return tx.subscription.create({
      data: {
        subscriptionId: event.subscriptionId,
        planId: plan.id,
        // Taken from the plan, not the event — the composite FK on Subscription
        // rejects a merchant that differs from the plan's.
        merchantId: plan.merchantId,
        customer: event.customer,
        status: SubscriptionStatus.ACTIVE,
        createdAt: subscribedAt,
      },
    });
  });

  if (!subscription) {
    return existing ?? null;
  }

  await recordAuditLog({
    action: 'subscription.created',
    // The subscriber is an on-chain customer address, not a merchant or admin
    // of this backend.
    actorType: ActorType.ANONYMOUS,
    actorLabel: event.customer,
    targetType: 'Subscription',
    targetId: subscription.id,
    metadata: {
      source: 'on-chain',
      subscriptionId: event.subscriptionId,
      planId: event.planId,
      txHash,
    },
  });

  return subscription;
};

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
