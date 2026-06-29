import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import request from 'supertest';

const sendOtpMock = jest.fn(async () => undefined);

jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  __esModule: true,
  sendOtp: sendOtpMock,
}));

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { default: app } = await import('../../src/app.js');
const bcrypt = await import('bcrypt');

const VERIFY_EMAIL_URL = '/api/v1/auth/verify-email';
const RESEND_OTP_URL = '/api/v1/auth/resend-otp';

const mockDate = new Date('2026-06-21T12:00:00Z');

const registeredMerchant = {
  id: 'uuid-1',
  merchantId: 1,
  address: '0x123',
  account: null,
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
  emailOtp: null as string | null,
  emailOtpExpiresAt: null as Date | null,
  createdAt: mockDate,
  updatedAt: mockDate,
};

const authenticateAs = (merchant: Record<string, unknown>) => {
  prismaMock.refreshToken.findUnique.mockResolvedValue({
    id: 'session-1',
    merchantId: merchant.id,
    token: 'valid-token',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: mockDate,
    merchant,
  } as any);
};

describe('Email OTP auth routes', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    sendOtpMock.mockClear();
    jest.useFakeTimers({ now: mockDate });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('POST /api/v1/auth/verify-email', () => {
    test('returns 401 for unauthenticated requests', async () => {
      const response = await request(app).post(VERIFY_EMAIL_URL).send({ code: '123456' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required' });
    });

    test('returns 400 when code is missing', async () => {
      authenticateAs(registeredMerchant);

      const response = await request(app)
        .post(VERIFY_EMAIL_URL)
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'code is required' });
    });

    test('returns 200 and marks emailVerified true with correct code', async () => {
      const code = '123456';
      const emailOtp = await bcrypt.hash(code, 10);
      const merchantWithOtp = {
        ...registeredMerchant,
        emailOtp,
        emailOtpExpiresAt: new Date('2026-06-21T12:05:00.000Z'),
      };

      authenticateAs(merchantWithOtp);
      prismaMock.merchant.findUnique.mockResolvedValue(merchantWithOtp as any);
      prismaMock.merchant.update.mockImplementation(async (args: any) => ({
        ...merchantWithOtp,
        ...args.data,
      }));

      const response = await request(app)
        .post(VERIFY_EMAIL_URL)
        .set('Authorization', 'Bearer valid-token')
        .send({ code });

      expect(response.status).toBe(200);
      expect(response.body.emailVerified).toBe(true);
      expect(prismaMock.merchant.update).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        data: {
          emailVerified: true,
          emailOtp: null,
          emailOtpExpiresAt: null,
        },
      });
    });

    test('returns 400 for wrong code', async () => {
      const emailOtp = await bcrypt.hash('123456', 10);
      const merchantWithOtp = {
        ...registeredMerchant,
        emailOtp,
        emailOtpExpiresAt: new Date('2026-06-21T12:05:00.000Z'),
      };

      authenticateAs(merchantWithOtp);
      prismaMock.merchant.findUnique.mockResolvedValue(merchantWithOtp as any);

      const response = await request(app)
        .post(VERIFY_EMAIL_URL)
        .set('Authorization', 'Bearer valid-token')
        .send({ code: '654321' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid verification code' });
    });

    test('returns 400 with Code expired for expired code', async () => {
      const code = '123456';
      const emailOtp = await bcrypt.hash(code, 10);
      const merchantWithOtp = {
        ...registeredMerchant,
        emailOtp,
        emailOtpExpiresAt: new Date('2026-06-21T11:59:00.000Z'),
      };

      authenticateAs(merchantWithOtp);
      prismaMock.merchant.findUnique.mockResolvedValue(merchantWithOtp as any);

      const response = await request(app)
        .post(VERIFY_EMAIL_URL)
        .set('Authorization', 'Bearer valid-token')
        .send({ code });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Code expired' });
    });
  });

  describe('POST /api/v1/auth/resend-otp', () => {
    test('returns 401 for unauthenticated requests', async () => {
      const response = await request(app).post(RESEND_OTP_URL);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Authentication required' });
    });

    test('returns 200 and re-sends OTP when cooldown has elapsed', async () => {
      const merchantWithOtp = {
        ...registeredMerchant,
        emailOtp: 'hashed',
        emailOtpExpiresAt: new Date('2026-06-21T11:58:00.000Z'),
      };

      authenticateAs(merchantWithOtp);
      prismaMock.merchant.findUnique.mockResolvedValue(merchantWithOtp as any);
      prismaMock.merchant.update.mockResolvedValue(merchantWithOtp as any);

      const response = await request(app)
        .post(RESEND_OTP_URL)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Verification code sent' });
      expect(sendOtpMock).toHaveBeenCalledWith(
        'ada@example.com',
        expect.stringMatching(/^\d{6}$/),
        'Ada',
      );
      expect(prismaMock.merchant.update).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        data: {
          emailOtp: expect.any(String),
          emailOtpExpiresAt: expect.any(Date),
        },
      });
    });

    test('returns 429 when resend is requested within one minute', async () => {
      const merchantWithOtp = {
        ...registeredMerchant,
        emailOtp: 'hashed',
        emailOtpExpiresAt: new Date('2026-06-21T12:09:30.000Z'),
      };

      authenticateAs(merchantWithOtp);
      prismaMock.merchant.findUnique.mockResolvedValue(merchantWithOtp as any);

      const response = await request(app)
        .post(RESEND_OTP_URL)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(429);
      expect(response.body).toEqual({ error: 'Please wait before requesting a new code' });
      expect(sendOtpMock).not.toHaveBeenCalled();
    });
  });
});
