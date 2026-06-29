import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

const sendOtpMock = jest.fn(async () => undefined);

jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  __esModule: true,
  sendOtp: sendOtpMock,
}));

jest.unstable_mockModule('../../src/services/otp.services.js', () => ({
  __esModule: true,
  generateOtp: () => '123456',
  hashOtp: async () => 'hashed-otp',
  verifyOtpHash: async () => true,
  issueEmailOtp: jest.fn(),
  verifyEmailOtp: jest.fn(),
  resendEmailOtp: jest.fn(),
}));

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { registerMerchant } = await import('../../src/services/merchant.services.js');
const { AppError } = await import('../../src/utils/errors.js');

const baseMerchant = {
  id: 'uuid-1',
  merchantId: 1,
  email: null,
  address: '0x123',
  firstName: null,
  lastName: null,
  businessName: null,
  category: null,
  description: null,
  logo: null,
  active: true,
  verified: false,
  emailVerified: false,
  registered: false,
  emailOtp: null,
  emailOtpExpiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validPayload = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'Ada@Example.com',
  businessName: 'Analytical Engines',
  category: 'software',
  description: 'We build computing machines.',
};

describe('registerMerchant service', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    sendOtpMock.mockClear();
  });

  test('completes registration, stores OTP hash and sends email', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(baseMerchant as any);
    prismaMock.merchant.findFirst.mockResolvedValue(null);
    prismaMock.merchant.update.mockImplementation(async (args: any) => ({
      ...baseMerchant,
      ...args.data,
    }));

    const result = await registerMerchant('uuid-1', validPayload);

    expect(prismaMock.merchant.update).toHaveBeenCalledWith({
      where: { id: 'uuid-1' },
      data: expect.objectContaining({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        businessName: 'Analytical Engines',
        category: 'software',
        description: 'We build computing machines.',
        logo: null,
        emailVerified: false,
        registered: true,
        emailOtp: 'hashed-otp',
        emailOtpExpiresAt: expect.any(Date),
      }),
    });
    expect(sendOtpMock).toHaveBeenCalledWith('ada@example.com', '123456', 'Ada');
    expect(result.emailVerified).toBe(false);
    expect(result.registered).toBe(true);
  });

  test('throws 404 when merchant does not exist', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(null);

    await expect(registerMerchant('missing', validPayload)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(sendOtpMock).not.toHaveBeenCalled();
  });

  test('throws 409 when profile already set up', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue({
      ...baseMerchant,
      registered: true,
    } as any);

    await expect(registerMerchant('uuid-1', validPayload)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Profile already set up',
    });
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
  });

  test('throws 409 when email already registered by another merchant', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(baseMerchant as any);
    prismaMock.merchant.findFirst.mockResolvedValue({
      ...baseMerchant,
      id: 'uuid-2',
      email: 'ada@example.com',
    } as any);

    await expect(registerMerchant('uuid-1', validPayload)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Email already registered',
    });
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
  });

  test('AppError carries the provided status code', () => {
    const err = new AppError(409, 'Email already registered');
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe('Email already registered');
  });
});
