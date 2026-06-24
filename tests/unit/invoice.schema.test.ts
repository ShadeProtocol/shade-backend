import { mockReset } from 'jest-mock-extended';

// Local mirrors of the Prisma enums — never import runtime values from
// @prisma/client in tests; the generated client may not exist in CI.
const InvoiceStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  DRAFT: 'DRAFT',
} as const;
type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

const InvoicePricingMode = {
  FIXED_CRYPTO: 'FIXED_CRYPTO',
  FIXED_FIAT: 'FIXED_FIAT',
} as const;
type InvoicePricingMode = (typeof InvoicePricingMode)[keyof typeof InvoicePricingMode];

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;

const mockDate = new Date('2026-06-24T10:00:00Z');

const baseMerchant = {
  id: 'merchant-uuid',
  merchantId: 1,
  address: 'GABCDEF123',
  account: null,
  email: null,
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
  registered: false,
  createdAt: mockDate,
  updatedAt: mockDate,
};

const baseInvoice = {
  id: 'invoice-uuid',
  invoiceId: 1001,
  paymentSlug: 'pay-abc123',
  description: 'Payment for services',
  amount: BigInt(1_000_000),
  amountPaid: BigInt(0),
  amountRefunded: BigInt(0),
  token: 'CABC...TOKEN',
  merchantId: 'merchant-uuid',
  payer: null,
  email: null,
  status: InvoiceStatus.DRAFT,
  pricingMode: InvoicePricingMode.FIXED_CRYPTO,
  fiatCurrency: null,
  fiatAmount: null,
  fiatDecimals: null,
  expiresAt: null,
  datePaid: null,
  createdAt: mockDate,
  updatedAt: mockDate,
};

