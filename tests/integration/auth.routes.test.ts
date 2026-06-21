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
}));

const { default: prismaMock } = await import('../../src/config/prisma.js') as any;
const { default: app } = await import('../../src/app.js');

const address = 'GABCDEF123';
const nonce = 'nonce-123';
const signature = 'deadbeef';
const mockDate = new Date('2026-06-21T12:00:00Z');

describe('Auth Routes', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    jest.useFakeTimers({ now: mockDate });
    mockVerify.returns = true;
    mockKeypairError.throws = false;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('POST /api/v1/auth/verify', () => {
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

    test('should return 200 with tokens for a valid signature (new merchant)', async () => {
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);
      prismaMock.merchant.findFirst.mockResolvedValue(null);
      prismaMock.merchant.create.mockResolvedValue({
        id: 'merchant-uuid',
        merchantId: 123456,
        email: null,
        firstName: null,
        address,
        active: true,
        verified: false,
        createdAt: mockDate,
        updatedAt: mockDate,
      });
      prismaMock.merchantSession.create.mockResolvedValue({
        id: 'session-uuid',
        merchantId: 'merchant-uuid',
        token: 'refresh-uuid',
        expiresAt: new Date('2026-06-28T12:00:00.000Z'),
        createdAt: mockDate,
      });
      prismaMock.authNonce.update.mockResolvedValue(mockAuthNonce);

      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({ address, nonce, signature });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        merchant: {
          id: 'merchant-uuid',
          address,
          isRegistered: false,
        },
      });
    });

    test('should return 200 with isRegistered: true for an existing merchant with firstName', async () => {
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);
      prismaMock.merchant.findFirst.mockResolvedValue({
        id: 'merchant-uuid',
        merchantId: 123456,
        email: 'test@merchant.com',
        firstName: 'Jane',
        address,
        active: true,
        verified: true,
        createdAt: mockDate,
        updatedAt: mockDate,
      });
      prismaMock.merchantSession.create.mockResolvedValue({
        id: 'session-uuid',
        merchantId: 'merchant-uuid',
        token: 'refresh-uuid',
        expiresAt: new Date('2026-06-28T12:00:00.000Z'),
        createdAt: mockDate,
      });
      prismaMock.authNonce.update.mockResolvedValue(mockAuthNonce);

      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({ address, nonce, signature });

      expect(response.status).toBe(200);
      expect(response.body.merchant).toMatchObject({
        isRegistered: true,
      });
    });

    test('should return 401 for an invalid signature', async () => {
      mockVerify.returns = false;
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);

      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({ address, nonce, signature });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: 'Signature verification failed' });
    });

    test('should return 401 for an expired nonce', async () => {
      jest.setSystemTime(new Date('2026-06-21T12:10:00.000Z'));
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);

      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({ address, nonce, signature });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: 'Nonce expired' });
    });

    test('should return 401 for a replayed (already used) nonce', async () => {
      prismaMock.authNonce.findUnique.mockResolvedValue({
        ...mockAuthNonce,
        usedAt: new Date('2026-06-21T12:01:00.000Z'),
      });

      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({ address, nonce, signature });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: 'Nonce already used' });
    });

    test('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({});

      expect(response.status).toBe(400);
    });

    test('should return 400 when fields are not strings', async () => {
      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({ address: 123, nonce: true, signature: [] });

      expect(response.status).toBe(400);
    });

    test('should return 401 when nonce is not found', async () => {
      prismaMock.authNonce.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({ address, nonce, signature });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: 'Nonce not found' });
    });

    test('should return 401 when signing address does not match the nonce address', async () => {
      prismaMock.authNonce.findUnique.mockResolvedValue(mockAuthNonce);

      const response = await request(app)
        .post('/api/v1/auth/verify')
        .send({ address: 'GWRONG', nonce, signature });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ error: 'Address mismatch' });
    });
  });
});
