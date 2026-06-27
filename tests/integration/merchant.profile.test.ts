import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import request from 'supertest';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { default: app } = await import('../../src/app.js');

const ME_URL = '/api/v1/merchants/me';

const baseMerchant = {
  id: 'uuid-1',
  merchantId: 1,
  address: '0x123',
  account: 'CCONTRACT',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  businessName: 'Analytical Engines',
  category: 'software',
  description: 'We build computing machines.',
  logo: null,
  webhook: null,
  active: true,
  verified: false,
  emailVerified: false,
  registered: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  // Internal relations that the sanitizer allow-list must strip from responses.
  refreshTokens: [{ id: 'rt-1', token: 'secret-token' }],
  apiKeys: [{ id: 'ak-1', keyHash: 'hashed-secret' }],
};

const authenticateAs = (merchant: Record<string, unknown>) => {
  prismaMock.refreshToken.findUnique.mockResolvedValue({
    id: 'session-1',
    merchantId: merchant.id,
    token: 'valid-token',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date(),
    merchant,
  } as any);
};

describe('GET /api/v1/merchants/me', () => {
  beforeEach(() => mockReset(prismaMock));

  test('returns 401 when unauthenticated', async () => {
    const response = await request(app).get(ME_URL);
    expect(response.status).toBe(401);
  });

  test('returns 200 with the full profile and no internal fields', async () => {
    authenticateAs(baseMerchant);
    prismaMock.merchant.findUnique.mockResolvedValue(baseMerchant as any);

    const response = await request(app).get(ME_URL).set('Authorization', 'Bearer valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: 'uuid-1', account: 'CCONTRACT', webhook: null });
    expect(response.body).not.toHaveProperty('refreshTokens');
    expect(response.body).not.toHaveProperty('apiKeys');
  });
});

describe('PATCH /api/v1/merchants/me', () => {
  beforeEach(() => mockReset(prismaMock));

  test('returns 401 when unauthenticated', async () => {
    const response = await request(app).patch(ME_URL).send({ firstName: 'Grace' });
    expect(response.status).toBe(401);
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
  });

  test('updates a valid partial payload and returns 200', async () => {
    authenticateAs(baseMerchant);
    prismaMock.merchant.update.mockImplementation(async (args: any) => ({ ...baseMerchant, ...args.data }));

    const response = await request(app)
      .patch(ME_URL)
      .set('Authorization', 'Bearer valid-token')
      .send({ firstName: 'Grace', webhook: 'https://example.com/hook' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ firstName: 'Grace', webhook: 'https://example.com/hook' });
  });

  test('silently ignores non-editable fields (address/email/merchantId/account)', async () => {
    authenticateAs(baseMerchant);
    prismaMock.merchant.update.mockImplementation(async (args: any) => ({ ...baseMerchant, ...args.data }));

    const response = await request(app)
      .patch(ME_URL)
      .set('Authorization', 'Bearer valid-token')
      .send({
        firstName: 'Grace',
        address: '0xHACK',
        email: 'evil@example.com',
        merchantId: 999,
        account: '0xHACKED',
      });

    expect(response.status).toBe(200);
    const updateArg = prismaMock.merchant.update.mock.calls[0][0];
    expect(updateArg.data).toEqual({ firstName: 'Grace' });
    expect(response.body.address).toBe('0x123');
    expect(response.body.email).toBe('ada@example.com');
    expect(response.body.merchantId).toBe(1);
    expect(response.body.account).toBe('CCONTRACT');
  });

  test('returns 400 for an invalid (non-HTTPS) webhook', async () => {
    authenticateAs(baseMerchant);

    const response = await request(app)
      .patch(ME_URL)
      .set('Authorization', 'Bearer valid-token')
      .send({ webhook: 'http://example.com/hook' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
  });

  test('clears the webhook when sent null', async () => {
    authenticateAs(baseMerchant);
    prismaMock.merchant.update.mockImplementation(async (args: any) => ({ ...baseMerchant, ...args.data }));

    const response = await request(app)
      .patch(ME_URL)
      .set('Authorization', 'Bearer valid-token')
      .send({ webhook: null });

    expect(response.status).toBe(200);
    expect(response.body.webhook).toBeNull();
  });

  test('returns 400 for a required text field sent empty', async () => {
    authenticateAs(baseMerchant);

    const response = await request(app)
      .patch(ME_URL)
      .set('Authorization', 'Bearer valid-token')
      .send({ firstName: '' });

    expect(response.status).toBe(400);
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
  });

  test('returns 400 for an empty payload', async () => {
    authenticateAs(baseMerchant);

    const response = await request(app)
      .patch(ME_URL)
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(response.status).toBe(400);
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
  });
});
