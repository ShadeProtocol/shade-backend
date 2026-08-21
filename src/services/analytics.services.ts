import prisma from '../config/prisma.js';
import { AppError } from '../utils/errors.js';

/**
 * Prisma's interactive-transaction client is structurally identical to the
 * root client for the models used here, but its generated type does not
 * compose with the deep-mocked client used in tests. Handlers therefore pass
 * it through untyped, matching `applyInvoicePayment`'s existing `tx: any`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnalyticsWriteClient = any;

const DEFAULT_TIMESERIES_DAYS = 30;
const DEFAULT_TOKEN_LIMIT = 10;
const MAX_TOKEN_LIMIT = 100;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Truncates an instant to midnight UTC, the key for a PlatformDailyStats row. */
export const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export interface DailyStatsDelta {
  totalVolume?: bigint;
  totalFees?: bigint;
  transactionCount?: bigint;
  newInvoices?: number;
  newMerchants?: number;
  newSubscriptions?: number;
  newTickets?: number;
}

/**
 * Upserts today's (by UTC calendar day) PlatformDailyStats row, incrementing
 * only the fields present in `delta`. Rows are created on demand as events
 * arrive rather than by a scheduled batch job, consistent with how
 * MerchantAnalytics/TokenAnalytics are maintained.
 */
export const recordDailyStats = async (
  client: AnalyticsWriteClient,
  occurredAt: Date,
  delta: DailyStatsDelta,
): Promise<void> => {
  const create: Record<string, bigint | number | Date> = { date: startOfUtcDay(occurredAt) };
  const update: Record<string, { increment: bigint | number }> = {};

  for (const [field, value] of Object.entries(delta)) {
    if (value === undefined) continue;
    create[field] = value;
    update[field] = { increment: value };
  }

  await client.platformDailyStats.upsert({
    where: { date: startOfUtcDay(occurredAt) },
    create,
    update,
  });
};

export interface VolumeEvent {
  /** Merchant.id (uuid), not the on-chain numeric merchantId. */
  merchantId: string;
  token: string;
  /** Gross amount, matching what the contract feeds its own analytics. */
  volume: bigint;
  /** Platform fee taken from the gross amount; 0 where no fee applies. */
  fee: bigint;
  occurredAt: Date;
}

/**
 * Applies one volume-moving payment (invoice, subscription charge, ticket sale)
 * to every analytics projection: the merchant's per-token counters, the
 * protocol's per-token counters, and the protocol-wide daily rollup.
 *
 * Must be called inside the same transaction as the caller's own writes so a
 * failure cannot leave the projections ahead of the source records.
 */
export const recordVolumeEvent = async (
  tx: AnalyticsWriteClient,
  { merchantId, token, volume, fee, occurredAt }: VolumeEvent,
): Promise<void> => {
  // Read before the upsert: an existing row means this merchant has already
  // been counted against this token's uniqueMerchants tally.
  const existingMerchantAnalytics = await tx.merchantAnalytics.findUnique({
    where: { merchantId_token: { merchantId, token } },
    select: { id: true },
  });
  const isMerchantNewForToken = !existingMerchantAnalytics;

  await tx.merchantAnalytics.upsert({
    where: { merchantId_token: { merchantId, token } },
    create: {
      merchantId,
      token,
      totalVolume: volume,
      totalFees: fee,
      transactionCount: 1n,
    },
    update: {
      totalVolume: { increment: volume },
      totalFees: { increment: fee },
      transactionCount: { increment: 1n },
    },
  });

  await tx.tokenAnalytics.upsert({
    where: { token },
    create: {
      token,
      totalVolume: volume,
      totalFees: fee,
      transactionCount: 1n,
      // Creating the row implies its first merchant has just transacted.
      uniqueMerchants: 1,
    },
    update: {
      totalVolume: { increment: volume },
      totalFees: { increment: fee },
      transactionCount: { increment: 1n },
      ...(isMerchantNewForToken ? { uniqueMerchants: { increment: 1 } } : {}),
    },
  });

  await recordDailyStats(tx, occurredAt, {
    totalVolume: volume,
    totalFees: fee,
    transactionCount: 1n,
  });
};

// ── Read side (admin dashboard) ───────────────────────────────────────────────

const toStringAmount = (value: bigint | number | null | undefined): string =>
  (value ?? 0n).toString();

const countByKey = <T extends string>(
  groups: { _count: { _all: number } }[],
  key: (group: any) => T, // eslint-disable-line @typescript-eslint/no-explicit-any
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const group of groups) {
    counts[key(group)] = group._count._all;
  }
  return counts;
};

const sumCounts = (counts: Record<string, number>): number =>
  Object.values(counts).reduce((total, count) => total + count, 0);

