import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

const sendOtpEmailMock = jest.fn(async (_email: string) => '123456');

jest.unstable_mockModule('../../src/services/otp.services.js', () => ({
  __esModule: true,
  sendOtpEmail: sendOtpEmailMock,
  generateOtp: () => '123456',
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
    sendOtpEmailMock.mockClear();
  });

  test('completes registration, resets email verification and triggers OTP', async () => {
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
      }),
    });
    expect(sendOtpEmailMock).toHaveBeenCalledWith('ada@example.com');
    expect(result.emailVerified).toBe(false);
    expect(result.registered).toBe(true);
  });

  test('throws 404 when merchant does not exist', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(null);

    await expect(registerMerchant('missing', validPayload)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(sendOtpEmailMock).not.toHaveBeenCalled();
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
