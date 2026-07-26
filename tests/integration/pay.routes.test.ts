import { mockReset } from 'jest-mock-extended';
import request from 'supertest';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { default: app } = await import('../../src/app.js');

const merchant = {
  id: 'merchant-1',
  merchantId: 1,
  address: '0x123',
  account: null,
  merchantKey: null,
  email: 'merchant@example.com',
  firstName: null,
  lastName: null,
  businessName: 'Analytical Engines',
  category: null,
  description: null,
  logo: null,
  webhook: null,
  active: true,
  verified: false,
  emailVerified: false,
  registered: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const baseInvoice = {
  id: 'invoice-1',
  invoiceId: null,
  paymentSlug: 'pay-slug-1',
  description: 'Website design',
  amount: 5000n,
  amountPaid: 0n,
  amountRefunded: 0n,
  token: 'USDC',
  merchantId: merchant.id,
  payer: null,
  email: null,
  status: 'PENDING',
  pricingMode: 'FIXED_CRYPTO',
  fiatCurrency: null,
  fiatAmount: null,
  fiatDecimals: null,
  expiresAt: null,
  datePaid: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('Pay routes', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  describe('GET /api/v1/pay/:slug/pdf', () => {
    test('returns 404 when the invoice does not exist', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue(null);

      const response = await request(app).get('/api/v1/pay/missing-slug/pdf');

      expect(response.status).toBe(404);
    });

    test.each(['CANCELLED', 'PAID', 'REFUNDED'])(
      'returns 410 when the invoice status is %s',
      async status => {
        prismaMock.invoice.findUnique.mockResolvedValue({
          ...baseInvoice,
          status,
          merchant,
        } as any);

        const response = await request(app).get(`/api/v1/pay/${baseInvoice.paymentSlug}/pdf`);

        expect(response.status).toBe(410);
      },
    );

    test('returns 410 with reason "expired" when past expiresAt', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue({
        ...baseInvoice,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
        merchant,
      } as any);

      const response = await request(app).get(`/api/v1/pay/${baseInvoice.paymentSlug}/pdf`);

      expect(response.status).toBe(410);
      expect(response.body).toEqual({ reason: 'expired' });
    });

    test('returns a real, valid PDF for a publicly visible invoice', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue({ ...baseInvoice, merchant } as any);

      const response = await request(app).get(`/api/v1/pay/${baseInvoice.paymentSlug}/pdf`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
      expect(response.headers['content-disposition']).toBe(
        `attachment; filename="invoice-${baseInvoice.paymentSlug}.pdf"`,
      );
      const body = response.body as Buffer;
      expect(Buffer.isBuffer(body)).toBe(true);
      expect(body.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    });
  });
});
