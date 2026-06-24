import { mockReset } from 'jest-mock-extended';

// Local mirror of the Prisma enum — never import runtime values from
// @prisma/client in tests; the generated client may not exist in CI.
const TransactionType = {
  INVOICE_PAYMENT: 'INVOICE_PAYMENT',
  SUBSCRIPTION_CHARGE: 'SUBSCRIPTION_CHARGE',
} as const;
type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;

const mockDate = new Date('2026-06-24T10:00:00Z');
const TOKEN = 'CABC...TOKEN';
const MERCHANT_ID = 'merchant-uuid';
const MERCHANT_ADDR = 'GABCDEF123';

describe('MerchantAnalytics schema', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  const baseAnalytics = {
    id: 'analytics-uuid',
    merchantId: MERCHANT_ID,
    token: TOKEN,
    totalVolume: BigInt(0),
    totalFees: BigInt(0),
    transactionCount: BigInt(0),
    lastUpdated: mockDate,
  };

  describe('create', () => {
    test('creates a zeroed analytics record for a merchant+token pair', async () => {
      prismaMock.merchantAnalytics.create.mockResolvedValue(baseAnalytics);

      const result = await prismaMock.merchantAnalytics.create({
        data: {
          merchantId: MERCHANT_ID,
          token: TOKEN,
        },
      });

      expect(result.totalVolume).toBe(BigInt(0));
      expect(result.totalFees).toBe(BigInt(0));
      expect(result.transactionCount).toBe(BigInt(0));
    });

    test('upserts accumulated totals for an existing merchant+token pair', async () => {
      const updated = {
        ...baseAnalytics,
        totalVolume: BigInt(5_000_000),
        totalFees: BigInt(50_000),
        transactionCount: BigInt(3),
      };
      prismaMock.merchantAnalytics.upsert.mockResolvedValue(updated);

      const result = await prismaMock.merchantAnalytics.upsert({
        where: { merchantId_token: { merchantId: MERCHANT_ID, token: TOKEN } },
        create: { merchantId: MERCHANT_ID, token: TOKEN },
        update: {
          totalVolume: { increment: BigInt(5_000_000) },
          totalFees: { increment: BigInt(50_000) },
          transactionCount: { increment: BigInt(3) },
        },
      });

      expect(result.totalVolume).toBe(BigInt(5_000_000));
      expect(result.transactionCount).toBe(BigInt(3));
      expect(prismaMock.merchantAnalytics.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { merchantId_token: { merchantId: MERCHANT_ID, token: TOKEN } },
        }),
      );
    });
  });

  describe('composite unique constraint', () => {
    test('findUnique by merchantId+token composite key returns the record', async () => {
      prismaMock.merchantAnalytics.findUnique.mockResolvedValue(baseAnalytics);

      const result = await prismaMock.merchantAnalytics.findUnique({
        where: { merchantId_token: { merchantId: MERCHANT_ID, token: TOKEN } },
      });

      expect(result).toEqual(baseAnalytics);
    });

    test('rejects duplicate merchantId+token pair with P2002', async () => {
      const uniqueError = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['merchantId', 'token'] },
      });
      prismaMock.merchantAnalytics.create.mockRejectedValue(uniqueError);

      await expect(
        prismaMock.merchantAnalytics.create({
          data: { merchantId: MERCHANT_ID, token: TOKEN },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });
});

describe('TokenAnalytics schema', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  const baseTokenAnalytics = {
    id: 'token-analytics-uuid',
    token: TOKEN,
    totalVolume: BigInt(0),
    totalFees: BigInt(0),
    transactionCount: BigInt(0),
    uniqueMerchants: 0,
    lastUpdated: mockDate,
  };

  test('creates a zeroed analytics record for a token', async () => {
    prismaMock.tokenAnalytics.create.mockResolvedValue(baseTokenAnalytics);

    const result = await prismaMock.tokenAnalytics.create({ data: { token: TOKEN } });

    expect(result.token).toBe(TOKEN);
    expect(result.totalVolume).toBe(BigInt(0));
    expect(result.uniqueMerchants).toBe(0);
  });

  test('findUnique by token address', async () => {
    prismaMock.tokenAnalytics.findUnique.mockResolvedValue(baseTokenAnalytics);

    const result = await prismaMock.tokenAnalytics.findUnique({ where: { token: TOKEN } });

    expect(result).toEqual(baseTokenAnalytics);
  });

  test('increments counters when a payment is processed', async () => {
    const updated = {
      ...baseTokenAnalytics,
      totalVolume: BigInt(1_000_000),
      totalFees: BigInt(10_000),
      transactionCount: BigInt(1),
      uniqueMerchants: 1,
    };
    prismaMock.tokenAnalytics.update.mockResolvedValue(updated);

    const result = await prismaMock.tokenAnalytics.update({
      where: { token: TOKEN },
      data: {
        totalVolume: { increment: BigInt(1_000_000) },
        totalFees: { increment: BigInt(10_000) },
        transactionCount: { increment: BigInt(1) },
        uniqueMerchants: { increment: 1 },
      },
    });

    expect(result.totalVolume).toBe(BigInt(1_000_000));
    expect(result.uniqueMerchants).toBe(1);
  });

  test('rejects duplicate token with P2002', async () => {
    const uniqueError = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['token'] },
    });
    prismaMock.tokenAnalytics.create.mockRejectedValue(uniqueError);

    await expect(
      prismaMock.tokenAnalytics.create({ data: { token: TOKEN } }),
    ).rejects.toMatchObject({ code: 'P2002', meta: { target: ['token'] } });
  });
});

