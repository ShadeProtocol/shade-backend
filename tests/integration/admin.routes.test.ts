import { jest, beforeEach } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import request from 'supertest';

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
      typeof address === 'string' && /^G[A-Z0-9]{55}$/.test(address),
  },
}));

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { default: app } = await import('../../src/app.js');

const address = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const nonce = 'nonce-123';
const signature = 'deadbeef';
const mockDate = new Date('2026-06-21T12:00:00Z');

describe('Admin Auth Routes', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    jest.useFakeTimers({ now: mockDate });
    mockVerify.returns = true;
    mockKeypairError.throws = false;
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock),
    );
    prismaMock.$executeRaw.mockResolvedValue(1);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('POST /api/v1/admin/auth/challenge', () => {
    test('behaves like the merchant challenge endpoint for a syntactically valid address', async () => {
      const generatedNonce = 'ab'.repeat(32);
      const message = [
        'Shade Authentication',
        `Address: ${address}`,
        `Nonce: ${generatedNonce}`,
        'Timestamp: 2026-06-21T12:00:00.000Z',
      ].join('\n');
      const expiresAt = new Date('2026-06-21T12:05:00.000Z');

      prismaMock.authNonce.deleteMany.mockResolvedValue({ count: 0 });
      prismaMock.authNonce.create.mockResolvedValue({
        id: 'uuid-1',
        address,
        nonce: generatedNonce,
        message,
        expiresAt,
        usedAt: null,
        createdAt: mockDate,
        merchantId: null,
      });

      const response = await request(app).post('/api/v1/admin/auth/challenge').send({ address });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message,
        nonce: generatedNonce,
        expiresAt: expiresAt.toISOString(),
      });
      // No admin ownership check at this step.
      expect(prismaMock.admin.findUnique).not.toHaveBeenCalled();
    });

    test('should return 400 for an invalid Stellar address', async () => {
      const response = await request(app)
        .post('/api/v1/admin/auth/challenge')
        .send({ address: 'not-a-stellar-address' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid Stellar address' });
      expect(prismaMock.authNonce.create).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/admin/auth/verify', () => {
    const mockAuthNonce = {
      id: 'uuid-1',
      address,
      nonce,
      message: `Shade Authentication\nAddress: ${address}\nNonce: ${nonce}\nTimestamp: 2026-06-21T12:00:00.000Z`,
      expiresAt: new Date('2026-06-21T12:05:00.000Z'),
      usedAt: null,
      createdAt: mockDate,
      merchantId: null,
    };

    test('returns 200 with tokens for a valid signature from an active admin', async () => {
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);
      prismaMock.authNonce.update.mockResolvedValue(mockAuthNonce);
      prismaMock.admin.findUnique.mockResolvedValue({
        id: 'admin-uuid',
        address,
        active: true,
        isSuperAdmin: true,
        createdAt: mockDate,
        updatedAt: mockDate,
      });
      prismaMock.adminRefreshToken.create.mockResolvedValue({
        id: 'session-uuid',
        adminId: 'admin-uuid',
        token: 'refresh-uuid',
        expiresAt: new Date('2026-06-28T12:00:00.000Z'),
        createdAt: mockDate,
      });

      const response = await request(app)
        .post('/api/v1/admin/auth/verify')
        .send({ address, nonce, signature });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        admin: {
          id: 'admin-uuid',
          address,
          isSuperAdmin: true,
        },
      });
    });

    test('returns 401 and creates no Admin row for a valid signature with no Admin row', async () => {
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);
      prismaMock.authNonce.update.mockResolvedValue(mockAuthNonce);
      prismaMock.admin.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/admin/auth/verify')
        .send({ address, nonce, signature });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Not an admin' });
      expect(prismaMock.admin.create).not.toHaveBeenCalled();
    });

    test('returns 401 for a deactivated admin', async () => {
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

      const response = await request(app)
        .post('/api/v1/admin/auth/verify')
        .send({ address, nonce, signature });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Not an admin' });
    });

    test('returns 401 for an invalid signature', async () => {
      mockVerify.returns = false;
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);

      const response = await request(app)
        .post('/api/v1/admin/auth/verify')
        .send({ address, nonce, signature });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: 'Signature verification failed' });
    });

    test('returns 400 when required fields are missing', async () => {
      const response = await request(app).post('/api/v1/admin/auth/verify').send({});

      expect(response.status).toBe(400);
    });

    test('returns 400 when the request has no body at all', async () => {
      const response = await request(app).post('/api/v1/admin/auth/verify');

      expect(response.status).toBe(400);
    });
  });
});