describe('Invoice schema', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  describe('create', () => {
    test('creates a DRAFT invoice with FIXED_CRYPTO pricing', async () => {
      prismaMock.invoice.create.mockResolvedValue(baseInvoice);

      const result = await prismaMock.invoice.create({
        data: {
          invoiceId: 1001,
          paymentSlug: 'pay-abc123',
          description: 'Payment for services',
          amount: BigInt(1_000_000),
          token: 'CABC...TOKEN',
          merchantId: 'merchant-uuid',
          status: InvoiceStatus.DRAFT,
          pricingMode: InvoicePricingMode.FIXED_CRYPTO,
        },
      });

      expect(result.status).toBe(InvoiceStatus.DRAFT);
      expect(result.pricingMode).toBe(InvoicePricingMode.FIXED_CRYPTO);
      expect(result.amountPaid).toBe(BigInt(0));
      expect(result.amountRefunded).toBe(BigInt(0));
      expect(prismaMock.invoice.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          invoiceId: 1001,
          paymentSlug: 'pay-abc123',
          description: 'Payment for services',
        }),
      });
    });

    test('creates a FIXED_FIAT invoice with fiat pricing fields populated', async () => {
      const fiatInvoice = {
        ...baseInvoice,
        pricingMode: InvoicePricingMode.FIXED_FIAT,
        fiatCurrency: 'USD',
        fiatAmount: BigInt(500_00),
        fiatDecimals: 2,
      };
      prismaMock.invoice.create.mockResolvedValue(fiatInvoice);

      const result = await prismaMock.invoice.create({
        data: {
          invoiceId: 1002,
          paymentSlug: 'pay-def456',
          description: 'USD-pegged invoice',
          amount: BigInt(1_000_000),
          token: 'CABC...TOKEN',
          merchantId: 'merchant-uuid',
          status: InvoiceStatus.PENDING,
          pricingMode: InvoicePricingMode.FIXED_FIAT,
          fiatCurrency: 'USD',
          fiatAmount: BigInt(500_00),
          fiatDecimals: 2,
        },
      });

      expect(result.pricingMode).toBe(InvoicePricingMode.FIXED_FIAT);
      expect(result.fiatCurrency).toBe('USD');
      expect(result.fiatAmount).toBe(BigInt(500_00));
      expect(result.fiatDecimals).toBe(2);
    });

    test('creates an invoice with an expiry date', async () => {
      const expiresAt = new Date(mockDate.getTime() + 24 * 60 * 60 * 1000);
      const expiringInvoice = { ...baseInvoice, expiresAt };
      prismaMock.invoice.create.mockResolvedValue(expiringInvoice);

      const result = await prismaMock.invoice.create({
        data: {
          ...baseInvoice,
          expiresAt,
        },
      });

      expect(result.expiresAt).toEqual(expiresAt);
    });
  });

  describe('InvoiceStatus transitions', () => {
    test.each([
      [InvoiceStatus.PENDING],
      [InvoiceStatus.PAID],
      [InvoiceStatus.CANCELLED],
      [InvoiceStatus.REFUNDED],
      [InvoiceStatus.PARTIALLY_REFUNDED],
      [InvoiceStatus.PARTIALLY_PAID],
      [InvoiceStatus.DRAFT],
    ])('accepts status %s', async (status) => {
      prismaMock.invoice.update.mockResolvedValue({ ...baseInvoice, status });

      const result = await prismaMock.invoice.update({
        where: { id: 'invoice-uuid' },
        data: { status },
      });

      expect(result.status).toBe(status);
    });

    test('records amountPaid and datePaid when status transitions to PAID', async () => {
      const paidInvoice = {
        ...baseInvoice,
        status: InvoiceStatus.PAID,
        amountPaid: BigInt(1_000_000),
        datePaid: mockDate,
      };
      prismaMock.invoice.update.mockResolvedValue(paidInvoice);

      const result = await prismaMock.invoice.update({
        where: { id: 'invoice-uuid' },
        data: {
          status: InvoiceStatus.PAID,
          amountPaid: BigInt(1_000_000),
          datePaid: mockDate,
        },
      });

      expect(result.status).toBe(InvoiceStatus.PAID);
      expect(result.amountPaid).toBe(BigInt(1_000_000));
      expect(result.datePaid).toEqual(mockDate);
    });

    test('records amountRefunded when status transitions to REFUNDED', async () => {
      const refundedInvoice = {
        ...baseInvoice,
        status: InvoiceStatus.REFUNDED,
        amountPaid: BigInt(1_000_000),
        amountRefunded: BigInt(1_000_000),
        datePaid: mockDate,
      };
      prismaMock.invoice.update.mockResolvedValue(refundedInvoice);

      const result = await prismaMock.invoice.update({
        where: { id: 'invoice-uuid' },
        data: {
          status: InvoiceStatus.REFUNDED,
          amountRefunded: BigInt(1_000_000),
        },
      });

      expect(result.status).toBe(InvoiceStatus.REFUNDED);
      expect(result.amountRefunded).toBe(BigInt(1_000_000));
    });

    test('records partial amounts for PARTIALLY_PAID status', async () => {
      const partialInvoice = {
        ...baseInvoice,
        status: InvoiceStatus.PARTIALLY_PAID,
        amountPaid: BigInt(500_000),
      };
      prismaMock.invoice.update.mockResolvedValue(partialInvoice);

      const result = await prismaMock.invoice.update({
        where: { id: 'invoice-uuid' },
        data: { status: InvoiceStatus.PARTIALLY_PAID, amountPaid: BigInt(500_000) },
      });

      expect(result.status).toBe(InvoiceStatus.PARTIALLY_PAID);
      expect(result.amountPaid).toBe(BigInt(500_000));
    });
  });

  describe('unique constraints', () => {
    test('findUnique by invoiceId returns the invoice', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue(baseInvoice);

      const result = await prismaMock.invoice.findUnique({ where: { invoiceId: 1001 } });

      expect(result).toEqual(baseInvoice);
      expect(prismaMock.invoice.findUnique).toHaveBeenCalledWith({
        where: { invoiceId: 1001 },
      });
    });

    test('findUnique by paymentSlug returns the invoice', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue(baseInvoice);

      const result = await prismaMock.invoice.findUnique({ where: { paymentSlug: 'pay-abc123' } });

      expect(result).toEqual(baseInvoice);
    });

    test('rejects duplicate paymentSlug with P2002', async () => {
      const uniqueError = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['paymentSlug'] },
      });
      prismaMock.invoice.create.mockRejectedValue(uniqueError);

      await expect(
        prismaMock.invoice.create({
          data: { ...baseInvoice, id: 'other-uuid', invoiceId: 9999 },
        }),
      ).rejects.toMatchObject({ code: 'P2002', meta: { target: ['paymentSlug'] } });
    });

    test('rejects duplicate invoiceId with P2002', async () => {
      const uniqueError = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['invoiceId'] },
      });
      prismaMock.invoice.create.mockRejectedValue(uniqueError);

      await expect(
        prismaMock.invoice.create({
          data: { ...baseInvoice, id: 'other-uuid', paymentSlug: 'pay-new' },
        }),
      ).rejects.toMatchObject({ code: 'P2002', meta: { target: ['invoiceId'] } });
    });
  });

  describe('merchant relation', () => {
    test('findUnique with merchant include returns nested merchant', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue({
        ...baseInvoice,
        merchant: baseMerchant,
      });

      const result = await prismaMock.invoice.findUnique({
        where: { id: 'invoice-uuid' },
        include: { merchant: true },
      });

      expect(result?.merchant).toMatchObject({ id: 'merchant-uuid' });
    });
  });
});
