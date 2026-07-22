import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { applyInvoicePayment } = await import('../../src/services/invoice.services.js');

const MERCHANT_ID = 'merchant-uuid-1';

const baseInvoice = {
  id: 'invoice-uuid-1',
  invoiceId: 42,
  paymentSlug: 'slug-1',
  description: 'Website design',
  amount: 10000n,
  amountPaid: 0n,
  amountRefunded: 0n,
  token: 'CTOKEN',
  merchantId: MERCHANT_ID,
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

const baseEvent = {
  invoiceId: '42',
  merchantId: '7',
  merchantAccount: 'GMERCHANT',
  payer: 'GPAYER',
  amount: '10000',
  fee: '100',
  merchantAmount: '9900',
  token: 'CTOKEN',
  timestamp: 1_760_000_000,
};

const TX_HASH = 'abc123txhash';

describe('applyInvoicePayment', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    prismaMock.$transaction.mockResolvedValue([]);
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('partial payment sets PARTIALLY_PAID and does not stamp datePaid', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({ ...baseInvoice, amount: 10000n, amountPaid: 0n });
    prismaMock.merchant.findUnique.mockResolvedValue({ id: MERCHANT_ID });

    await applyInvoicePayment({ ...baseEvent, amount: '4000' }, TX_HASH);

    expect(prismaMock.invoice.findUnique).toHaveBeenCalledWith({ where: { invoiceId: 42 } });
    const updateArgs = prismaMock.invoice.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'invoice-uuid-1' });
    expect(updateArgs.data.status).toBe('PARTIALLY_PAID');
    expect(updateArgs.data.amountPaid).toBe(4000n);
    expect(updateArgs.data.payer).toBe('GPAYER');
    expect('datePaid' in updateArgs.data).toBe(false);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  test('full payment sets PAID and stamps datePaid from event timestamp', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({ ...baseInvoice, amount: 10000n, amountPaid: 6000n });
    prismaMock.merchant.findUnique.mockResolvedValue({ id: MERCHANT_ID });

    await applyInvoicePayment({ ...baseEvent, amount: '4000', timestamp: 1_760_000_000 }, TX_HASH);

    const updateArgs = prismaMock.invoice.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe('PAID');
    expect(updateArgs.data.amountPaid).toBe(10000n);
    expect(updateArgs.data.datePaid).toEqual(new Date(1_760_000_000 * 1000));
  });

  test('missing invoice logs a warning and returns without writing or throwing', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(null);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(applyInvoicePayment(baseEvent, TX_HASH)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    expect(prismaMock.merchant.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  test('creates an INVOICE_PAYMENT transaction with the correct fields', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({ ...baseInvoice, amount: 10000n, amountPaid: 0n });
    prismaMock.merchant.findUnique.mockResolvedValue({ id: MERCHANT_ID });

    await applyInvoicePayment(
      { ...baseEvent, amount: '10000', token: 'CTOKEN', timestamp: 1_760_000_000 },
      TX_HASH,
    );

    const txArgs = prismaMock.transaction.create.mock.calls[0][0];
    expect(txArgs.data).toMatchObject({
      transactionType: 'INVOICE_PAYMENT',
      refId: 42,
      amount: 10000n,
      token: 'CTOKEN',
      merchantId: MERCHANT_ID,
      description: 'Invoice payment for #42',
    });
    expect(txArgs.data.date).toEqual(new Date(1_760_000_000 * 1000));
  });
});
