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
    prismaMock.merchant.updateMany.mockResolvedValue({ count: 1 });

    const result = await generateMerchantSigningKey('merchant-1');

    expect(result.publicKey).toMatch(HEX32);
    expect(result.privateKey).toMatch(HEX32);

    const updateArgs = prismaMock.merchant.updateMany.mock.calls[0][0];
    expect(updateArgs).toEqual({
      // Optimistic-concurrency guard: scoped to the key we just read (null here).
      where: { id: 'merchant-1', merchantKey: null },
      data: { merchantKey: result.publicKey },
    });
    // The private key must never reach the database.
    expect(JSON.stringify(updateArgs)).not.toContain(result.privateKey);
  });

  test('rotates: a second call replaces the key with a different public key', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue({ ...merchant, merchantKey: 'old-key' });
    prismaMock.merchant.updateMany.mockResolvedValue({ count: 1 });

    const first = await generateMerchantSigningKey('merchant-1');
    const second = await generateMerchantSigningKey('merchant-1');

    expect(second.publicKey).not.toBe(first.publicKey);
    expect(second.privateKey).not.toBe(first.privateKey);
    expect(prismaMock.merchant.updateMany).toHaveBeenCalledTimes(2);
    // Each write is conditioned on the previously stored key.
    expect(prismaMock.merchant.updateMany.mock.calls[0][0].where).toEqual({
      id: 'merchant-1',
      merchantKey: 'old-key',
    });
  });

  test('throws 409 when a concurrent rotation already changed the key', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue({ ...merchant, merchantKey: 'old-key' });
    // No row matches the prior key -> another request rotated it first.
    prismaMock.merchant.updateMany.mockResolvedValue({ count: 0 });

    await expect(generateMerchantSigningKey('merchant-1')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  test('throws 404 and writes nothing when the merchant does not exist', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(null);

    await expect(generateMerchantSigningKey('missing')).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.merchant.updateMany).not.toHaveBeenCalled();
  });
});
