import { mockReset } from 'jest-mock-extended';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { createInvoice, listInvoices, getInvoice, voidInvoice } = await import(
  '../../src/services/invoice.services.js'
);

const MERCHANT_ID = 'merchant-1';

const baseInvoice = {
  id: 'invoice-1',
  invoiceId: null,
  paymentSlug: 'slug-1',
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

describe('invoice services', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  describe('createInvoice', () => {
    test('creates a PENDING invoice with a generated url-safe slug', async () => {
      prismaMock.invoice.create.mockImplementation(async (args: any) => ({
        ...baseInvoice,
        ...args.data,
      }));

      const result = await createInvoice(MERCHANT_ID, {
        description: 'Website design',
        amount: '5000',
        token: 'USDC',
      });

      expect(result.status).toBe('PENDING');
      expect(result.amount).toBe('5000');
      expect(typeof result.paymentSlug).toBe('string');
      expect(result.paymentSlug).toMatch(/^[A-Za-z0-9_-]+$/);

      const createArgs = prismaMock.invoice.create.mock.calls[0][0];
      expect(createArgs.data.amount).toBe(5000n);
      expect(createArgs.data.merchantId).toBe(MERCHANT_ID);
    });

    test('creates a DRAFT invoice when isDraft is true', async () => {
      prismaMock.invoice.create.mockImplementation(async (args: any) => ({
        ...baseInvoice,
        ...args.data,
      }));

      const result = await createInvoice(MERCHANT_ID, {
        description: 'Draft job',
        amount: 100,
        token: 'XLM',
        isDraft: true,
      });

      expect(result.status).toBe('DRAFT');
    });

    test('rejects a non-positive amount with a 400', async () => {
      await expect(
        createInvoice(MERCHANT_ID, { description: 'x', amount: 0, token: 'USDC' }),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    });
  });

  describe('listInvoices', () => {
    test('scopes results to the merchant and returns pagination metadata', async () => {
      prismaMock.invoice.findMany.mockResolvedValue([baseInvoice] as any);
      prismaMock.invoice.count.mockResolvedValue(1 as any);

      const result = await listInvoices(
        MERCHANT_ID,
        { status: 'PENDING' as any },
        { limit: 20, offset: 0 },
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0].amount).toBe('5000');
      expect(result.pagination).toEqual({ limit: 20, offset: 0, total: 1 });

      const findArgs = prismaMock.invoice.findMany.mock.calls[0][0];
      expect(findArgs.where).toMatchObject({ merchantId: MERCHANT_ID, status: 'PENDING' });
      expect(findArgs.take).toBe(20);
      expect(findArgs.skip).toBe(0);
    });
  });

  describe('getInvoice', () => {
    test('returns the invoice when it belongs to the merchant', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(baseInvoice as any);

      const result = await getInvoice(MERCHANT_ID, 'invoice-1');

      expect(result.id).toBe('invoice-1');
      expect(prismaMock.invoice.findFirst).toHaveBeenCalledWith({
        where: { id: 'invoice-1', merchantId: MERCHANT_ID },
      });
    });

    test('throws 404 when the invoice is missing or owned by another merchant', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(null);

      await expect(getInvoice(MERCHANT_ID, 'missing')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('voidInvoice', () => {
    test('voids a PENDING invoice and sets status CANCELLED', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(baseInvoice as any);
      prismaMock.invoice.update.mockResolvedValue({
        ...baseInvoice,
        status: 'CANCELLED',
      } as any);

      const result = await voidInvoice(MERCHANT_ID, 'invoice-1');

      expect(result.status).toBe('CANCELLED');
      expect(prismaMock.invoice.update).toHaveBeenCalledWith({
        where: { id: 'invoice-1' },
        data: { status: 'CANCELLED' },
      });
    });

    test('throws 400 when voiding a non-PENDING invoice', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue({
        ...baseInvoice,
        status: 'PAID',
      } as any);

      await expect(voidInvoice(MERCHANT_ID, 'invoice-1')).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(prismaMock.invoice.update).not.toHaveBeenCalled();
    });

    test('throws 404 when the invoice does not belong to the merchant', async () => {
      prismaMock.invoice.findFirst.mockResolvedValue(null);

      await expect(voidInvoice(MERCHANT_ID, 'invoice-1')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
