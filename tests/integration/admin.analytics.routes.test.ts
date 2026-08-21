import { beforeEach } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { environment } = await import('../../src/config/environment.js');
const { default: app } = await import('../../src/app.js');

const admin = {
  id: 'admin-uuid',
  address: 'GADMIN',
  active: true,
  isSuperAdmin: false,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

const adminToken = () =>
  jwt.sign({ sub: admin.id, address: admin.address, type: 'admin' }, environment.jwtSecret, {
    expiresIn: '15m',
  });

const ENDPOINTS = [
  '/api/v1/admin/analytics/summary',
  '/api/v1/admin/analytics/timeseries',
  '/api/v1/admin/analytics/tokens',
];

const stubSummaryQueries = () => {
  prismaMock.tokenAnalytics.aggregate.mockResolvedValue({
    _sum: { totalVolume: 5_000_000n, totalFees: 50_000n, transactionCount: 7n },
    _count: { _all: 2 },
  });
  prismaMock.$queryRaw.mockResolvedValue([{ count: 1 }]);
  prismaMock.invoice.aggregate.mockResolvedValue({ _sum: { amountRefunded: 0n } });
  prismaMock.merchant.count.mockResolvedValue(4);
  prismaMock.invoice.groupBy.mockResolvedValue([{ status: 'PAID', _count: { _all: 6 } }]);
  prismaMock.subscription.groupBy.mockResolvedValue([{ status: 'ACTIVE', _count: { _all: 3 } }]);
};

describe('Admin analytics routes', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    prismaMock.admin.findUnique.mockResolvedValue(admin);
  });

  describe('authentication', () => {
    test.each(ENDPOINTS)('%s rejects an unauthenticated request', async endpoint => {
      const response = await request(app).get(endpoint);

      expect(response.status).toBe(401);
    });

    test.each(ENDPOINTS)('%s rejects a merchant JWT', async endpoint => {
      const merchantToken = jwt.sign({ sub: 'merchant-uuid' }, environment.jwtSecret, {
        expiresIn: '15m',
      });

      const response = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${merchantToken}`);

      expect(response.status).toBe(401);
    });

    test.each(ENDPOINTS)('%s serves a non-superadmin admin', async endpoint => {
      stubSummaryQueries();
      prismaMock.platformDailyStats.findMany.mockResolvedValue([]);
      prismaMock.tokenAnalytics.findMany.mockResolvedValue([]);

      const response = await request(app)
        .get(endpoint)
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(response.status).toBe(200);
    });
  });

  describe('GET /admin/analytics/summary', () => {
    test('returns protocol totals and live counts', async () => {
      stubSummaryQueries();

      const response = await request(app)
        .get('/api/v1/admin/analytics/summary')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.totals).toEqual({
        totalVolume: '5000000',
        totalFees: '50000',
        transactionCount: '7',
        totalRefunded: '0',
        tokens: 2,
        merchantsWithVolume: 1,
      });
      expect(response.body.invoices).toEqual({ total: 6, byStatus: { PAID: 6 } });
      expect(response.body.subscriptions).toEqual({ total: 3, byStatus: { ACTIVE: 3 } });
    });
  });

  describe('GET /admin/analytics/timeseries', () => {
    test('returns the daily rows for the requested range', async () => {
      prismaMock.platformDailyStats.findMany.mockResolvedValue([
        {
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
        },
      ]);

      const response = await request(app)
        .get('/api/v1/admin/analytics/timeseries?from=2026-08-19&to=2026-08-21')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([
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

    test('returns an empty array, not an error, for a range with no activity', async () => {
      prismaMock.platformDailyStats.findMany.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/v1/admin/analytics/timeseries?from=2020-01-01&to=2020-01-31')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });

    test('rejects an inverted range', async () => {
      const response = await request(app)
        .get('/api/v1/admin/analytics/timeseries?from=2026-08-21&to=2026-08-19')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(response.status).toBe(400);
      expect(prismaMock.platformDailyStats.findMany).not.toHaveBeenCalled();
    });
  });

  describe('GET /admin/analytics/tokens', () => {
    test('returns tokens ordered by volume descending', async () => {
      prismaMock.tokenAnalytics.findMany.mockResolvedValue([
        {
          id: 'token-1',
          token: 'CUSDC',
          totalVolume: 9_000_000n,
          totalFees: 90_000n,
          transactionCount: 12n,
          uniqueMerchants: 3,
          lastUpdated: new Date('2026-08-21T10:00:00.000Z'),
        },
        {
          id: 'token-2',
          token: 'CXLM',
          totalVolume: 1_000_000n,
          totalFees: 10_000n,
          transactionCount: 2n,
          uniqueMerchants: 1,
          lastUpdated: new Date('2026-08-21T10:00:00.000Z'),
        },
      ]);

      const response = await request(app)
        .get('/api/v1/admin/analytics/tokens')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(response.status).toBe(200);
      expect(prismaMock.tokenAnalytics.findMany).toHaveBeenCalledWith({
        orderBy: { totalVolume: 'desc' },
        take: 10,
      });
      expect(response.body.data.map((token: { token: string }) => token.token)).toEqual([
        'CUSDC',
        'CXLM',
      ]);
      expect(response.body.data[0].totalVolume).toBe('9000000');
    });

    test('rejects an out-of-range limit', async () => {
      const response = await request(app)
        .get('/api/v1/admin/analytics/tokens?limit=500')
        .set('Authorization', `Bearer ${adminToken()}`);

      expect(response.status).toBe(400);
      expect(prismaMock.tokenAnalytics.findMany).not.toHaveBeenCalled();
    });
  });
});
