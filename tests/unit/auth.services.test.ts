import { jest, beforeEach } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

const mockVerify = { returns: true };
const mockKeypairError = { throws: false };

jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  Keypair: {
    fromPublicKey: () => {
      if (mockKeypairError.throws) {
        throw new Error('invalid public key');
      }
      return {
        verify: () => mockVerify.returns,
      };
    },
  },
}));

const { default: prismaMock } = await import('../../src/config/prisma.js') as any;
const {
  authenticateWallet,
  createNonce,
  verifySignature,
  buildChallengeMessage,
  issueAccessToken,
  issueRefreshToken,
} = await import('../../src/services/auth.services.js');

const mockDate = new Date('2026-06-21T12:00:00Z');

describe('Auth Services', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    jest.useFakeTimers({ now: mockDate });
    mockVerify.returns = true;
    mockKeypairError.throws = false;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('buildChallengeMessage', () => {
    test('should construct the challenge message in a deterministic format', () => {
      const msg = buildChallengeMessage('GABCDEF123', 'nonce-abc', mockDate);
      expect(msg).toBe(
        'Shade Authentication\nAddress: GABCDEF123\nNonce: nonce-abc\nTimestamp: 2026-06-21T12:00:00.000Z',
      );
    });
  });

  describe('createNonce', () => {
    test('should create an AuthNonce record and return nonce, message, and expiresAt', async () => {
      const mockNonce = {
        id: 'uuid-1',
        address: 'GABCDEF123',
        nonce: 'generated-uuid',
        message: 'Shade Authentication\nAddress: GABCDEF123\nNonce: generated-uuid\nTimestamp: 2026-06-21T12:00:00.000Z',
        expiresAt: new Date('2026-06-21T12:05:00.000Z'),
        usedAt: null,
        createdAt: mockDate,
      };

      prismaMock.authNonce.create.mockResolvedValue(mockNonce);

      const result = await createNonce('GABCDEF123');

      expect(result).toEqual({
        nonce: mockNonce.nonce,
        message: mockNonce.message,
        expiresAt: mockNonce.expiresAt,
      });
      expect(prismaMock.authNonce.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          address: 'GABCDEF123',
          nonce: expect.any(String),
          message: expect.any(String),
          expiresAt: expect.any(Date),
        }),
      });
    });
  });

  describe('verifySignature', () => {
    const address = 'GABCDEF123';
    const nonce = 'nonce-abc';
    const signature = 'deadbeef';
    const mockAuthNonce = {
      id: 'uuid-1',
      address,
      nonce,
      message: buildChallengeMessage(address, nonce, mockDate),
      expiresAt: new Date('2026-06-21T12:05:00.000Z'),
      usedAt: null,
      createdAt: mockDate,
      merchantId: null,
    };

    test('should return valid when signature is correct', async () => {
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);

      const result = await verifySignature(address, nonce, signature);

      expect(result).toEqual({ valid: true, reason: null });
      expect(prismaMock.authNonce.update).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
        data: { usedAt: expect.any(Date) },
      });
    });

    test('should return invalid when nonce is not found', async () => {
      prismaMock.authNonce.findUnique.mockResolvedValue(null);

      const result = await verifySignature(address, nonce, signature);

      expect(result).toEqual({ valid: false, reason: 'Nonce not found' });
    });

    test('should return invalid when address does not match', async () => {
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);

      const result = await verifySignature('GWRONG', nonce, signature);

      expect(result).toEqual({ valid: false, reason: 'Address mismatch' });
    });

    test('should return invalid when nonce is already used', async () => {
      prismaMock.authNonce.findUnique.mockResolvedValue({
        ...mockAuthNonce,
        usedAt: new Date('2026-06-21T12:01:00.000Z'),
      });

      const result = await verifySignature(address, nonce, signature);

      expect(result).toEqual({ valid: false, reason: 'Nonce already used' });
    });

    test('should return invalid when nonce is expired', async () => {
      jest.setSystemTime(new Date('2026-06-21T12:10:00.000Z'));

      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);

      const result = await verifySignature(address, nonce, signature);

      expect(result).toEqual({ valid: false, reason: 'Nonce expired' });
    });

    test('should return invalid when signature verification fails', async () => {
      mockVerify.returns = false;
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);

      const result = await verifySignature(address, nonce, signature);

      expect(result).toEqual({ valid: false, reason: 'Signature verification failed' });
    });

    test('should return invalid when address is invalid', async () => {
      mockKeypairError.throws = true;
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);

      const result = await verifySignature(address, nonce, signature);

      expect(result).toEqual({ valid: false, reason: 'Invalid address or signature format' });
    });
  });

  describe('issueAccessToken', () => {
    test('should sign a JWT with sub and address claims', async () => {
      const token = issueAccessToken('merchant-uuid', 'GABCDEF123');
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const jwt = await import('jsonwebtoken');
      const decoded = jwt.default.verify(token, 'dev-jwt-secret-change-in-production');
      expect(decoded).toMatchObject({
        sub: 'merchant-uuid',
        address: 'GABCDEF123',
      });
    });
  });

  describe('issueRefreshToken', () => {
    test('should create a RefreshToken and return the token', async () => {
      prismaMock.refreshToken.create.mockResolvedValue({
        id: 'session-uuid',
        merchantId: 'merchant-uuid',
        token: 'ignored',
        expiresAt: new Date('2026-06-28T12:00:00.000Z'),
        createdAt: mockDate,
      });

      const result = await issueRefreshToken('merchant-uuid');

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(prismaMock.refreshToken.create).toHaveBeenCalledWith({
        data: {
          merchantId: 'merchant-uuid',
          token: expect.any(String),
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('authenticateWallet', () => {
    const address = 'GABCDEF123';
    const nonce = 'nonce-abc';
    const signature = 'deadbeef';
    const mockAuthNonce = {
      id: 'uuid-1',
      address,
      nonce,
      message: buildChallengeMessage(address, nonce, mockDate),
      expiresAt: new Date('2026-06-21T12:05:00.000Z'),
      usedAt: null,
      createdAt: mockDate,
      merchantId: null,
    };

    test('should return tokens and merchant on successful auth (new merchant)', async () => {
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);
      prismaMock.merchant.findFirst.mockResolvedValue(null);
      prismaMock.merchant.create.mockResolvedValue({
        id: 'merchant-uuid',
        merchantId: 123456,
        address,
        email: null,
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
        createdAt: mockDate,
        updatedAt: mockDate,
      });
      prismaMock.refreshToken.create.mockResolvedValue({
        id: 'session-uuid',
        merchantId: 'merchant-uuid',
        token: 'ignored',
        expiresAt: new Date('2026-06-28T12:00:00.000Z'),
        createdAt: mockDate,
      });
      prismaMock.authNonce.update.mockResolvedValue(mockAuthNonce);

      const result = await authenticateWallet(address, nonce, signature);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.accessToken).toBeTruthy();
        expect(typeof result.refreshToken).toBe('string');
        expect(result.refreshToken.length).toBeGreaterThan(0);
        expect(result.merchant).toEqual({
          id: 'merchant-uuid',
          address,
          isRegistered: false,
        });
      }
    });

    test('should return tokens and merchant on successful auth (existing merchant)', async () => {
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);
      prismaMock.merchant.findFirst.mockResolvedValue({
        id: 'existing-merchant-uuid',
        merchantId: 654321,
        address,
        email: 'merchant@test.com',
        firstName: 'John',
        lastName: 'Doe',
        businessName: 'Acme',
        category: 'retail',
        description: 'A merchant',
        logo: null,
        active: true,
        verified: true,
        emailVerified: true,
        registered: true,
        createdAt: mockDate,
        updatedAt: mockDate,
      });
      prismaMock.refreshToken.create.mockResolvedValue({
        id: 'session-uuid',
        merchantId: 'existing-merchant-uuid',
        token: 'ignored',
        expiresAt: new Date('2026-06-28T12:00:00.000Z'),
        createdAt: mockDate,
      });
      prismaMock.authNonce.update.mockResolvedValue(mockAuthNonce);

      const result = await authenticateWallet(address, nonce, signature);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.refreshToken).toBe('string');
        expect(result.merchant).toEqual({
          id: 'existing-merchant-uuid',
          address,
          isRegistered: true,
        });
      }
    });

    test('should return failure when signature is invalid', async () => {
      mockVerify.returns = false;
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);

      const result = await authenticateWallet(address, nonce, signature);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('Signature verification failed');
      }
    });
  });
});
