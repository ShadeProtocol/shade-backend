import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { generateMerchantSigningKey } = await import('../../src/services/merchant.services.js');

const HEX32 = /^[0-9a-f]{64}$/;
const merchant = { id: 'merchant-1', merchantKey: null };

describe('generateMerchantSigningKey', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns hex public + private and persists only the public key', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue({ ...merchant });
    prismaMock.merchant.update.mockResolvedValue({ ...merchant });

    const result = await generateMerchantSigningKey('merchant-1');

    expect(result.publicKey).toMatch(HEX32);
    expect(result.privateKey).toMatch(HEX32);

    const updateArgs = prismaMock.merchant.update.mock.calls[0][0];
    expect(updateArgs).toEqual({
      where: { id: 'merchant-1' },
      data: { merchantKey: result.publicKey },
    });
    // The private key must never reach the database.
    expect(JSON.stringify(updateArgs)).not.toContain(result.privateKey);
  });

  test('rotates: a second call replaces the key with a different public key', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue({ ...merchant, merchantKey: 'old-key' });
    prismaMock.merchant.update.mockResolvedValue({ ...merchant });

    const first = await generateMerchantSigningKey('merchant-1');
    const second = await generateMerchantSigningKey('merchant-1');

    expect(second.publicKey).not.toBe(first.publicKey);
    expect(second.privateKey).not.toBe(first.privateKey);
    expect(prismaMock.merchant.update).toHaveBeenCalledTimes(2);
  });

  test('throws 404 and writes nothing when the merchant does not exist', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(null);

    await expect(generateMerchantSigningKey('missing')).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
  });
});
