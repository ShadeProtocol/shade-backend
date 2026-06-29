import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import request from 'supertest';
import {
  TEST_API_KEY_PREFIX,
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
const { default: app } = await import('../../src/app.js');

const merchant = {
  id: 'merchant-1',
  merchantId: 1,
  address: '0x123',
  account: null,
  email: 'merchant@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  businessName: 'Engines',
  category: 'software',
  description: 'desc',
  logo: null,
  webhook: null,
  active: true,
  verified: false,
  emailVerified: true,
  registered: true,
  emailOtp: null,
  emailOtpExpiresAt: null,
  createdAt: new Date('2026-06-27T12:00:00.000Z'),
  updatedAt: new Date('2026-06-27T12:00:00.000Z'),
};

const baseApiKey = {
  id: 'key-1',
  merchantId: merchant.id,
  keyHash: TEST_KEY_HASH,
  prefix: TEST_KEY_PREFIX_DISPLAY,
  name: 'Production',
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date('2026-06-27T12:00:00.000Z'),
};

const authenticateWithSession = () => {
  prismaMock.refreshToken.findUnique.mockResolvedValue({
    id: 'session-1',
    merchantId: merchant.id,
    token: 'valid-token',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date(),
    merchant,
  } as any);
};

describe('Merchant API key routes', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock),
    );
  });

  describe('POST /api/v1/merchants/api-keys', () => {
    test('returns 401 when unauthenticated', async () => {
      const response = await request(app)
        .post('/api/v1/merchants/api-keys')
        .send({ label: 'Production' });

      expect(response.status).toBe(401);
    });

    test('returns 201 with raw key only on creation', async () => {
      authenticateWithSession();
      prismaMock.apiKey.count.mockResolvedValue(0);
      prismaMock.apiKey.create.mockResolvedValue(baseApiKey as any);

      const response = await request(app)
        .post('/api/v1/merchants/api-keys')
        .set('Authorization', 'Bearer valid-token')
        .send({ label: 'Production' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: 'key-1',
        key: TEST_RAW_API_KEY,
        prefix: TEST_KEY_PREFIX_DISPLAY,
        label: 'Production',
        lastUsedAt: null,
        createdAt: baseApiKey.createdAt.toISOString(),
      });
    });

    test('returns 400 when label is not a string', async () => {
      authenticateWithSession();

      const response = await request(app)
        .post('/api/v1/merchants/api-keys')
        .set('Authorization', 'Bearer valid-token')
        .send({ label: 123 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'label must be a string' });
      expect(prismaMock.apiKey.create).not.toHaveBeenCalled();
    });

    test('returns 401 when authenticated with an API key', async () => {
      prismaMock.apiKey.findUnique.mockResolvedValue({
        ...baseApiKey,
        merchant,
      } as any);

      const response = await request(app)
        .post('/api/v1/merchants/api-keys')
        .set('Authorization', `Bearer ${TEST_RAW_API_KEY}`)
        .send({ label: 'Secondary' });

      expect(response.status).toBe(401);
      expect(prismaMock.apiKey.create).not.toHaveBeenCalled();
    });

    test('returns 400 when active key limit is exceeded', async () => {
      authenticateWithSession();
      prismaMock.apiKey.count.mockResolvedValue(10);

      const response = await request(app)
        .post('/api/v1/merchants/api-keys')
        .set('Authorization', 'Bearer valid-token')
        .send({ label: 'Another key' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Maximum of 10 active API keys allowed' });
    });
  });

  describe('GET /api/v1/merchants/api-keys', () => {
    test('returns non-revoked keys without raw key or hash', async () => {
      authenticateWithSession();
      prismaMock.apiKey.findMany.mockResolvedValue([baseApiKey] as any);

      const response = await request(app)
        .get('/api/v1/merchants/api-keys')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        {
          id: 'key-1',
          prefix: TEST_KEY_PREFIX_DISPLAY,
          label: 'Production',
          lastUsedAt: null,
          createdAt: baseApiKey.createdAt.toISOString(),
        },
      ]);
      expect(JSON.stringify(response.body)).not.toContain('keyHash');
      expect(JSON.stringify(response.body)).not.toContain(TEST_RAW_API_KEY);
    });
  });

  describe('DELETE /api/v1/merchants/api-keys/:id', () => {
    test('revokes an owned key', async () => {
      authenticateWithSession();
      prismaMock.apiKey.findFirst.mockResolvedValue(baseApiKey as any);
      prismaMock.apiKey.update.mockResolvedValue({ ...baseApiKey, revokedAt: new Date() } as any);

      const response = await request(app)
        .delete('/api/v1/merchants/api-keys/key-1')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'API key revoked' });
    });

    test('returns 404 when key belongs to another merchant', async () => {
      authenticateWithSession();
      prismaMock.apiKey.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .delete('/api/v1/merchants/api-keys/key-2')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'API key not found' });
    });
  });
});

describe('API key authentication middleware', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  test('allows invoice access with a valid API key and updates lastUsedAt', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      ...baseApiKey,
      merchant,
    } as any);
    prismaMock.apiKey.update.mockResolvedValue(baseApiKey as any);
    prismaMock.invoice.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get('/api/v1/invoices')
      .set('Authorization', `Bearer ${TEST_RAW_API_KEY}`);

    expect(response.status).toBe(200);
    expect(prismaMock.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { lastUsedAt: expect.any(Date) },
    });
    expect(prismaMock.refreshToken.findUnique).not.toHaveBeenCalled();
  });

  test('returns 401 for revoked API keys', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      ...baseApiKey,
      revokedAt: new Date(),
      merchant,
    } as any);

    const response = await request(app)
      .get('/api/v1/invoices')
      .set('Authorization', `Bearer ${TEST_RAW_API_KEY}`);

    expect(response.status).toBe(401);
  });
});
