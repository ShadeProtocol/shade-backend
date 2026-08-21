import { beforeEach } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const {
  startOfUtcDay,
  recordDailyStats,
  recordVolumeEvent,
  getAnalyticsSummary,
  getAnalyticsTimeseries,
  getTopTokensByVolume,
} = await import('../../src/services/analytics.services.js');
const { AppError } = await import('../../src/utils/errors.js');

const MERCHANT_ID = 'merchant-uuid';
const TOKEN = 'CABC...TOKEN';

describe('startOfUtcDay', () => {
  test('truncates an instant to midnight UTC', () => {
    expect(startOfUtcDay(new Date('2026-08-21T23:59:59.999Z')).toISOString()).toBe(
      '2026-08-21T00:00:00.000Z',
    );
  });

  test('buckets by UTC day, not local day', () => {
    // 00:30 UTC on the 21st is still the 20th in every negative offset.
    expect(startOfUtcDay(new Date('2026-08-21T00:30:00.000Z')).toISOString()).toBe(
      '2026-08-21T00:00:00.000Z',
    );
  });
});

describe('recordDailyStats', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  test('increments only the fields present in the delta', async () => {
    await recordDailyStats(prismaMock, new Date('2026-08-21T09:15:00.000Z'), { newMerchants: 1 });

    expect(prismaMock.platformDailyStats.upsert).toHaveBeenCalledWith({
      where: { date: new Date('2026-08-21T00:00:00.000Z') },
      create: { date: new Date('2026-08-21T00:00:00.000Z'), newMerchants: 1 },
      update: { newMerchants: { increment: 1 } },
    });
  });
});

describe('recordVolumeEvent', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  const event = {
    merchantId: MERCHANT_ID,
    token: TOKEN,
    volume: 1_000_000n,
    fee: 10_000n,
    occurredAt: new Date('2026-08-21T09:15:00.000Z'),
  };

  test('upserts merchant, token and daily projections for a payment', async () => {
    prismaMock.merchantAnalytics.findUnique.mockResolvedValue(null);

    await recordVolumeEvent(prismaMock, event);

    expect(prismaMock.merchantAnalytics.upsert).toHaveBeenCalledWith({
      where: { merchantId_token: { merchantId: MERCHANT_ID, token: TOKEN } },
      create: {
        merchantId: MERCHANT_ID,
        token: TOKEN,
        totalVolume: 1_000_000n,
        totalFees: 10_000n,
        transactionCount: 1n,
      },
      update: {
        totalVolume: { increment: 1_000_000n },
        totalFees: { increment: 10_000n },
        transactionCount: { increment: 1n },
      },
    });

    expect(prismaMock.platformDailyStats.upsert).toHaveBeenCalledWith({
      where: { date: new Date('2026-08-21T00:00:00.000Z') },
      create: {
        date: new Date('2026-08-21T00:00:00.000Z'),
        totalVolume: 1_000_000n,
        totalFees: 10_000n,
        transactionCount: 1n,
      },
      update: {
        totalVolume: { increment: 1_000_000n },
        totalFees: { increment: 10_000n },
        transactionCount: { increment: 1n },
      },
    });
  });

  test('bumps uniqueMerchants the first time a merchant transacts in a token', async () => {
    prismaMock.merchantAnalytics.findUnique.mockResolvedValue(null);

    await recordVolumeEvent(prismaMock, event);

    const tokenUpsert = prismaMock.tokenAnalytics.upsert.mock.calls[0][0];
    expect(tokenUpsert.create.uniqueMerchants).toBe(1);
    expect(tokenUpsert.update.uniqueMerchants).toEqual({ increment: 1 });
  });

  test('leaves uniqueMerchants alone for a merchant already seen in that token', async () => {
    prismaMock.merchantAnalytics.findUnique.mockResolvedValue({ id: 'analytics-uuid' });

    await recordVolumeEvent(prismaMock, event);

    const tokenUpsert = prismaMock.tokenAnalytics.upsert.mock.calls[0][0];
    expect(tokenUpsert.update.uniqueMerchants).toBeUndefined();
    expect(tokenUpsert.update.totalVolume).toEqual({ increment: 1_000_000n });
  });
});

