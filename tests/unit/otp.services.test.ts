import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

const sendOtpMock = jest.fn(async () => undefined);

jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  __esModule: true,
  sendOtp: sendOtpMock,
}));

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { verifyEmailOtp, resendEmailOtp } = await import('../../src/services/otp.services.js');
const bcrypt = await import('bcrypt');

const baseMerchant = {
  id: 'uuid-1',
  merchantId: 1,
  address: '0x123',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  businessName: 'Analytical Engines',
  category: 'software',
  description: 'We build computing machines.',
  logo: null,
  account: null,
  webhook: null,
  active: true,
  verified: false,
  emailVerified: false,
  registered: true,
  createdAt: new Date('2026-06-21T12:00:00Z'),
  updatedAt: new Date('2026-06-21T12:00:00Z'),
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

describe('otp.services', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    sendOtpMock.mockClear();
    jest.useFakeTimers({ now: new Date('2026-06-21T12:00:00Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('verifyEmailOtp', () => {
    test('marks the matched row used and sets emailVerified', async () => {
      const code = '123456';
      const codeHash = await bcrypt.hash(code, 10);

      prismaMock.emailOtp.findFirst.mockResolvedValue(otpRow({ codeHash }) as any);
      prismaMock.emailOtp.update.mockResolvedValue(otpRow({ codeHash, usedAt: new Date() }) as any);
      prismaMock.merchant.update.mockResolvedValue({
        ...baseMerchant,
        emailVerified: true,
      } as any);

      const result = await verifyEmailOtp('uuid-1', code);

      expect(result.emailVerified).toBe(true);
      expect(prismaMock.emailOtp.findFirst).toHaveBeenCalledWith({
        where: { merchantId: 'uuid-1', usedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      expect(prismaMock.emailOtp.update).toHaveBeenCalledWith({
        where: { id: 'otp-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prismaMock.merchant.update).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        data: { emailVerified: true },
      });
    });

    test('throws 400 when the merchant has no unused code', async () => {
      prismaMock.emailOtp.findFirst.mockResolvedValue(null);

      await expect(verifyEmailOtp('uuid-1', '123456')).rejects.toMatchObject({
        statusCode: 400,
        message: 'Invalid verification code',
      });
      expect(prismaMock.emailOtp.update).not.toHaveBeenCalled();
      expect(prismaMock.merchant.update).not.toHaveBeenCalled();
    });

    test('throws 400 Code expired when the newest row is past expiry', async () => {
      const code = '123456';
      const codeHash = await bcrypt.hash(code, 10);

      prismaMock.emailOtp.findFirst.mockResolvedValue(
        otpRow({ codeHash, expiresAt: new Date('2026-06-21T11:59:00.000Z') }) as any,
      );

      await expect(verifyEmailOtp('uuid-1', code)).rejects.toMatchObject({
        statusCode: 400,
        message: 'Code expired',
      });
      expect(prismaMock.emailOtp.update).not.toHaveBeenCalled();
    });

    test('throws 400 for a wrong code without spending the row', async () => {
      const codeHash = await bcrypt.hash('123456', 10);

      prismaMock.emailOtp.findFirst.mockResolvedValue(otpRow({ codeHash }) as any);

      await expect(verifyEmailOtp('uuid-1', '654321')).rejects.toMatchObject({
        statusCode: 400,
        message: 'Invalid verification code',
      });
      expect(prismaMock.emailOtp.update).not.toHaveBeenCalled();
      expect(prismaMock.merchant.update).not.toHaveBeenCalled();
    });
  });

  describe('resendEmailOtp', () => {
    test('creates a new code row and sends the email when no recent row exists', async () => {
      prismaMock.merchant.findUnique.mockResolvedValue(baseMerchant as any);
      prismaMock.emailOtp.findFirst.mockResolvedValue(null);
      prismaMock.emailOtp.create.mockResolvedValue(otpRow() as any);

      await resendEmailOtp('uuid-1');

      expect(prismaMock.emailOtp.findFirst).toHaveBeenCalledWith({
        where: {
          merchantId: 'uuid-1',
          createdAt: { gt: new Date('2026-06-21T11:59:00.000Z') },
        },
      });
      expect(prismaMock.emailOtp.create).toHaveBeenCalledWith({
        data: {
          merchantId: 'uuid-1',
          codeHash: expect.any(String),
          expiresAt: new Date('2026-06-21T12:10:00.000Z'),
        },
      });
      expect(sendOtpMock).toHaveBeenCalledWith(
        'ada@example.com',
        expect.stringMatching(/^\d{6}$/),
        'Ada',
      );
    });

    test('throws 429 when a code was issued within the cooldown window', async () => {
      prismaMock.merchant.findUnique.mockResolvedValue(baseMerchant as any);
      prismaMock.emailOtp.findFirst.mockResolvedValue(
        otpRow({ createdAt: new Date('2026-06-21T11:59:30.000Z') }) as any,
      );

      await expect(resendEmailOtp('uuid-1')).rejects.toMatchObject({
        statusCode: 429,
        message: 'Please wait before requesting a new code',
      });
      expect(prismaMock.emailOtp.create).not.toHaveBeenCalled();
      expect(sendOtpMock).not.toHaveBeenCalled();
    });

    test('throws 404 when the merchant does not exist', async () => {
      prismaMock.merchant.findUnique.mockResolvedValue(null);

      await expect(resendEmailOtp('missing')).rejects.toMatchObject({ statusCode: 404 });
    });

    test('throws 400 when the email is already verified', async () => {
      prismaMock.merchant.findUnique.mockResolvedValue({
        ...baseMerchant,
        emailVerified: true,
      } as any);

      await expect(resendEmailOtp('uuid-1')).rejects.toMatchObject({
        statusCode: 400,
        message: 'Email already verified',
      });
      expect(prismaMock.emailOtp.findFirst).not.toHaveBeenCalled();
    });
  });
});
