import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import request from 'supertest';
import { TEST_RAW_API_KEY } from '../helpers/api-key.fixtures.js';

jest.unstable_mockModule('../../src/utils/api-key.utils.js', () => {
  const prefix = 'sk_' + 'live_';
  return {
    __esModule: true,
    API_KEY_PREFIX: prefix,
    API_KEY_RANDOM_LENGTH: 32,
    API_KEY_DISPLAY_PREFIX_LENGTH: 8,
    MAX_ACTIVE_API_KEYS: 10,
    isApiKeyToken: (token: string) => token.startsWith(prefix),
    hashApiKey: (value: string) => `hash-${value}`,
    generateApiKeyMaterial: () => ({ rawKey: 'x', prefix: 'x', keyHash: 'x' }),
  };
});

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { default: app } = await import('../../src/app.js');

const HEX32 = /^[0-9a-f]{64}$/;

const merchant = {
  id: 'merchant-1',
  merchantId: 1,
  address: '0x123',
  account: null,
  merchantKey: null,
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

describe('POST /api/v1/merchants/signing-key', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns 401 when unauthenticated', async () => {
    const response = await request(app).post('/api/v1/merchants/signing-key');

    expect(response.status).toBe(401);
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
  });

  test('returns 401 when authenticated with an API key (session-only)', async () => {
    const response = await request(app)
      .post('/api/v1/merchants/signing-key')
      .set('Authorization', `Bearer ${TEST_RAW_API_KEY}`);

    expect(response.status).toBe(401);
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
  });

  test('returns 201 with hex public + private, persisting only the public key', async () => {
    authenticateWithSession();
    prismaMock.merchant.findUnique.mockResolvedValue({ ...merchant });
    prismaMock.merchant.update.mockResolvedValue({ ...merchant });

    const response = await request(app)
      .post('/api/v1/merchants/signing-key')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(201);
    expect(response.body.publicKey).toMatch(HEX32);
    expect(response.body.privateKey).toMatch(HEX32);

    const updateArgs = prismaMock.merchant.update.mock.calls[0][0];
    expect(updateArgs.data).toEqual({ merchantKey: response.body.publicKey });
    expect(JSON.stringify(updateArgs)).not.toContain(response.body.privateKey);
  });
});

describe('GET /api/v1/merchants/me merchantKey exposure', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  test('returns the public merchantKey and never a private key', async () => {
    authenticateWithSession();
    const publicKey = 'a'.repeat(64);
    prismaMock.merchant.findUnique.mockResolvedValue({ ...merchant, merchantKey: publicKey });

    const response = await request(app)
      .get('/api/v1/merchants/me')
      .set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body.merchantKey).toBe(publicKey);
    expect(response.body).not.toHaveProperty('privateKey');
  });
});
