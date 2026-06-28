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
  emailOtp: null as string | null,
  emailOtpExpiresAt: null as Date | null,
  createdAt: new Date('2026-06-21T12:00:00Z'),
  updatedAt: new Date('2026-06-21T12:00:00Z'),
};

describe('otp.services', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    sendOtpMock.mockClear();
    jest.useFakeTimers({ now: new Date('2026-06-21T12:00:00Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('verifyEmailOtp clears OTP hash after successful verification', async () => {
    const code = '123456';
    const emailOtp = await bcrypt.hash(code, 10);
    const merchant = {
      ...baseMerchant,
      emailOtp,
      emailOtpExpiresAt: new Date('2026-06-21T12:05:00.000Z'),
    };

    prismaMock.merchant.findUnique.mockResolvedValue(merchant as any);
    prismaMock.merchant.update.mockResolvedValue({
      ...merchant,
      emailVerified: true,
      emailOtp: null,
      emailOtpExpiresAt: null,
    } as any);

    const result = await verifyEmailOtp('uuid-1', code);

    expect(result.emailVerified).toBe(true);
    expect(prismaMock.merchant.update).toHaveBeenCalledWith({
      where: { id: 'uuid-1' },
      data: {
        emailVerified: true,
        emailOtp: null,
        emailOtpExpiresAt: null,
      },
    });
  });

  test('resendEmailOtp generates a new code and sends email', async () => {
    const merchant = {
      ...baseMerchant,
      emailOtp: 'old-hash',
      emailOtpExpiresAt: new Date('2026-06-21T11:58:00.000Z'),
    };

    prismaMock.merchant.findUnique.mockResolvedValue(merchant as any);
    prismaMock.merchant.update.mockResolvedValue(merchant as any);

    await resendEmailOtp('uuid-1');

    expect(sendOtpMock).toHaveBeenCalledWith(
      'ada@example.com',
      expect.stringMatching(/^\d{6}$/),
      'Ada',
    );
    expect(prismaMock.merchant.update).toHaveBeenCalled();
  });
});
