import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const sendInvoiceEmailMock = jest.fn(async () => undefined);

jest.unstable_mockModule('../../src/services/email.service.js', () => ({
  __esModule: true,
  sendOtp: jest.fn(async () => undefined),
  sendInvoiceEmail: sendInvoiceEmailMock,
}));

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { environment } = await import('../../src/config/environment.js');
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
  prismaMock.merchant.findUnique.mockResolvedValue(merchant as any);
};

const accessToken = jwt.sign(
  { sub: MERCHANT_ID, address: merchant.address },
  environment.jwtSecret,
);
const auth = { Authorization: `Bearer ${accessToken}` };

describe('Invoice routes', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    sendInvoiceEmailMock.mockClear();
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
      expect(prismaMock.adminLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'invoice.created',
          actorType: 'MERCHANT',
          actorId: MERCHANT_ID,
          targetType: 'Invoice',
          targetId: response.body.id,
        }),
      });
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

  describe('PATCH /api/v1/invoices/:id/amend', () => {
    test('amends a PENDING invoice with the provided fields', async () => {
      authenticate();
      prismaMock.invoice.findFirst.mockResolvedValue(baseInvoice as any);
      prismaMock.invoice.update.mockResolvedValue({
        ...baseInvoice,
        email: 'payer@example.com',
        amount: 2000n,
        description: 'Updated website design',
      } as any);

      const response = await request(app)
        .patch('/api/v1/invoices/invoice-1/amend')
        .set(auth)
        .send({ email: 'payer@example.com', amount: '2000', description: 'Updated website design' });

      expect(response.status).toBe(200);
      expect(response.body.email).toBe('payer@example.com');
      expect(response.body.amount).toBe('2000');
      expect(response.body.description).toBe('Updated website design');
      expect(prismaMock.adminLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'invoice.amended',
          actorType: 'MERCHANT',
          actorId: MERCHANT_ID,
          targetType: 'Invoice',
          targetId: 'invoice-1',
        }),
      });
    });

    test('returns 400 when amending a non-PENDING invoice', async () => {
      authenticate();
      prismaMock.invoice.findFirst.mockResolvedValue({
        ...baseInvoice,
        status: 'PAID',
      } as any);

      const response = await request(app)
        .patch('/api/v1/invoices/invoice-1/amend')
        .set(auth)
        .send({ description: 'Updated' });

      expect(response.status).toBe(400);
      expect(prismaMock.invoice.update).not.toHaveBeenCalled();
    });

    test('returns 404 when the invoice is not owned by the merchant', async () => {
      authenticate();
      prismaMock.invoice.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .patch('/api/v1/invoices/invoice-1/amend')
        .set(auth)
        .send({ description: 'Updated' });

      expect(response.status).toBe(404);
    });

    test('returns 400 for an invalid amount', async () => {
      authenticate();
      prismaMock.invoice.findFirst.mockResolvedValue(baseInvoice as any);

      const response = await request(app)
        .patch('/api/v1/invoices/invoice-1/amend')
        .set(auth)
        .send({ amount: '0' });

      expect(response.status).toBe(400);
      expect(prismaMock.invoice.update).not.toHaveBeenCalled();
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
      expect(prismaMock.adminLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'invoice.voided',
          actorType: 'MERCHANT',
          actorId: MERCHANT_ID,
          targetType: 'Invoice',
          targetId: 'invoice-1',
        }),
      });
    });

    test('still voids the invoice and returns 200 when the audit log write fails', async () => {
      authenticate();
      prismaMock.invoice.findFirst.mockResolvedValue(baseInvoice as any);
      prismaMock.invoice.update.mockResolvedValue({
        ...baseInvoice,
        status: 'CANCELLED',
      } as any);
      prismaMock.adminLog.create.mockRejectedValue(new Error('connection reset'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const response = await request(app).patch('/api/v1/invoices/invoice-1/void').set(auth);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('CANCELLED');
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
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

  describe('GET /api/v1/invoices/:id/pdf', () => {
    test('returns 401 when unauthenticated', async () => {
      const response = await request(app).get('/api/v1/invoices/invoice-1/pdf');

      expect(response.status).toBe(401);
    });

    test('returns 404 when the invoice is missing or owned by another merchant', async () => {
      authenticate();
      prismaMock.invoice.findFirst.mockResolvedValue(null);

      const response = await request(app).get('/api/v1/invoices/other/pdf').set(auth);

      expect(response.status).toBe(404);
    });

    test('streams a real PDF scoped to the authenticated merchant, never touching disk', async () => {
      authenticate();
      prismaMock.invoice.findFirst.mockResolvedValue({ ...baseInvoice, merchant } as any);

      const response = await request(app).get('/api/v1/invoices/invoice-1/pdf').set(auth);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toBe(
        `attachment; filename="invoice-${baseInvoice.paymentSlug}.pdf"`,
      );
      const body = response.body as Buffer;
      expect(Buffer.isBuffer(body)).toBe(true);
      expect(body.subarray(0, 5).toString('ascii')).toBe('%PDF-');

      const findArgs = prismaMock.invoice.findFirst.mock.calls[0][0];
      expect(findArgs.where).toMatchObject({ id: 'invoice-1', merchantId: MERCHANT_ID });
    });
  });

  describe('POST /api/v1/invoices/:id/send', () => {
    test('returns 401 when unauthenticated', async () => {
      const response = await request(app).post('/api/v1/invoices/invoice-1/send');

      expect(response.status).toBe(401);
      expect(sendInvoiceEmailMock).not.toHaveBeenCalled();
    });

    test('returns 404 when the invoice is missing or owned by another merchant', async () => {
      authenticate();
      prismaMock.invoice.findFirst.mockResolvedValue(null);

      const response = await request(app).post('/api/v1/invoices/other/send').set(auth);

      expect(response.status).toBe(404);
      expect(sendInvoiceEmailMock).not.toHaveBeenCalled();
    });

    test('returns 400 and does not attempt to send when the invoice has no email set', async () => {
      authenticate();
      prismaMock.invoice.findFirst.mockResolvedValue({
        ...baseInvoice,
        email: null,
        merchant,
      } as any);

      const response = await request(app).post('/api/v1/invoices/invoice-1/send').set(auth);

      expect(response.status).toBe(400);
      expect(sendInvoiceEmailMock).not.toHaveBeenCalled();
    });

    test('sends the invoice email when invoice.email is set', async () => {
      authenticate();
      const invoiceWithEmail = { ...baseInvoice, email: 'payer@example.com', merchant };
      prismaMock.invoice.findFirst.mockResolvedValue(invoiceWithEmail as any);

      const response = await request(app).post('/api/v1/invoices/invoice-1/send').set(auth);

      expect(response.status).toBe(200);
      expect(sendInvoiceEmailMock).toHaveBeenCalledWith(invoiceWithEmail, merchant);
      expect(prismaMock.adminLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'invoice.email_sent',
          actorType: 'MERCHANT',
          actorId: MERCHANT_ID,
          targetType: 'Invoice',
          targetId: 'invoice-1',
        }),
      });
    });
  });
});
