import { jest, beforeEach } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { recordAuditLog, listAuditLogs, ActorType } = await import(
  '../../src/services/audit-log.services.js'
);

const mockDate = new Date('2026-06-21T12:00:00Z');

describe('Audit Log Services', () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    mockReset(prismaMock);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('recordAuditLog', () => {
    test('writes the expected row shape', async () => {
      prismaMock.adminLog.create.mockResolvedValue({
        id: 'log-1',
        action: 'invoice.voided',
        actorType: ActorType.MERCHANT,
        actorId: 'merchant-1',
        actorLabel: 'Acme',
        targetType: 'Invoice',
        targetId: 'invoice-1',
        metadata: { reason: 'duplicate' },
        createdAt: mockDate,
      });

      await recordAuditLog({
        action: 'invoice.voided',
        actorType: ActorType.MERCHANT,
        actorId: 'merchant-1',
        actorLabel: 'Acme',
        targetType: 'Invoice',
        targetId: 'invoice-1',
        metadata: { reason: 'duplicate' },
      });

      expect(prismaMock.adminLog.create).toHaveBeenCalledWith({
        data: {
          action: 'invoice.voided',
          actorType: ActorType.MERCHANT,
          actorId: 'merchant-1',
          actorLabel: 'Acme',
          targetType: 'Invoice',
          targetId: 'invoice-1',
          metadata: { reason: 'duplicate' },
        },
      });
    });

    test('defaults optional fields to null/undefined rather than omitting them incorrectly', async () => {
      prismaMock.adminLog.create.mockResolvedValue({} as any);

      await recordAuditLog({
        action: 'admin.login_failed',
        actorType: ActorType.ANONYMOUS,
        actorLabel: 'GADDRESS',
      });

      expect(prismaMock.adminLog.create).toHaveBeenCalledWith({
        data: {
          action: 'admin.login_failed',
          actorType: ActorType.ANONYMOUS,
          actorId: null,
          actorLabel: 'GADDRESS',
          targetType: null,
          targetId: null,
          metadata: undefined,
        },
      });
    });

    test('swallows a DB failure, logs it, and never throws', async () => {
      prismaMock.adminLog.create.mockRejectedValue(new Error('connection reset'));

      await expect(
        recordAuditLog({
          action: 'invoice.voided',
          actorType: ActorType.MERCHANT,
          actorId: 'merchant-1',
          actorLabel: 'Acme',
        }),
      ).resolves.toBeUndefined();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to record audit log',
        expect.objectContaining({ action: 'invoice.voided', actorType: ActorType.MERCHANT }),
      );
    });
  });

  describe('listAuditLogs', () => {
    const logRow = {
      id: 'log-1',
      action: 'invoice.voided',
      actorType: ActorType.MERCHANT,
      actorId: 'merchant-1',
      actorLabel: 'Acme',
      targetType: 'Invoice',
      targetId: 'invoice-1',
      metadata: null,
      createdAt: mockDate,
    };

    test('applies filters, paginates, and orders newest-first', async () => {
      prismaMock.adminLog.findMany.mockResolvedValue([logRow]);
      prismaMock.adminLog.count.mockResolvedValue(1);

      const from = new Date('2026-06-01T00:00:00.000Z');
      const to = new Date('2026-06-30T00:00:00.000Z');

      const result = await listAuditLogs(
        {
          action: 'invoice.voided',
          actorType: ActorType.MERCHANT,
          actorId: 'merchant-1',
          targetType: 'Invoice',
          targetId: 'invoice-1',
          from,
          to,
        },
        { limit: 10, offset: 5 },
      );

      expect(prismaMock.adminLog.findMany).toHaveBeenCalledWith({
        where: {
          action: 'invoice.voided',
          actorType: ActorType.MERCHANT,
          actorId: 'merchant-1',
          targetType: 'Invoice',
          targetId: 'invoice-1',
          createdAt: { gte: from, lte: to },
        },
        take: 10,
        skip: 5,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      expect(result).toEqual({
        data: [logRow],
        pagination: { limit: 10, offset: 5, total: 1 },
      });
    });

    test('returns an unfiltered page when no filters are given', async () => {
      prismaMock.adminLog.findMany.mockResolvedValue([]);
      prismaMock.adminLog.count.mockResolvedValue(0);

      await listAuditLogs({}, { limit: 20, offset: 0 });

      expect(prismaMock.adminLog.findMany).toHaveBeenCalledWith({
        where: {},
        take: 20,
        skip: 0,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    });

    test('orders by id as a tiebreaker so equal-createdAt rows paginate deterministically', async () => {
      // Three rows share the same createdAt millisecond. The id tiebreaker is
      // what keeps adjacent pages from skipping or repeating a row.
      const sameInstant = mockDate;
      const rowA = { ...logRow, id: 'log-a', createdAt: sameInstant };
      const rowB = { ...logRow, id: 'log-b', createdAt: sameInstant };
      const rowC = { ...logRow, id: 'log-c', createdAt: sameInstant };

      prismaMock.adminLog.findMany.mockResolvedValueOnce([rowC, rowB]);
      prismaMock.adminLog.count.mockResolvedValue(3);
      const firstPage = await listAuditLogs({}, { limit: 2, offset: 0 });

      prismaMock.adminLog.findMany.mockResolvedValueOnce([rowA]);
      const secondPage = await listAuditLogs({}, { limit: 2, offset: 2 });

      expect(firstPage.data.map(row => row.id)).toEqual(['log-c', 'log-b']);
      expect(secondPage.data.map(row => row.id)).toEqual(['log-a']);
      // Same DB call shape both times — the id tiebreaker, not offset alone,
      // is what the database uses to keep the two pages disjoint.
      expect(prismaMock.adminLog.findMany).toHaveBeenNthCalledWith(1, {
        where: {},
        take: 2,
        skip: 0,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      expect(prismaMock.adminLog.findMany).toHaveBeenNthCalledWith(2, {
        where: {},
        take: 2,
        skip: 2,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    });
  });
});
