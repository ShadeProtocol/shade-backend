import { mockReset } from 'jest-mock-extended';
import request from 'supertest';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { default: app } = await import('../../src/app.js');

const MERCHANT_ID = 'merchant-1';

const merchant = {
  id: MERCHANT_ID,
  merchantId: 1,
  address: '0x123',
  account: null,
  email: 'merchant@example.com',
  firstName: null,
  lastName: null,
  businessName: null,
  category: null,
  description: null,
  logo: null,
  webhook: null,
  active: true,
  verified: false,
  emailVerified: false,
  registered: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseInvoice = {
  id: 'invoice-1',
  invoiceId: null,
  paymentSlug: 'aZ09-_slug',
  description: 'Website design',
  amount: 5000n,
  token: 'USDC',
  merchantId: MERCHANT_ID,
  status: 'PENDING',
  ref: null,
  payer: null,
  payerEmail: null,
  email: null,
  expiresAt: null,
  datePaid: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const authenticate = () => {
  prismaMock.refreshToken.findUnique.mockResolvedValue({
    id: 'session-1',
    merchantId: MERCHANT_ID,
    token: 'valid-token',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date(),
    merchant,
  } as any);
};

const auth = { Authorization: 'Bearer valid-token' };

describe('Invoice routes', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  describe('POST /api/v1/invoices', () => {
    test('returns 401 when unauthenticated', async () => {
      const response = await request(app)
        .post('/api/v1/invoices')
        .send({ description: 'x', amount: '100', token: 'USDC' });

      expect(response.status).toBe(401);
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });

    test('returns 201 with a unique url-safe paymentSlug', async () => {
      authenticate();
      prismaMock.invoice.create.mockImplementation(async (args: any) => ({
        ...baseInvoice,
        ...args.data,
      }));

      const response = await request(app)
        .post('/api/v1/invoices')
        .set(auth)
        .send({ description: 'Website design', amount: '5000', token: 'USDC' });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('PENDING');
      expect(response.body.amount).toBe('5000');
      expect(response.body.paymentSlug).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test('creates a DRAFT invoice when isDraft is true', async () => {
      authenticate();
      prismaMock.invoice.create.mockImplementation(async (args: any) => ({
        ...baseInvoice,
        ...args.data,
      }));

      const response = await request(app)
        .post('/api/v1/invoices')
        .set(auth)
        .send({ description: 'Draft', amount: '5000', token: 'USDC', isDraft: true });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('DRAFT');
    });

    test('returns 400 when amount is not positive or token is empty', async () => {
      authenticate();

      const response = await request(app)
        .post('/api/v1/invoices')
        .set(auth)
        .send({ description: 'x', amount: -5, token: '' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toMatchObject({
        amount: expect.any(String),
        token: expect.any(String),
      });
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/invoices', () => {
    test('returns a paginated list scoped to the merchant with status filter', async () => {
      authenticate();
      prismaMock.invoice.findMany.mockResolvedValue([baseInvoice] as any);
      prismaMock.invoice.count.mockResolvedValue(1 as any);

      const response = await request(app)
        .get('/api/v1/invoices?status=PENDING&limit=10&offset=0')
        .set(auth);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination).toEqual({ limit: 10, offset: 0, total: 1 });

      const findArgs = prismaMock.invoice.findMany.mock.calls[0][0];
      expect(findArgs.where).toMatchObject({ merchantId: MERCHANT_ID, status: 'PENDING' });
    });

    test('clamps limit to the maximum of 100', async () => {
      authenticate();
      prismaMock.invoice.findMany.mockResolvedValue([] as any);
      prismaMock.invoice.count.mockResolvedValue(0 as any);

      const response = await request(app).get('/api/v1/invoices?limit=500').set(auth);

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(100);
    });
  });

  describe('GET /api/v1/invoices/:id', () => {
    test('returns 200 when the invoice belongs to the merchant', async () => {
      authenticate();
      prismaMock.invoice.findFirst.mockResolvedValue(baseInvoice as any);

      const response = await request(app).get('/api/v1/invoices/invoice-1').set(auth);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('invoice-1');
    });

    test('returns 404 when the invoice is missing or owned by another merchant', async () => {
      authenticate();
      prismaMock.invoice.findFirst.mockResolvedValue(null);

      const response = await request(app).get('/api/v1/invoices/other').set(auth);

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/invoices/:id/void', () => {
    test('voids a PENDING invoice', async () => {
      authenticate();
      prismaMock.invoice.findFirst.mockResolvedValue(baseInvoice as any);
      prismaMock.invoice.update.mockResolvedValue({
        ...baseInvoice,
        status: 'CANCELLED',
      } as any);

      const response = await request(app).patch('/api/v1/invoices/invoice-1/void').set(auth);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('CANCELLED');
    });

    test('returns 400 when voiding a non-PENDING invoice', async () => {
      authenticate();
      prismaMock.invoice.findFirst.mockResolvedValue({
        ...baseInvoice,
        status: 'PAID',
      } as any);

      const response = await request(app).patch('/api/v1/invoices/invoice-1/void').set(auth);

      expect(response.status).toBe(400);
      expect(prismaMock.invoice.update).not.toHaveBeenCalled();
    });
  });
});
