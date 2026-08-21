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
  StrKey: {
    isValidEd25519PublicKey: (address: string) =>
      typeof address === 'string' && address.startsWith('G') && address.length >= 56,
  },
}));

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { environment } = await import('../../src/config/environment.js');
const { buildChallengeMessage } = await import('../../src/services/auth.services.js');
const { authenticateAdminWallet, issueAdminAccessToken, issueAdminRefreshToken } = await import(
  '../../src/services/admin-auth.services.js'
);

const mockDate = new Date('2026-06-21T12:00:00Z');

describe('Admin Auth Services', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    jest.useFakeTimers({ now: mockDate });
    mockVerify.returns = true;
    mockKeypairError.throws = false;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('issueAdminAccessToken', () => {
    test('should sign a JWT with sub, address, and type: admin claims', async () => {
      const token = issueAdminAccessToken('admin-uuid', 'GABCDEF123');
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const jwt = await import('jsonwebtoken');
      const decoded = jwt.default.verify(token, environment.jwtSecret);
      expect(decoded).toMatchObject({
        sub: 'admin-uuid',
        address: 'GABCDEF123',
        type: 'admin',
      });
    });
  });

  describe('issueAdminRefreshToken', () => {
    test('should create an AdminRefreshToken and return the token', async () => {
      prismaMock.adminRefreshToken.create.mockResolvedValue({
        id: 'session-uuid',
        adminId: 'admin-uuid',
        token: 'ignored',
        expiresAt: new Date('2026-06-28T12:00:00.000Z'),
        createdAt: mockDate,
      });

      const result = await issueAdminRefreshToken('admin-uuid');

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(prismaMock.adminRefreshToken.create).toHaveBeenCalledWith({
        data: {
          adminId: 'admin-uuid',
          token: expect.any(String),
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('authenticateAdminWallet', () => {
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

    test('should return tokens and admin on successful auth for an active admin', async () => {
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);
      prismaMock.authNonce.update.mockResolvedValue(mockAuthNonce);
      prismaMock.admin.findUnique.mockResolvedValue({
        id: 'admin-uuid',
        address,
        active: true,
        isSuperAdmin: false,
        createdAt: mockDate,
        updatedAt: mockDate,
      });
      prismaMock.adminRefreshToken.create.mockResolvedValue({
        id: 'session-uuid',
        adminId: 'admin-uuid',
        token: 'ignored',
        expiresAt: new Date('2026-06-28T12:00:00.000Z'),
        createdAt: mockDate,
      });

      const result = await authenticateAdminWallet(address, nonce, signature);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.accessToken).toBeTruthy();
        expect(typeof result.refreshToken).toBe('string');
        expect(result.admin).toEqual({
          id: 'admin-uuid',
          address,
          isSuperAdmin: false,
        });
      }
      expect(prismaMock.admin.findUnique).toHaveBeenCalledWith({ where: { address } });
      expect(prismaMock.adminLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'admin.login_succeeded',
          actorType: 'ADMIN',
          actorId: 'admin-uuid',
          actorLabel: address,
        }),
      });
    });

    test('should fail without creating an Admin row when no Admin exists for the address', async () => {
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);
      prismaMock.authNonce.update.mockResolvedValue(mockAuthNonce);
      prismaMock.admin.findUnique.mockResolvedValue(null);

      const result = await authenticateAdminWallet(address, nonce, signature);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('Not an admin');
      }
      expect(prismaMock.admin.create).not.toHaveBeenCalled();
      expect(prismaMock.adminLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'admin.login_failed',
          actorType: 'ANONYMOUS',
          actorId: null,
          actorLabel: address,
        }),
      });
    });

    test('should fail for a deactivated admin', async () => {
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);
      prismaMock.authNonce.update.mockResolvedValue(mockAuthNonce);
      prismaMock.admin.findUnique.mockResolvedValue({
        id: 'admin-uuid',
        address,
        active: false,
        isSuperAdmin: false,
        createdAt: mockDate,
        updatedAt: mockDate,
      });

      const result = await authenticateAdminWallet(address, nonce, signature);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('Not an admin');
      }
      expect(prismaMock.admin.create).not.toHaveBeenCalled();
      expect(prismaMock.adminLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'admin.login_failed',
          actorType: 'ANONYMOUS',
          actorLabel: address,
        }),
      });
    });

    test('should fail without querying Admin when the signature is invalid', async () => {
      mockVerify.returns = false;
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);

      const result = await authenticateAdminWallet(address, nonce, signature);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('Signature verification failed');
      }
      expect(prismaMock.admin.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.adminLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'admin.login_failed',
          actorType: 'ANONYMOUS',
          actorLabel: address,
        }),
      });
    });
  });
});
