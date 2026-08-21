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

const merchant = {
  id: 'merchant-1',
  merchantId: 1,
  address: 'GMERCHANTADDRESS',
  account: null,
  merchantKey: null,
  email: 'merchant@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  businessName: 'Engines',
  category: 'software',
  description: 'desc',
  logo: null,
  webhook: null,
  active: true,
  verified: false,
  emailVerified: true,
  registered: true,
  emailOtp: null,
  emailOtpExpiresAt: null,
  createdAt: new Date('2026-06-27T12:00:00.000Z'),
  updatedAt: new Date('2026-06-27T12:00:00.000Z'),
};

const adminToken = jwt.sign(
  { sub: admin.id, address: admin.address, type: 'admin' },
  environment.jwtSecret,
  { expiresIn: '15m' },
);

describe('PATCH /api/v1/admin/merchants/:id/block', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    prismaMock.admin.findUnique.mockResolvedValue(admin);
  });

  test('returns 401 when unauthenticated', async () => {
    const response = await request(app).patch('/api/v1/admin/merchants/merchant-1/block');

    expect(response.status).toBe(401);
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
  });

  test('sets active to false, returns the merchant, and logs the action', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(merchant);
    prismaMock.merchant.update.mockResolvedValue({ ...merchant, active: false });

    const response = await request(app)
      .patch('/api/v1/admin/merchants/merchant-1/block')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.active).toBe(false);
    expect(prismaMock.merchant.update).toHaveBeenCalledWith({
      where: { id: 'merchant-1' },
      data: { active: false },
    });
    expect(prismaMock.adminLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'merchant.blocked',
        actorType: 'ADMIN',
        actorId: admin.id,
        actorLabel: admin.address,
        targetType: 'Merchant',
        targetId: 'merchant-1',
      }),
    });
  });

  test('returns 404 when the merchant does not exist', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .patch('/api/v1/admin/merchants/missing/block')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(prismaMock.merchant.update).not.toHaveBeenCalled();
    expect(prismaMock.adminLog.create).not.toHaveBeenCalled();
  });
});
