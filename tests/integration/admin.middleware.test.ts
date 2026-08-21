import { beforeEach } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { environment } = await import('../../src/config/environment.js');
const { authenticateAdmin, requireSuperAdmin } = await import(
  '../../src/middlewares/admin.middleware.js'
);

const admin = {
  id: 'admin-uuid',
  address: 'GABCDEF123',
  active: true,
  isSuperAdmin: false,
  createdAt: new Date('2026-06-27T12:00:00.000Z'),
  updatedAt: new Date('2026-06-27T12:00:00.000Z'),
};

const buildApp = () => {
  const app = express();
  app.get('/protected', authenticateAdmin, (req, res) => {
    res.status(200).json({ adminId: req.admin?.id });
  });
  app.get('/super-only', authenticateAdmin, requireSuperAdmin, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
};

const adminToken = (overrides: Record<string, unknown> = {}) =>
  jwt.sign({ sub: admin.id, address: admin.address, type: 'admin', ...overrides }, environment.jwtSecret, {
    expiresIn: '15m',
  });

describe('authenticateAdmin', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  test('accepts a valid admin JWT and attaches req.admin', async () => {
    prismaMock.admin.findUnique.mockResolvedValue(admin);

    const response = await request(buildApp())
      .get('/protected')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ adminId: admin.id });
    expect(prismaMock.admin.findUnique).toHaveBeenCalledWith({ where: { id: admin.id } });
  });

  test('rejects a structurally valid merchant JWT missing the admin claim', async () => {
    const merchantToken = jwt.sign(
      { sub: admin.id, address: admin.address },
      environment.jwtSecret,
      { expiresIn: '15m' },
    );

    const response = await request(buildApp())
      .get('/protected')
      .set('Authorization', `Bearer ${merchantToken}`);

    expect(response.status).toBe(401);
    expect(prismaMock.admin.findUnique).not.toHaveBeenCalled();
  });

  test('rejects a token for an unknown admin', async () => {
    prismaMock.admin.findUnique.mockResolvedValue(null);

    const response = await request(buildApp())
      .get('/protected')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(response.status).toBe(401);
  });

  test('rejects a token for a deactivated admin', async () => {
    prismaMock.admin.findUnique.mockResolvedValue({ ...admin, active: false });

    const response = await request(buildApp())
      .get('/protected')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(response.status).toBe(401);
  });

  test('rejects when the Authorization header is missing', async () => {
    const response = await request(buildApp()).get('/protected');

    expect(response.status).toBe(401);
  });

  test('rejects a garbage token', async () => {
    const response = await request(buildApp())
      .get('/protected')
      .set('Authorization', 'Bearer not-a-jwt');

    expect(response.status).toBe(401);
  });
});

describe('requireSuperAdmin', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  test('rejects a non-superadmin authenticated admin with 403', async () => {
    prismaMock.admin.findUnique.mockResolvedValue({ ...admin, isSuperAdmin: false });

    const response = await request(buildApp())
      .get('/super-only')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(response.status).toBe(403);
  });

  test('allows a superadmin through', async () => {
    prismaMock.admin.findUnique.mockResolvedValue({ ...admin, isSuperAdmin: true });

    const response = await request(buildApp())
      .get('/super-only')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});
