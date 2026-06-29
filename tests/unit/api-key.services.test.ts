import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import {
  TEST_KEY_HASH,
  TEST_KEY_PREFIX_DISPLAY,
  TEST_RAW_API_KEY,
} from '../helpers/api-key.fixtures.js';

jest.unstable_mockModule('../../src/utils/api-key.utils.js', () => {
  const prefix = 'sk_' + 'live_';
  const rawKey = `${prefix}testkey1234567890123456789012345`;
  return {
    __esModule: true,
    API_KEY_PREFIX: prefix,
    API_KEY_RANDOM_LENGTH: 32,
    API_KEY_DISPLAY_PREFIX_LENGTH: 8,
    MAX_ACTIVE_API_KEYS: 10,
    isApiKeyToken: (token: string) => token.startsWith(prefix),
    hashApiKey: (rawKeyValue: string) => `hash-${rawKeyValue}`,
    generateApiKeyMaterial: () => ({
      rawKey,
      prefix: `${prefix}testkey1`,
      keyHash: `hash-${rawKey}`,
    }),
  };
});

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { createApiKey, listApiKeys, revokeApiKey, authenticateApiKey } = await import(
  '../../src/services/api-key.services.js'
);

const merchantId = 'merchant-1';
const baseApiKeyRecord = {
  id: 'key-1',
  merchantId,
  keyHash: TEST_KEY_HASH,
  prefix: TEST_KEY_PREFIX_DISPLAY,
  name: 'Production',
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date('2026-06-27T12:00:00.000Z'),
};

describe('api-key.services', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock),
    );
  });

  test('createApiKey stores hash and returns raw key once', async () => {
    prismaMock.apiKey.count.mockResolvedValue(0);
    prismaMock.apiKey.create.mockResolvedValue(baseApiKeyRecord as any);

    const result = await createApiKey(merchantId, 'Production');

    expect(prismaMock.apiKey.create).toHaveBeenCalledWith({
      data: {
        merchantId,
        keyHash: TEST_KEY_HASH,
        prefix: TEST_KEY_PREFIX_DISPLAY,
        name: 'Production',
      },
    });
    expect(result).toMatchObject({
      id: 'key-1',
      key: TEST_RAW_API_KEY,
      prefix: TEST_KEY_PREFIX_DISPLAY,
      label: 'Production',
    });
  });

  test('createApiKey rejects when active key limit is reached', async () => {
    prismaMock.apiKey.count.mockResolvedValue(10);

    await expect(createApiKey(merchantId)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Maximum of 10 active API keys allowed',
    });
    expect(prismaMock.apiKey.create).not.toHaveBeenCalled();
  });

  test('listApiKeys returns non-revoked keys without hashes', async () => {
    prismaMock.apiKey.findMany.mockResolvedValue([baseApiKeyRecord] as any);

    const result = await listApiKeys(merchantId);

    expect(prismaMock.apiKey.findMany).toHaveBeenCalledWith({
      where: { merchantId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        prefix: true,
        name: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
    expect(result).toEqual([
      {
        id: 'key-1',
        prefix: TEST_KEY_PREFIX_DISPLAY,
        label: 'Production',
        lastUsedAt: null,
        createdAt: baseApiKeyRecord.createdAt,
      },
    ]);
    expect(result[0]).not.toHaveProperty('keyHash');
    expect(result[0]).not.toHaveProperty('key');
  });

  test('revokeApiKey marks key as revoked for owning merchant', async () => {
    prismaMock.apiKey.findFirst.mockResolvedValue(baseApiKeyRecord as any);
    prismaMock.apiKey.update.mockResolvedValue({
      ...baseApiKeyRecord,
      revokedAt: new Date(),
    } as any);

    await revokeApiKey(merchantId, 'key-1');

    expect(prismaMock.apiKey.findFirst).toHaveBeenCalledWith({
      where: { id: 'key-1', merchantId },
    });
    expect(prismaMock.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { revokedAt: expect.any(Date) },
    });
  });

  test('revokeApiKey returns 404 for another merchant key', async () => {
    prismaMock.apiKey.findFirst.mockResolvedValue(null);

    await expect(revokeApiKey('merchant-2', 'key-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  test('authenticateApiKey updates lastUsedAt and returns merchant', async () => {
    const merchant = { id: merchantId, merchantId: 1, address: '0x123' };
    prismaMock.apiKey.findUnique.mockResolvedValue({
      ...baseApiKeyRecord,
      merchant,
    } as any);
    prismaMock.apiKey.update.mockResolvedValue(baseApiKeyRecord as any);

    const result = await authenticateApiKey(TEST_RAW_API_KEY);

    expect(prismaMock.apiKey.findUnique).toHaveBeenCalledWith({
      where: { keyHash: TEST_KEY_HASH },
      include: { merchant: true },
    });
    expect(result).toEqual(merchant);
    expect(prismaMock.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  test('authenticateApiKey returns null for revoked keys', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      ...baseApiKeyRecord,
      revokedAt: new Date(),
      merchant: { id: merchantId },
    } as any);

    const result = await authenticateApiKey(TEST_RAW_API_KEY);

    expect(result).toBeNull();
    expect(prismaMock.apiKey.update).not.toHaveBeenCalled();
  });

  test('authenticateApiKey returns null for expired keys', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      ...baseApiKeyRecord,
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      merchant: { id: merchantId },
    } as any);

    const result = await authenticateApiKey(TEST_RAW_API_KEY);

    expect(result).toBeNull();
    expect(prismaMock.apiKey.update).not.toHaveBeenCalled();
  });

  test('revokeApiKey rejects already revoked keys', async () => {
    prismaMock.apiKey.findFirst.mockResolvedValue({
      ...baseApiKeyRecord,
      revokedAt: new Date(),
    } as any);

    await expect(revokeApiKey(merchantId, 'key-1')).rejects.toMatchObject({
      statusCode: 400,
      message: 'API key already revoked',
    });
    expect(prismaMock.apiKey.update).not.toHaveBeenCalled();
  });

  test('countActiveApiKeys excludes expired but non-revoked keys from limit', async () => {
    prismaMock.apiKey.count.mockResolvedValue(9);
    prismaMock.apiKey.create.mockResolvedValue(baseApiKeyRecord as any);

    await createApiKey(merchantId, 'Tenth key');

    expect(prismaMock.apiKey.count).toHaveBeenCalledWith({
      where: {
        merchantId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
    });
    expect(prismaMock.apiKey.create).toHaveBeenCalled();
  });
});
