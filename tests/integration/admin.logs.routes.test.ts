import { beforeEach } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { environment } = await import('../../src/config/environment.js');
const { default: app } = await import('../../src/app.js');

const admin = {
  id: 'admin-uuid',
  address: 'GADMINADDRESS',
  active: true,
  isSuperAdmin: false,
  createdAt: new Date('2026-06-27T12:00:00.000Z'),
  updatedAt: new Date('2026-06-27T12:00:00.000Z'),
};

const superAdmin = { ...admin, id: 'super-admin-uuid', isSuperAdmin: true };

const adminToken = jwt.sign(
  { sub: admin.id, address: admin.address, type: 'admin' },
  environment.jwtSecret,
  { expiresIn: '15m' },
);

const logRow = {
  id: 'log-1',
  action: 'invoice.voided',
  actorType: 'MERCHANT',
  actorId: 'merchant-1',
  actorLabel: 'Acme',
  targetType: 'Invoice',
  targetId: 'invoice-1',
  metadata: null,
  createdAt: new Date('2026-06-27T12:00:00.000Z'),
};

describe('GET /api/v1/admin/logs', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    prismaMock.admin.findUnique.mockResolvedValue(admin);
    prismaMock.adminLog.findMany.mockResolvedValue([logRow]);
    prismaMock.adminLog.count.mockResolvedValue(1);
  });

  test('returns 401 when unauthenticated', async () => {
    const response = await request(app).get('/api/v1/admin/logs');

    expect(response.status).toBe(401);
  });

  test('does not require superadmin — a regular authenticated admin can read logs', async () => {
    const response = await request(app)
      .get('/api/v1/admin/logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
  });

  test('a superadmin can also read logs', async () => {
    prismaMock.admin.findUnique.mockResolvedValue(superAdmin);
    const superAdminToken = jwt.sign(
      { sub: superAdmin.id, address: superAdmin.address, type: 'admin' },
      environment.jwtSecret,
      { expiresIn: '15m' },
    );

    const response = await request(app)
      .get('/api/v1/admin/logs')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(response.status).toBe(200);
  });

  test('returns entries newest-first by default with default pagination', async () => {
    const response = await request(app)
      .get('/api/v1/admin/logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.pagination).toEqual({ limit: 20, offset: 0, total: 1 });
    expect(prismaMock.adminLog.findMany).toHaveBeenCalledWith({
      where: {},
      take: 20,
      skip: 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  test('applies action, actorType, actorId, targetType, targetId, from/to, and pagination filters', async () => {
    const response = await request(app)
      .get('/api/v1/admin/logs')
      .query({
        action: 'invoice.voided',
        actorType: 'merchant',
        actorId: 'merchant-1',
        targetType: 'Invoice',
        targetId: 'invoice-1',
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-30T00:00:00.000Z',
        limit: 5,
        offset: 10,
      })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(prismaMock.adminLog.findMany).toHaveBeenCalledWith({
      where: {
        action: 'invoice.voided',
        actorType: 'MERCHANT',
        actorId: 'merchant-1',
        targetType: 'Invoice',
        targetId: 'invoice-1',
        createdAt: {
          gte: new Date('2026-06-01T00:00:00.000Z'),
          lte: new Date('2026-06-30T00:00:00.000Z'),
        },
      },
      take: 5,
      skip: 10,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  });

  test('clamps limit to the maximum of 100', async () => {
    const response = await request(app)
      .get('/api/v1/admin/logs?limit=500')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.pagination.limit).toBe(100);
  });

  test('returns 400 for an invalid actorType', async () => {
    const response = await request(app)
      .get('/api/v1/admin/logs?actorType=NOT_REAL')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
    expect(response.body.errors).toHaveProperty('actorType');
  });
});
