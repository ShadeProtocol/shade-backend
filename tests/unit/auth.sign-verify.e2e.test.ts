import { jest, beforeEach } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import { Keypair } from '@stellar/stellar-sdk';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const {
  buildChallengeMessage,
  createNonce,
  verifySignature,
  authenticateWallet,
} = await import('../../src/services/auth.services.js');

const mockDate = new Date('2026-06-21T12:00:00Z');

describe('Auth sign/verify E2E', () => {
  const keypair = Keypair.random();
  const address = keypair.publicKey();

  beforeEach(() => {
    mockReset(prismaMock);
    jest.useFakeTimers({ now: mockDate });
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('wallet-signed challenge verifies against the stored message', async () => {
    const nonce = 'c'.repeat(64);
    const message = buildChallengeMessage(address, nonce, mockDate);
    const signature = keypair.sign(Buffer.from(message, 'utf-8')).toString('hex');
    const authNonceRecord = {
      id: 'uuid-1',
      address,
      nonce,
      message,
      expiresAt: new Date('2026-06-21T12:05:00.000Z'),
      usedAt: null,
      createdAt: mockDate,
      merchantId: null,
    };

    prismaMock.authNonce.findUnique.mockResolvedValue(authNonceRecord);
    prismaMock.authNonce.update.mockResolvedValue(authNonceRecord);

    const result = await verifySignature(address, nonce, signature);

    expect(result).toEqual({ valid: true, reason: null });
  });

  test('challenge -> sign -> verify issues tokens for a new merchant', async () => {
    prismaMock.authNonce.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.authNonce.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'uuid-1',
      ...data,
      usedAt: null,
      createdAt: mockDate,
      merchantId: null,
    }));
    prismaMock.merchant.findFirst.mockResolvedValue(null);
    prismaMock.merchant.create.mockResolvedValue({
      id: 'merchant-uuid',
      merchantId: 123456,
      address,
      registered: false,
    });
    prismaMock.refreshToken.create.mockResolvedValue({
      id: 'session-uuid',
      merchantId: 'merchant-uuid',
      token: 'refresh-token',
      expiresAt: new Date('2026-06-28T12:00:00.000Z'),
      createdAt: mockDate,
    });

    const challenge = await createNonce(address);
    const signature = keypair.sign(Buffer.from(challenge.message, 'utf-8')).toString('hex');
    const authNonceRecord = {
      id: 'uuid-1',
      address,
      nonce: challenge.nonce,
      message: challenge.message,
      expiresAt: challenge.expiresAt,
      usedAt: null,
      createdAt: mockDate,
      merchantId: null,
    };

    prismaMock.authNonce.findUnique.mockResolvedValue(authNonceRecord);
    prismaMock.authNonce.update.mockResolvedValue(authNonceRecord);

    const authResult = await authenticateWallet(address, challenge.nonce, signature);

    expect(authResult.success).toBe(true);
    if (authResult.success) {
      expect(authResult.accessToken).toBeTruthy();
      expect(authResult.refreshToken).toBeTruthy();
      expect(authResult.merchant).toEqual({
        id: 'merchant-uuid',
        address,
        isRegistered: false,
      });
    }
  });
});
