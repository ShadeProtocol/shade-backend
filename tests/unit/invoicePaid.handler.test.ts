import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { handleInvoicePaid } = await import('../../src/indexer/handlers/invoicePaid.js');

const MERCHANT_ID = 'merchant-uuid-1';

const invoice = {
  id: 'invoice-uuid-1',
  invoiceId: 42,
  amount: 10000n,
  amountPaid: 0n,
  merchantId: MERCHANT_ID,
  status: 'PENDING',
  payer: null,
  datePaid: null,
};

const event = {
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

describe('handleInvoicePaid', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    prismaMock.$transaction.mockResolvedValue([]);
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('delegates to the service, driving the invoice lookup and atomic write', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice);
    prismaMock.merchant.findUnique.mockResolvedValue({ id: MERCHANT_ID });

    await handleInvoicePaid(event, 'txhash-1');

    expect(prismaMock.invoice.findUnique).toHaveBeenCalledWith({ where: { invoiceId: 42 } });
    expect(prismaMock.invoice.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.transaction.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