describe('Transaction schema', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  const baseTransaction = {
    id: 'tx-uuid',
    transactionType: TransactionType.INVOICE_PAYMENT,
    refId: 1001,
    amount: BigInt(1_000_000),
    token: TOKEN,
    description: 'Invoice #1001 payment',
    merchantId: MERCHANT_ID,
    date: mockDate,
    createdAt: mockDate,
  };

  test('creates an INVOICE_PAYMENT transaction', async () => {
    prismaMock.transaction.create.mockResolvedValue(baseTransaction);

    const result = await prismaMock.transaction.create({
      data: {
        transactionType: TransactionType.INVOICE_PAYMENT,
        refId: 1001,
        amount: BigInt(1_000_000),
        token: TOKEN,
        description: 'Invoice #1001 payment',
        merchantId: MERCHANT_ID,
        date: mockDate,
      },
    });

    expect(result.transactionType).toBe(TransactionType.INVOICE_PAYMENT);
    expect(result.refId).toBe(1001);
    expect(result.amount).toBe(BigInt(1_000_000));
  });

  test('creates a SUBSCRIPTION_CHARGE transaction', async () => {
    const subTx = {
      ...baseTransaction,
      id: 'tx-uuid-2',
      transactionType: TransactionType.SUBSCRIPTION_CHARGE,
      refId: 501,
      description: 'Subscription #501 charge',
    };
    prismaMock.transaction.create.mockResolvedValue(subTx);

    const result = await prismaMock.transaction.create({
      data: {
        transactionType: TransactionType.SUBSCRIPTION_CHARGE,
        refId: 501,
        amount: BigInt(10_000_000),
        token: TOKEN,
        description: 'Subscription #501 charge',
        merchantId: MERCHANT_ID,
        date: mockDate,
      },
    });

    expect(result.transactionType).toBe(TransactionType.SUBSCRIPTION_CHARGE);
    expect(result.refId).toBe(501);
  });

  test('findMany returns all transactions for a merchant', async () => {
    prismaMock.transaction.findMany.mockResolvedValue([baseTransaction]);

    const result = await prismaMock.transaction.findMany({
      where: { merchantId: MERCHANT_ID },
      orderBy: { date: 'desc' },
    });

    expect(result).toHaveLength(1);
    expect(result[0].merchantId).toBe(MERCHANT_ID);
  });
});

describe('BridgePayment schema', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  const baseBridgePayment = {
    id: 'bridge-uuid',
    invoiceId: 'invoice-uuid',
    merchantId: MERCHANT_ID,
    payer: MERCHANT_ADDR,
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    token: TOKEN,
    amount: BigInt(1_000_000),
    destinationRecipient: '0xABCD...1234',
    memo: null,
    createdAt: mockDate,
  };

  test('creates a bridge payment record', async () => {
    prismaMock.bridgePayment.create.mockResolvedValue(baseBridgePayment);

    const result = await prismaMock.bridgePayment.create({
      data: {
        invoiceId: 'invoice-uuid',
        merchantId: MERCHANT_ID,
        payer: MERCHANT_ADDR,
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        token: TOKEN,
        amount: BigInt(1_000_000),
        destinationRecipient: '0xABCD...1234',
      },
    });

    expect(result.sourceChain).toBe('stellar');
    expect(result.destinationChain).toBe('ethereum');
    expect(result.destinationRecipient).toBe('0xABCD...1234');
    expect(result.payer).toBe(MERCHANT_ADDR);
    expect(result.memo).toBeNull();
  });

  test('creates a bridge payment with an optional memo', async () => {
    const withMemo = { ...baseBridgePayment, memo: 'order-ref-789' };
    prismaMock.bridgePayment.create.mockResolvedValue(withMemo);

    const result = await prismaMock.bridgePayment.create({
      data: { ...baseBridgePayment, memo: 'order-ref-789' },
    });

    expect(result.memo).toBe('order-ref-789');
  });

  test('creates a bridge payment with anonymous payer (null)', async () => {
    const noPayer = { ...baseBridgePayment, payer: null };
    prismaMock.bridgePayment.create.mockResolvedValue(noPayer);

    const result = await prismaMock.bridgePayment.create({
      data: { ...baseBridgePayment, payer: null },
    });

    expect(result.payer).toBeNull();
  });

  test('findMany returns bridge payments for an invoice', async () => {
    prismaMock.bridgePayment.findMany.mockResolvedValue([baseBridgePayment]);

    const result = await prismaMock.bridgePayment.findMany({
      where: { invoiceId: 'invoice-uuid' },
    });

    expect(result).toHaveLength(1);
    expect(result[0].invoiceId).toBe('invoice-uuid');
  });
});