/**
 * Protocol-wide current totals. Volume/fee/transaction totals come from
 * TokenAnalytics (the same rows the per-token endpoint serves, so the two can
 * never disagree); everything else is a live count at request time.
 *
 * Refunds are reported as a separate total rather than netted against volume:
 * the contract's `record_merchant_payment` is never called from a refund path,
 * so on-chain `total_volume` is not reduced by a refund either.
 */
export const getAnalyticsSummary = async () => {
  const [
    tokenTotals,
    merchantsWithVolume,
    refundTotals,
    merchantCount,
    activeMerchantCount,
    verifiedMerchantCount,
    invoicesByStatus,
    subscriptionsByStatus,
  ] = await Promise.all([
    prisma.tokenAnalytics.aggregate({
      _sum: { totalVolume: true, totalFees: true, transactionCount: true },
      _count: { _all: true },
    }),
    prisma.merchantAnalytics.groupBy({ by: ['merchantId'] }),
    prisma.invoice.aggregate({ _sum: { amountRefunded: true } }),
    prisma.merchant.count(),
    prisma.merchant.count({ where: { active: true } }),
    prisma.merchant.count({ where: { verified: true } }),
    prisma.invoice.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const invoiceCounts = countByKey(invoicesByStatus, group => group.status);
  const subscriptionCounts = countByKey(subscriptionsByStatus, group => group.status);

  return {
    totals: {
      totalVolume: toStringAmount(tokenTotals._sum?.totalVolume),
      totalFees: toStringAmount(tokenTotals._sum?.totalFees),
      transactionCount: toStringAmount(tokenTotals._sum?.transactionCount),
      totalRefunded: toStringAmount(refundTotals._sum?.amountRefunded),
      tokens: tokenTotals._count?._all ?? 0,
      merchantsWithVolume: merchantsWithVolume.length,
    },
    merchants: {
      total: merchantCount,
      active: activeMerchantCount,
      verified: verifiedMerchantCount,
    },
    invoices: {
      total: sumCounts(invoiceCounts),
      byStatus: invoiceCounts,
    },
    subscriptions: {
      total: sumCounts(subscriptionCounts),
      byStatus: subscriptionCounts,
    },
  };
};

const parseDateParam = (value: unknown, field: string): Date | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new AppError(400, `${field} must be an ISO date string`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, `${field} must be an ISO date string`);
  }
  return parsed;
};

/**
 * Daily PlatformDailyStats rows for the requested range, oldest first.
 *
 * Both bounds are optional and inclusive; the default window is the last 30
 * days. A range with no activity is an empty `data` array, not an error — the
 * indexer only creates rows for days that saw events.
 */
export const getAnalyticsTimeseries = async (query: Record<string, unknown>) => {
  const to = parseDateParam(query.to, 'to') ?? new Date();
  const from =
    parseDateParam(query.from, 'from') ??
    new Date(startOfUtcDay(to).getTime() - (DEFAULT_TIMESERIES_DAYS - 1) * MS_PER_DAY);

  const fromDay = startOfUtcDay(from);
  const toDay = startOfUtcDay(to);

  if (fromDay > toDay) {
    throw new AppError(400, 'from must not be after to');
  }

  const rows = await prisma.platformDailyStats.findMany({
    where: { date: { gte: fromDay, lte: toDay } },
    orderBy: { date: 'asc' },
  });

  return {
    from: fromDay.toISOString(),
    to: toDay.toISOString(),
    data: rows.map(row => ({
      date: row.date.toISOString(),
      totalVolume: row.totalVolume.toString(),
      totalFees: row.totalFees.toString(),
      transactionCount: row.transactionCount.toString(),
      newInvoices: row.newInvoices,
      newMerchants: row.newMerchants,
      newSubscriptions: row.newSubscriptions,
      newTickets: row.newTickets,
    })),
  };
};

/**
 * Top tokens by volume, served from TokenAnalytics rather than the contract's
 * `get_top_tokens_by_volume` — the numbers are the same projection and a
 * frequently refreshed dashboard should not pay for a live contract call.
 */
export const getTopTokensByVolume = async (query: Record<string, unknown>) => {
  let limit = DEFAULT_TOKEN_LIMIT;

  if (query.limit !== undefined && query.limit !== '') {
    const parsed = Number(query.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_TOKEN_LIMIT) {
      throw new AppError(400, `limit must be an integer between 1 and ${MAX_TOKEN_LIMIT}`);
    }
    limit = parsed;
  }

  const tokens = await prisma.tokenAnalytics.findMany({
    orderBy: { totalVolume: 'desc' },
    take: limit,
  });

  return {
    data: tokens.map(token => ({
      token: token.token,
      totalVolume: token.totalVolume.toString(),
      totalFees: token.totalFees.toString(),
      transactionCount: token.transactionCount.toString(),
      uniqueMerchants: token.uniqueMerchants,
      lastUpdated: token.lastUpdated,
    })),
  };
};
