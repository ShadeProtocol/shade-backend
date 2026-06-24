import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import request from 'supertest';

const sendOtpEmailMock = jest.fn(async (_email: string) => '123456');

jest.unstable_mockModule('../../src/services/otp.services.js', () => ({
  __esModule: true,
  sendOtpEmail: sendOtpEmailMock,
  generateOtp: () => '123456',
}));

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { default: app } = await import('../../src/app.js');

const REGISTER_URL = '/api/v1/merchants/register';

const baseMerchant = {
  id: 'uuid-1',
  merchantId: 1,
  address: '0x123',
  account: null,
  email: null,
  firstName: null,
  lastName: null,
  businessName: null,
  category: null,
  description: null,
  logo: null,
  webhook: null,
  active: true,
  verified: false,
  emailVerified: false,
  registered: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const validPayload = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  businessName: 'Analytical Engines',
  category: 'software',
  description: 'We build computing machines.',
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

describe('POST /api/v1/merchants/register', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    sendOtpEmailMock.mockClear();
  });

  test('returns 401 for unauthenticated requests', async () => {
    const response = await request(app).post(REGISTER_URL).send(validPayload);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
  });

  test('returns 401 when the session token is invalid', async () => {
    prismaMock.merchantSession.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .post(REGISTER_URL)
      .set('Authorization', 'Bearer bad-token')
      .send(validPayload);

    expect(response.status).toBe(401);
  });

  test('returns 200 with the merchant profile on valid payload', async () => {
    authenticateAs(baseMerchant);
    prismaMock.merchant.findUnique.mockResolvedValue(baseMerchant as any);
    prismaMock.merchant.findFirst.mockResolvedValue(null);
    prismaMock.merchant.update.mockImplementation(async (args: any) => ({
      ...baseMerchant,
      ...args.data,
    }));

    const response = await request(app)
      .post(REGISTER_URL)
      .set('Authorization', 'Bearer valid-token')
      .send(validPayload);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: 'uuid-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      businessName: 'Analytical Engines',
      emailVerified: false,
      registered: true,
    });
    expect(sendOtpEmailMock).toHaveBeenCalledWith('ada@example.com');
  });

  test('returns 409 when the email is already registered', async () => {
    authenticateAs(baseMerchant);
    prismaMock.merchant.findUnique.mockResolvedValue(baseMerchant as any);
    prismaMock.merchant.findFirst.mockResolvedValue({
      ...baseMerchant,
      id: 'uuid-2',
    } as any);

    const response = await request(app)
      .post(REGISTER_URL)
      .set('Authorization', 'Bearer valid-token')
      .send(validPayload);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'Email already registered' });
  });

  test('returns 409 when the merchant already completed registration', async () => {
    const registeredMerchant = { ...baseMerchant, registered: true };
    authenticateAs(registeredMerchant);
    prismaMock.merchant.findUnique.mockResolvedValue(registeredMerchant as any);

    const response = await request(app)
      .post(REGISTER_URL)
      .set('Authorization', 'Bearer valid-token')
      .send(validPayload);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'Profile already set up' });
  });

  test('returns 400 with field-level errors when required fields are missing', async () => {
    authenticateAs(baseMerchant);

    const response = await request(app)
      .post(REGISTER_URL)
      .set('Authorization', 'Bearer valid-token')
      .send({ email: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation failed');
    expect(response.body.errors).toMatchObject({
      firstName: expect.any(String),
      lastName: expect.any(String),
      email: expect.any(String),
      businessName: expect.any(String),
      category: expect.any(String),
      description: expect.any(String),
    });
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
  });
});
