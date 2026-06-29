import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import {
  TEST_INTEGRATION_PREFIX,
  TEST_INTEGRATION_RAW_API_KEY,
  TEST_UNKNOWN_RAW_API_KEY,
  testApiKeyRegex,
} from '../helpers/api-key.fixtures.js';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { default: app } = await import('../../src/app.js');
const { environment } = await import('../../src/config/environment.js');
const { hashApiKey } = await import('../../src/utils/api-key.utils.js');

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

const rawApiKey = TEST_INTEGRATION_RAW_API_KEY;
const apiKeyRecord = {
  id: 'key-1',
  merchantId: merchant.id,
  keyHash: hashApiKey(rawApiKey),
  prefix: TEST_INTEGRATION_PREFIX,
  name: 'Integration',
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date('2026-06-27T12:00:00.000Z'),
};

describe('authenticateMerchant auth paths', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  test('accepts valid refresh session tokens', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'session-1',
      merchantId: merchant.id,
      token: 'valid-session-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      merchant,
    } as any);
    prismaMock.apiKey.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get('/api/v1/merchants/api-keys')
      .set('Authorization', 'Bearer valid-session-token');

    expect(response.status).toBe(200);
    expect(prismaMock.refreshToken.findUnique).toHaveBeenCalled();
    expect(prismaMock.apiKey.findUnique).not.toHaveBeenCalled();
  });

  test('accepts valid JWT access tokens', async () => {
    const accessToken = jwt.sign(
      { sub: merchant.id, address: merchant.address },
      environment.jwtSecret,
      {
        expiresIn: '15m',
      },
    );
    prismaMock.merchant.findUnique.mockResolvedValue(merchant as any);
    prismaMock.apiKey.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get('/api/v1/merchants/api-keys')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(prismaMock.merchant.findUnique).toHaveBeenCalledWith({ where: { id: merchant.id } });
    expect(prismaMock.refreshToken.findUnique).not.toHaveBeenCalled();
  });

  test('accepts valid API keys and updates lastUsedAt', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      ...apiKeyRecord,
      merchant,
    } as any);
    prismaMock.apiKey.update.mockResolvedValue(apiKeyRecord as any);
    prismaMock.apiKey.findMany.mockResolvedValue([apiKeyRecord] as any);

    const response = await request(app)
      .get('/api/v1/merchants/api-keys')
      .set('Authorization', `Bearer ${rawApiKey}`);

    expect(response.status).toBe(200);
    expect(prismaMock.apiKey.update).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  test('returns 401 for unknown API keys', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .get('/api/v1/merchants/api-keys')
      .set('Authorization', `Bearer ${TEST_UNKNOWN_RAW_API_KEY}`);

    expect(response.status).toBe(401);
  });

  test('returns 401 for expired API keys', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      ...apiKeyRecord,
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      merchant,
    } as any);

    const response = await request(app)
      .get('/api/v1/merchants/api-keys')
      .set('Authorization', `Bearer ${rawApiKey}`);

    expect(response.status).toBe(401);
    expect(prismaMock.apiKey.update).not.toHaveBeenCalled();
  });

  test('returns 401 when Authorization header is missing', async () => {
    const response = await request(app).get('/api/v1/merchants/api-keys');

    expect(response.status).toBe(401);
  });

  test('returns 401 when bearer token is empty', async () => {
    const response = await request(app)
      .get('/api/v1/merchants/api-keys')
      .set('Authorization', 'Bearer ');

    expect(response.status).toBe(401);
  });
});

describe('API key management security', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  test('POST stores only hash in database, never raw key', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'session-1',
      merchantId: merchant.id,
      token: 'valid-session-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      merchant,
    } as any);
    prismaMock.apiKey.count.mockResolvedValue(0);
    prismaMock.apiKey.create.mockImplementation(async (args: any) => ({
      id: 'key-new',
      merchantId: merchant.id,
      keyHash: args.data.keyHash,
      prefix: args.data.prefix,
      name: args.data.name,
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date('2026-06-27T13:00:00.000Z'),
    }));

    const response = await request(app)
      .post('/api/v1/merchants/api-keys')
      .set('Authorization', 'Bearer valid-session-token')
      .send({ label: 'Server' });

    expect(response.status).toBe(201);
    expect(response.body.key).toMatch(testApiKeyRegex);

    const createArgs = prismaMock.apiKey.create.mock.calls[0][0];
    expect(createArgs.data.keyHash).toBe(hashApiKey(response.body.key));
    expect(createArgs.data.keyHash).toHaveLength(64);
    expect(createArgs.data).not.toHaveProperty('key');
    expect(JSON.stringify(createArgs.data)).not.toContain(response.body.key);
  });

  test('GET scopes keys to authenticated merchant', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'session-1',
      merchantId: merchant.id,
      token: 'valid-session-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      merchant,
    } as any);
    prismaMock.apiKey.findMany.mockResolvedValue([]);

    await request(app)
      .get('/api/v1/merchants/api-keys')
      .set('Authorization', 'Bearer valid-session-token');

    expect(prismaMock.apiKey.findMany).toHaveBeenCalledWith({
      where: { merchantId: merchant.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });

  test('DELETE returns 400 when key is already revoked', async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      id: 'session-1',
      merchantId: merchant.id,
      token: 'valid-session-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      createdAt: new Date(),
      merchant,
    } as any);
    prismaMock.apiKey.findFirst.mockResolvedValue({
      ...apiKeyRecord,
      revokedAt: new Date('2026-06-27T11:00:00.000Z'),
    } as any);

    const response = await request(app)
      .delete('/api/v1/merchants/api-keys/key-1')
      .set('Authorization', 'Bearer valid-session-token');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'API key already revoked' });
    expect(prismaMock.apiKey.update).not.toHaveBeenCalled();
  });

  test('revoked key cannot authenticate subsequent requests', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      ...apiKeyRecord,
      revokedAt: new Date('2026-06-27T14:00:00.000Z'),
      merchant,
    } as any);

    const response = await request(app)
      .get('/api/v1/invoices')
      .set('Authorization', `Bearer ${rawApiKey}`);

    expect(response.status).toBe(401);
  });

  test('API key can create additional API keys when under limit', async () => {
    prismaMock.apiKey.findUnique.mockResolvedValue({
      ...apiKeyRecord,
      merchant,
    } as any);
    prismaMock.apiKey.update.mockResolvedValue(apiKeyRecord as any);
    prismaMock.apiKey.count.mockResolvedValue(1);
    prismaMock.apiKey.create.mockImplementation(async (args: any) => ({
      id: 'key-2',
      merchantId: merchant.id,
      keyHash: args.data.keyHash,
      prefix: args.data.prefix,
      name: args.data.name,
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date('2026-06-27T14:00:00.000Z'),
    }));

    const response = await request(app)
      .post('/api/v1/merchants/api-keys')
      .set('Authorization', `Bearer ${rawApiKey}`)
      .send({ label: 'Secondary' });

    expect(response.status).toBe(201);
    expect(response.body.label).toBe('Secondary');
    expect(prismaMock.refreshToken.findUnique).not.toHaveBeenCalled();
  });
});
