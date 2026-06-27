import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { getMyProfile, updateMyProfile } = await import('../../src/services/merchant.services.js');

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
  logo: 'https://example.com/logo.png',
  webhook: null,
  active: true,
  verified: false,
  emailVerified: false,
  registered: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('getMyProfile', () => {
  beforeEach(() => mockReset(prismaMock));

  test('returns the sanitized profile including account and webhook', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(baseMerchant);

    const result = await getMyProfile('uuid-1');

    expect(prismaMock.merchant.findUnique).toHaveBeenCalledWith({ where: { id: 'uuid-1' } });
    expect(result).toMatchObject({ id: 'uuid-1', account: 'CCONTRACT', webhook: null });
    expect(result).not.toHaveProperty('refreshTokens');
    expect(result).not.toHaveProperty('apiKeys');
  });

  test('throws AppError(404) when the merchant does not exist', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(null);

    await expect(getMyProfile('missing')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('updateMyProfile', () => {
  beforeEach(() => mockReset(prismaMock));

  test('writes only the editable fields present in the payload, trimmed', async () => {
    prismaMock.merchant.update.mockImplementation(async (args: any) => ({ ...baseMerchant, ...args.data }));

    await updateMyProfile('uuid-1', {
      firstName: '  Grace  ',
      webhook: 'https://example.com/hook',
    });

    expect(prismaMock.merchant.update).toHaveBeenCalledWith({
      where: { id: 'uuid-1' },
      data: { firstName: 'Grace', webhook: 'https://example.com/hook' },
    });
  });

  test('normalizes a cleared logo/webhook to null', async () => {
    prismaMock.merchant.update.mockImplementation(async (args: any) => ({ ...baseMerchant, ...args.data }));

    await updateMyProfile('uuid-1', { logo: '', webhook: null });

    expect(prismaMock.merchant.update).toHaveBeenCalledWith({
      where: { id: 'uuid-1' },
      data: { logo: null, webhook: null },
    });
  });

  test('returns the sanitized updated profile', async () => {
    prismaMock.merchant.update.mockImplementation(async (args: any) => ({ ...baseMerchant, ...args.data }));

    const result = await updateMyProfile('uuid-1', { businessName: 'New Co' });

    expect(result).toMatchObject({ businessName: 'New Co' });
    expect(result).not.toHaveProperty('refreshTokens');
  });
});
