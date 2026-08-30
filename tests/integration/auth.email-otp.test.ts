import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import request from 'supertest';

const sendOtpMock = jest.fn(async () => undefined);

jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  __esModule: true,
  sendOtp: sendOtpMock,
  sendInvoiceEmail: jest.fn(async () => undefined),
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
  createdAt: mockDate,
  updatedAt: mockDate,
};

const otpRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'otp-1',
  merchantId: 'uuid-1',
  codeHash: 'hash',
  expiresAt: new Date('2026-06-21T12:05:00.000Z'),
  usedAt: null as Date | null,
  createdAt: new Date('2026-06-21T11:55:00.000Z'),
  ...overrides,
});

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
      const codeHash = await bcrypt.hash(code, 10);

      authenticateAs(registeredMerchant);
      prismaMock.emailOtp.findFirst.mockResolvedValue(otpRow({ codeHash }) as any);
      prismaMock.emailOtp.update.mockResolvedValue(otpRow({ codeHash, usedAt: mockDate }) as any);
      prismaMock.merchant.update.mockImplementation(async (args: any) => ({
        ...registeredMerchant,
        ...args.data,
      }));

      const response = await request(app)
        .post(VERIFY_EMAIL_URL)
        .set('Authorization', 'Bearer valid-token')
        .send({ code });

      expect(response.status).toBe(200);
      expect(response.body.emailVerified).toBe(true);
      expect(prismaMock.emailOtp.update).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prismaMock.merchant.update).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        data: { emailVerified: true },
      });
      expect(prismaMock.adminLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'merchant.email_verified',
          actorType: 'MERCHANT',
          actorId: 'uuid-1',
          targetType: 'Merchant',
          targetId: 'uuid-1',
        }),
      });
    });

    test('returns 400 for wrong code', async () => {
      const codeHash = await bcrypt.hash('123456', 10);

      authenticateAs(registeredMerchant);
      prismaMock.emailOtp.findFirst.mockResolvedValue(otpRow({ codeHash }) as any);

      const response = await request(app)
        .post(VERIFY_EMAIL_URL)
        .set('Authorization', 'Bearer valid-token')
        .send({ code: '654321' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid verification code' });
      expect(prismaMock.emailOtp.update).not.toHaveBeenCalled();
    });

    test('returns 400 with Code expired for expired code', async () => {
      const code = '123456';
      const codeHash = await bcrypt.hash(code, 10);

      authenticateAs(registeredMerchant);
      prismaMock.emailOtp.findFirst.mockResolvedValue(
        otpRow({ codeHash, expiresAt: new Date('2026-06-21T11:59:00.000Z') }) as any,
      );

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
      authenticateAs(registeredMerchant);
      prismaMock.merchant.findUnique.mockResolvedValue(registeredMerchant as any);
      prismaMock.emailOtp.findFirst.mockResolvedValue(null);
      prismaMock.emailOtp.create.mockResolvedValue(otpRow() as any);

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
      expect(prismaMock.emailOtp.create).toHaveBeenCalledWith({
        data: {
          merchantId: 'uuid-1',
          codeHash: expect.any(String),
          expiresAt: expect.any(Date),
        },
      });
      expect(prismaMock.adminLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'merchant.otp_resent',
          actorType: 'MERCHANT',
          actorId: 'uuid-1',
        }),
      });
    });

    test('returns 429 when resend is requested within one minute', async () => {
      authenticateAs(registeredMerchant);
      prismaMock.merchant.findUnique.mockResolvedValue(registeredMerchant as any);
      prismaMock.emailOtp.findFirst.mockResolvedValue(
        otpRow({ createdAt: new Date('2026-06-21T11:59:30.000Z') }) as any,
      );

      const response = await request(app)
        .post(RESEND_OTP_URL)
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(429);
      expect(response.body).toEqual({ error: 'Please wait before requesting a new code' });
      expect(sendOtpMock).not.toHaveBeenCalled();
      expect(prismaMock.emailOtp.create).not.toHaveBeenCalled();
    });
  });
});