describe('getAnalyticsSummary', () => {
  beforeEach(() => {
    mockReset(prismaMock);

    prismaMock.tokenAnalytics.aggregate.mockResolvedValue({
      _sum: { totalVolume: 5_000_000n, totalFees: 50_000n, transactionCount: 7n },
      _count: { _all: 2 },
    });
    prismaMock.merchantAnalytics.groupBy.mockResolvedValue([
      { merchantId: 'm-1' },
      { merchantId: 'm-2' },
      { merchantId: 'm-3' },
    ]);
    prismaMock.invoice.aggregate.mockResolvedValue({ _sum: { amountRefunded: 250_000n } });
    prismaMock.merchant.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(4);
    prismaMock.invoice.groupBy.mockResolvedValue([
      { status: 'PAID', _count: { _all: 6 } },
      { status: 'PENDING', _count: { _all: 2 } },
    ]);
    prismaMock.subscription.groupBy.mockResolvedValue([
      { status: 'ACTIVE', _count: { _all: 3 } },
      { status: 'CANCELLED', _count: { _all: 1 } },
    ]);
  });

  test('reports TokenAnalytics totals alongside live counts', async () => {
    const summary = await getAnalyticsSummary();

    expect(summary).toEqual({
      totals: {
        totalVolume: '5000000',
        totalFees: '50000',
        transactionCount: '7',
        totalRefunded: '250000',
        tokens: 2,
        merchantsWithVolume: 3,
      },
      merchants: { total: 10, active: 9, verified: 4 },
      invoices: { total: 8, byStatus: { PAID: 6, PENDING: 2 } },
      subscriptions: { total: 4, byStatus: { ACTIVE: 3, CANCELLED: 1 } },
    });
  });

  test('reports zeroes rather than nulls on an empty protocol', async () => {
    mockReset(prismaMock);
    prismaMock.tokenAnalytics.aggregate.mockResolvedValue({
      _sum: { totalVolume: null, totalFees: null, transactionCount: null },
      _count: { _all: 0 },
    });
    prismaMock.merchantAnalytics.groupBy.mockResolvedValue([]);
    prismaMock.invoice.aggregate.mockResolvedValue({ _sum: { amountRefunded: null } });
    prismaMock.merchant.count.mockResolvedValue(0);
    prismaMock.invoice.groupBy.mockResolvedValue([]);
    prismaMock.subscription.groupBy.mockResolvedValue([]);

    const summary = await getAnalyticsSummary();

    expect(summary.totals).toEqual({
      totalVolume: '0',
      totalFees: '0',
      transactionCount: '0',
      totalRefunded: '0',
      tokens: 0,
      merchantsWithVolume: 0,
    });
    expect(summary.invoices).toEqual({ total: 0, byStatus: {} });
  });
});

describe('getAnalyticsTimeseries', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  const row = {
    id: 'daily-uuid',
    date: new Date('2026-08-20T00:00:00.000Z'),
    totalVolume: 1_000_000n,
    totalFees: 10_000n,
    transactionCount: 2n,
    newInvoices: 3,
    newMerchants: 1,
    newSubscriptions: 0,
    newTickets: 4,
    updatedAt: new Date('2026-08-20T10:00:00.000Z'),
  };

  test('queries the requested UTC day range in ascending date order', async () => {
    prismaMock.platformDailyStats.findMany.mockResolvedValue([row]);

    const result = await getAnalyticsTimeseries({
      from: '2026-08-19',
      to: '2026-08-21T18:00:00.000Z',
    });

    expect(prismaMock.platformDailyStats.findMany).toHaveBeenCalledWith({
      where: {
        date: {
          gte: new Date('2026-08-19T00:00:00.000Z'),
          lte: new Date('2026-08-21T00:00:00.000Z'),
        },
      },
      orderBy: { date: 'asc' },
    });
    expect(result.data).toEqual([
      {
        date: '2026-08-20T00:00:00.000Z',
        totalVolume: '1000000',
        totalFees: '10000',
        transactionCount: '2',
        newInvoices: 3,
        newMerchants: 1,
        newSubscriptions: 0,
        newTickets: 4,
      },
    ]);
  });

  test('returns an empty array for a range with no activity', async () => {
    prismaMock.platformDailyStats.findMany.mockResolvedValue([]);

    const result = await getAnalyticsTimeseries({ from: '2020-01-01', to: '2020-01-31' });

    expect(result.data).toEqual([]);
  });

  test('rejects an unparseable date', async () => {
    await expect(getAnalyticsTimeseries({ from: 'not-a-date' })).rejects.toBeInstanceOf(AppError);
  });

  test('rejects an inverted range', async () => {
    await expect(
      getAnalyticsTimeseries({ from: '2026-08-21', to: '2026-08-19' }),
    ).rejects.toThrow('from must not be after to');
  });

  test('defaults to a 30-day window ending today', async () => {
    prismaMock.platformDailyStats.findMany.mockResolvedValue([]);

    const result = await getAnalyticsTimeseries({ to: '2026-08-21T12:00:00.000Z' });

    expect(result.from).toBe('2026-07-23T00:00:00.000Z');
    expect(result.to).toBe('2026-08-21T00:00:00.000Z');
  });
});

describe('getTopTokensByVolume', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    prismaMock.tokenAnalytics.findMany.mockResolvedValue([]);
  });

  test('orders by volume descending with a default limit', async () => {
    await getTopTokensByVolume({});

    expect(prismaMock.tokenAnalytics.findMany).toHaveBeenCalledWith({
      orderBy: { totalVolume: 'desc' },
      take: 10,
    });
  });

  test('honours an explicit limit', async () => {
    await getTopTokensByVolume({ limit: '3' });

    expect(prismaMock.tokenAnalytics.findMany).toHaveBeenCalledWith({
      orderBy: { totalVolume: 'desc' },
      take: 3,
    });
  });

  test('rejects a limit outside the allowed range', async () => {
    await expect(getTopTokensByVolume({ limit: '0' })).rejects.toBeInstanceOf(AppError);
    await expect(getTopTokensByVolume({ limit: '500' })).rejects.toBeInstanceOf(AppError);
  });

  test('serializes BigInt counters to strings', async () => {
    prismaMock.tokenAnalytics.findMany.mockResolvedValue([
      {
        id: 'token-analytics-uuid',
        token: TOKEN,
        totalVolume: 9_000_000n,
        totalFees: 90_000n,
        transactionCount: 12n,
        uniqueMerchants: 2,
        lastUpdated: new Date('2026-08-21T10:00:00.000Z'),
      },
    ]);

    const result = await getTopTokensByVolume({});

    expect(result.data[0]).toMatchObject({
      token: TOKEN,
      totalVolume: '9000000',
      totalFees: '90000',
      transactionCount: '12',
      uniqueMerchants: 2,
    });
  });
});
