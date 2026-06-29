import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { environment } = await import('../../src/config/environment.js');
const { authenticateMerchant } = await import('../../src/middlewares/auth.middleware.js');

const MERCHANT_ID = 'merchant-1';

const merchant = {
  id: MERCHANT_ID,
  merchantId: 1,
  address: '0x123',
  registered: true,
};

const buildReq = (authorization?: string): Request =>
  ({ headers: authorization ? { authorization } : {} }) as unknown as Request;

const buildRes = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res) as unknown as Response['status'];
  res.json = jest.fn().mockReturnValue(res) as unknown as Response['json'];
  return res;
};

const validToken = () =>
  jwt.sign({ sub: MERCHANT_ID, address: merchant.address }, environment.jwtSecret);

describe('authenticateMerchant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('attaches the merchant and calls next() for a valid JWT', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(merchant as any);
    const req = buildReq(`Bearer ${validToken()}`);
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await authenticateMerchant(req, res, next);

    expect(prismaMock.merchant.findUnique).toHaveBeenCalledWith({ where: { id: MERCHANT_ID } });
    expect(req.merchant).toEqual(merchant);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 401 "Authentication required" when the Authorization header is missing', async () => {
    const req = buildReq();
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await authenticateMerchant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 "Authentication required" when the scheme is not Bearer', async () => {
    const req = buildReq('Basic abc123');
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await authenticateMerchant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
  });

  test('returns 401 "Invalid or expired token" for a malformed token', async () => {
    const req = buildReq('Bearer not-a-real-jwt');
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await authenticateMerchant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(prismaMock.merchant.findUnique).not.toHaveBeenCalled();
  });

  test('returns 401 "Invalid or expired token" for an expired token', async () => {
    const expired = jwt.sign({ sub: MERCHANT_ID }, environment.jwtSecret, { expiresIn: '-1s' });
    const req = buildReq(`Bearer ${expired}`);
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await authenticateMerchant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });

  test('returns 401 "Invalid or expired token" when the token is signed with the wrong secret', async () => {
    const forged = jwt.sign({ sub: MERCHANT_ID }, 'a-different-secret');
    const req = buildReq(`Bearer ${forged}`);
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await authenticateMerchant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });

  test('returns 401 when the merchant no longer exists in the database', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(null);
    const req = buildReq(`Bearer ${validToken()}`);
    const res = buildRes();
    const next = jest.fn() as unknown as NextFunction;

    await authenticateMerchant(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });
});
