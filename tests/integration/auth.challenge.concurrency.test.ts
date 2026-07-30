import crypto from 'node:crypto';
import { jest, beforeEach } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

type StoredNonce = {
  id: string;
  address: string;
  nonce: string;
  message: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
  merchantId: string | null;
};

const mockDate = new Date('2026-06-21T12:00:00Z');
const address = 'GABCDEF1234567890123456789012345678901234567890123456789012';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { createNonce } = await import('../../src/services/auth.services.js');

function createAddressLock() {
  const tails = new Map<string, Promise<void>>();

  return async function withAddressLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => {
      release = resolve;
    });
    tails.set(
      key,
      previous.then(() => current),
    );

    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

describe('createNonce concurrency (database-backed simulation)', () => {
  let store: StoredNonce[];
  let withAddressLock: ReturnType<typeof createAddressLock>;

  beforeEach(() => {
    mockReset(prismaMock);
    jest.useFakeTimers({ now: mockDate });
    store = [];
    withAddressLock = createAddressLock();

    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) =>
      withAddressLock(address, () => callback(prismaMock)),
    );

    prismaMock.$executeRaw.mockResolvedValue(1);

    prismaMock.authNonce.deleteMany.mockImplementation(async () => {
      const now = mockDate;
      const before = store.length;
      store = store.filter(record => {
        const isExpired = record.expiresAt < now;
        const isActiveUnusedForAddress = record.address === address && record.usedAt === null;
        return !(isExpired || isActiveUnusedForAddress);
      });
      return { count: before - store.length };
    });

    prismaMock.authNonce.create.mockImplementation(async ({ data }: { data: StoredNonce }) => {
      const conflict = store.some(
        record => record.address === data.address && record.usedAt === null && record.expiresAt >= mockDate,
      );
      if (conflict) {
        throw { code: 'P2002', meta: { target: ['address'] } };
      }

      const record: StoredNonce = {
        id: crypto.randomUUID(),
        merchantId: null,
        usedAt: null,
        createdAt: mockDate,
        ...data,
      };
      store.push(record);
      return record;
    });

    prismaMock.authNonce.findFirst.mockImplementation(
      async ({
        where,
      }: {
        where: { address: string; usedAt: null; expiresAt: { gt: Date } };
      }) => {
        return (
          store.find(
            record =>
              record.address === where.address &&
              record.usedAt === null &&
              record.expiresAt > where.expiresAt.gt,
          ) ?? null
        );
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('parallel same-address requests all resolve with a defined challenge response', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => createNonce(address)));

    expect(results).toHaveLength(5);
    for (const result of results) {
      expect(result).toMatchObject({
        message: expect.stringContaining('Shade Authentication'),
        nonce: expect.stringMatching(/^[0-9a-f]{64}$/),
        expiresAt: expect.any(Date),
      });
    }

    const activeNonces = store.filter(
      record => record.address === address && record.usedAt === null && record.expiresAt >= mockDate,
    );
    expect(activeNonces).toHaveLength(1);
  });
});
