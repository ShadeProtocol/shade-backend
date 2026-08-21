import { jest, beforeEach, afterEach } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { applyInvoicePayment, applyInvoiceRefund } = await import(
  '../../src/services/invoice.services.js'
);
const { applySubscriptionCharge } = await import('../../src/services/subscription.services.js');
const { applyTicketPurchase, applyTicketResale } = await import(
  '../../src/services/ticket.services.js'
);
const {
  decodeSubscriptionChargedEventData,
  decodeTicketResoldEventData,
  decodeInvoicePartiallyRefundedEventData,
} = await import('../../src/indexer/types.js');
const { dispatch } = await import('../../src/indexer/registry.js');
await import('../../src/indexer/handlers/index.js');

const MERCHANT_UUID = 'merchant-uuid';
const TOKEN = 'CABC...TOKEN';
const TIMESTAMP = 1_787_318_100; // 2026-08-21T13:15:00Z
const OCCURRED_AT = new Date(TIMESTAMP * 1000);
const DAY = new Date('2026-08-21T00:00:00.000Z');

const merchant = { id: MERCHANT_UUID, merchantId: 7 };

const dailyStatsCallFor = (field: string) =>
  prismaMock.platformDailyStats.upsert.mock.calls.find(
    ([args]: [any]) => args.update[field] !== undefined,
  )?.[0];

beforeEach(() => {
  mockReset(prismaMock);
  prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
  prismaMock.merchantAnalytics.findUnique.mockResolvedValue(null);
});

describe('applyInvoicePayment analytics retrofit', () => {
  const paymentEvent = {
    invoiceId: 101,
    merchantId: 7,
    payer: 'GPAYER',
    amount: 2000n,
    fee: 20n,
    merchantAmount: 1980n,
    token: TOKEN,
    timestamp: TIMESTAMP,
  };

  const invoice = {
    id: 'invoice-uuid',
    invoiceId: 101,
    amount: 5000n,
    amountPaid: 0n,
    amountRefunded: 0n,
    merchantId: MERCHANT_UUID,
  };

  beforeEach(() => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice);
    prismaMock.invoice.findUniqueOrThrow.mockResolvedValue(invoice);
    prismaMock.merchant.findUnique.mockResolvedValue(merchant);
    prismaMock.invoice.update.mockResolvedValue(invoice);
    prismaMock.transaction.create.mockResolvedValue({ id: 'transaction-uuid' });
  });

  test('updates all three analytics projections inside the payment transaction', async () => {
    await applyInvoicePayment(paymentEvent, 'tx-hash');

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.merchantAnalytics.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { merchantId_token: { merchantId: MERCHANT_UUID, token: TOKEN } },
        update: {
          totalVolume: { increment: 2000n },
          totalFees: { increment: 20n },
          transactionCount: { increment: 1n },
        },
      }),
    );
    expect(prismaMock.tokenAnalytics.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { token: TOKEN } }),
    );
    expect(prismaMock.platformDailyStats.upsert).toHaveBeenCalledWith({
      where: { date: DAY },
      create: { date: DAY, totalVolume: 2000n, totalFees: 20n, transactionCount: 1n },
      update: {
        totalVolume: { increment: 2000n },
        totalFees: { increment: 20n },
        transactionCount: { increment: 1n },
      },
    });
  });

  test('records the gross amount as volume, not the merchant net', async () => {
    await applyInvoicePayment(paymentEvent, 'tx-hash');

    const merchantUpsert = prismaMock.merchantAnalytics.upsert.mock.calls[0][0];
    expect(merchantUpsert.update.totalVolume).toEqual({ increment: paymentEvent.amount });
    expect(merchantUpsert.update.totalVolume).not.toEqual({
      increment: paymentEvent.merchantAmount,
    });
  });

  test('writes no analytics when the invoice is unknown', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(null);

    expect(await applyInvoicePayment(paymentEvent, 'tx-hash')).toBeNull();
    expect(prismaMock.merchantAnalytics.upsert).not.toHaveBeenCalled();
    expect(prismaMock.platformDailyStats.upsert).not.toHaveBeenCalled();
  });
});

describe('applySubscriptionCharge', () => {
  const chargeEvent = {
    subscriptionId: 501,
    planId: 12,
    customer: 'GCUSTOMER',
    merchant: 'GMERCHANT',
    amount: 10_000n,
    fee: 100n,
    token: TOKEN,
    timestamp: TIMESTAMP,
  };

  const subscription = {
    id: 'subscription-uuid',
    subscriptionId: 501,
    planId: 'plan-uuid',
    merchantId: MERCHANT_UUID,
  };

  test('decodes the contract event map emitted by scValToNative', () => {
    expect(
      decodeSubscriptionChargedEventData({
        subscription_id: 501n,
        plan_id: 12n,
        customer: 'GCUSTOMER',
        merchant: 'GMERCHANT',
        amount: 10_000n,
        fee: 100n,
        token: TOKEN,
        timestamp: BigInt(TIMESTAMP),
      }),
    ).toEqual(chargeEvent);
  });

  test('attributes the charge to the subscription owner, not the event merchant', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(subscription);
    prismaMock.subscription.update.mockResolvedValue(subscription);
    prismaMock.transaction.create.mockResolvedValue({ id: 'transaction-uuid' });

    await applySubscriptionCharge(chargeEvent, 'tx-hash');

    expect(prismaMock.subscription.findUnique).toHaveBeenCalledWith({
      where: { subscriptionId: 501 },
    });
    expect(prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { id: subscription.id },
      data: { lastCharged: OCCURRED_AT },
    });
    expect(prismaMock.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        transactionType: 'SUBSCRIPTION_CHARGE',
        refId: 501,
        amount: 10_000n,
        token: TOKEN,
        merchantId: MERCHANT_UUID,
        date: OCCURRED_AT,
      }),
    });
    expect(prismaMock.merchantAnalytics.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { merchantId_token: { merchantId: MERCHANT_UUID, token: TOKEN } },
      }),
    );
    expect(dailyStatsCallFor('totalVolume').update).toEqual({
      totalVolume: { increment: 10_000n },
      totalFees: { increment: 100n },
      transactionCount: { increment: 1n },
    });
  });

  test('skips a charge for a subscription the backend has not indexed', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);

    expect(await applySubscriptionCharge(chargeEvent, 'tx-hash')).toBeNull();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  test('is registered for the contract topic', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);

    await dispatch({
      id: 'event-1',
      topic: 'subscription_charged_event',
      ledger: 1,
      txHash: 'tx-hash',
      data: {
        subscription_id: 501n,
        plan_id: 12n,
        customer: 'GCUSTOMER',
        merchant: 'GMERCHANT',
        amount: 10_000n,
        fee: 100n,
        token: TOKEN,
        timestamp: BigInt(TIMESTAMP),
      },
    });

    expect(prismaMock.subscription.findUnique).toHaveBeenCalled();
  });
});

describe('ticketing handlers', () => {
  const purchaseEvent = {
    ticketId: 9,
    eventId: 3,
    merchantId: 7,
    buyer: 'GBUYER',
    amount: 4000n,
    fee: 40n,
    merchantAmount: 3960n,
    token: TOKEN,
    timestamp: TIMESTAMP,
  };

  const resaleEvent = {
    ticketId: 9,
    eventId: 3,
    merchantId: 7,
    seller: 'GSELLER',
    buyer: 'GBUYER',
    resalePrice: 6000n,
    royalty: 300n,
    sellerProceeds: 5700n,
    token: TOKEN,
    timestamp: TIMESTAMP,
  };

  test('a purchase moves volume and bumps the daily ticket counter', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(merchant);

    await applyTicketPurchase(purchaseEvent, 'tx-hash');

    expect(prismaMock.merchantAnalytics.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          totalVolume: { increment: 4000n },
          totalFees: { increment: 40n },
          transactionCount: { increment: 1n },
        },
      }),
    );
    expect(dailyStatsCallFor('newTickets')).toEqual({
      where: { date: DAY },
      create: { date: DAY, newTickets: 1 },
      update: { newTickets: { increment: 1 } },
    });
  });

  test('a resale counts the royalty as volume with no platform fee and no new ticket', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(merchant);

    await applyTicketResale(resaleEvent, 'tx-hash');

    expect(prismaMock.merchantAnalytics.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          totalVolume: { increment: 300n },
          totalFees: { increment: 0n },
          transactionCount: { increment: 1n },
        },
      }),
    );
    expect(dailyStatsCallFor('newTickets')).toBeUndefined();
  });

  test('decodes the resale event map emitted by scValToNative', () => {
    expect(
      decodeTicketResoldEventData({
        ticket_id: 9n,
        event_id: 3n,
        merchant_id: 7n,
        seller: 'GSELLER',
        buyer: 'GBUYER',
        resale_price: 6000n,
        royalty: 300n,
        seller_proceeds: 5700n,
        token: TOKEN,
        timestamp: BigInt(TIMESTAMP),
      }),
    ).toEqual(resaleEvent);
  });

  test('skips a sale for a merchant the backend does not know', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(null);

    expect(await applyTicketPurchase(purchaseEvent, 'tx-hash')).toBeNull();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('refund handlers', () => {
  const invoice = {
    id: 'invoice-uuid',
    invoiceId: 101,
    amount: 5000n,
    amountPaid: 5000n,
    amountRefunded: 1000n,
    merchantId: MERCHANT_UUID,
  };

  beforeEach(() => {
    prismaMock.invoice.findUnique.mockResolvedValue(invoice);
    prismaMock.invoice.findUniqueOrThrow.mockResolvedValue(invoice);
    prismaMock.invoice.update.mockResolvedValue(invoice);
  });

  test('a partial refund trusts the running total on the event', async () => {
    await applyInvoiceRefund(
      decodeInvoicePartiallyRefundedEventData({
        invoice_id: 101n,
        merchant: 'GMERCHANT',
        amount: 2000n,
        total_amount_refunded: 3000n,
        timestamp: BigInt(TIMESTAMP),
      }),
      'tx-hash',
    );

    expect(prismaMock.invoice.update).toHaveBeenCalledWith({
      where: { id: invoice.id },
      data: { amountRefunded: 3000n, status: 'PARTIALLY_REFUNDED' },
    });
  });

  test('a full refund takes the whole invoice amount the event reports', async () => {
    // Both refund_invoice and the completing branch of refund_invoice_partial
    // publish invoice.amount here, not the chunk just refunded.
    await applyInvoiceRefund(
      {
        invoiceId: 101,
        merchant: 'GMERCHANT',
        amount: 5000n,
        timestamp: TIMESTAMP,
      },
      'tx-hash',
    );

    expect(prismaMock.invoice.update).toHaveBeenCalledWith({
      where: { id: invoice.id },
      data: { amountRefunded: 5000n, status: 'REFUNDED' },
    });
  });

  test('clamps a refund total that would exceed the invoice amount', async () => {
    await applyInvoiceRefund(
      decodeInvoicePartiallyRefundedEventData({
        invoice_id: 101n,
        merchant: 'GMERCHANT',
        amount: 9000n,
        total_amount_refunded: 9000n,
        timestamp: BigInt(TIMESTAMP),
      }),
      'tx-hash',
    );

    expect(prismaMock.invoice.update).toHaveBeenCalledWith({
      where: { id: invoice.id },
      data: { amountRefunded: 5000n, status: 'REFUNDED' },
    });
  });

  test('never walks the refund total backwards on a replayed event', async () => {
    // 1000n is already refunded; replaying an earlier partial must not undo it.
    await applyInvoiceRefund(
      decodeInvoicePartiallyRefundedEventData({
        invoice_id: 101n,
        merchant: 'GMERCHANT',
        amount: 500n,
        total_amount_refunded: 500n,
        timestamp: BigInt(TIMESTAMP),
      }),
      'tx-hash',
    );

    expect(prismaMock.invoice.update).toHaveBeenCalledWith({
      where: { id: invoice.id },
      data: { amountRefunded: 1000n, status: 'PARTIALLY_REFUNDED' },
    });
  });

  test('never nets a refund off the volume projections', async () => {
    await applyInvoiceRefund(
      { invoiceId: 101, merchant: 'GMERCHANT', amount: 5000n, timestamp: TIMESTAMP },
      'tx-hash',
    );

    expect(prismaMock.merchantAnalytics.upsert).not.toHaveBeenCalled();
    expect(prismaMock.tokenAnalytics.upsert).not.toHaveBeenCalled();
    expect(prismaMock.platformDailyStats.upsert).not.toHaveBeenCalled();
  });

  test('skips a refund for an invoice the backend does not have', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue(null);

    expect(
      await applyInvoiceRefund(
        { invoiceId: 101, merchant: 'GMERCHANT', amount: 5000n, timestamp: TIMESTAMP },
        'tx-hash',
      ),
    ).toBeNull();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('growth handlers', () => {
  const dispatchGrowth = (topic: string, data: Record<string, unknown>) =>
    dispatch({ id: `${topic}-1`, topic, ledger: 1, txHash: 'tx-hash', data });

  test('a merchant registration bumps newMerchants for the event day', async () => {
    await dispatchGrowth('merchant_registered_event', {
      merchant: 'GMERCHANT',
      merchant_id: 7n,
      timestamp: BigInt(TIMESTAMP),
    });

    expect(prismaMock.platformDailyStats.upsert).toHaveBeenCalledWith({
      where: { date: DAY },
      create: { date: DAY, newMerchants: 1 },
      update: { newMerchants: { increment: 1 } },
    });
  });

  test('a subscription bumps newSubscriptions for the event day', async () => {
    await dispatchGrowth('subscribed_event', {
      subscription_id: 501n,
      plan_id: 12n,
      customer: 'GCUSTOMER',
      timestamp: BigInt(TIMESTAMP),
    });

    expect(prismaMock.platformDailyStats.upsert).toHaveBeenCalledWith({
      where: { date: DAY },
      create: { date: DAY, newSubscriptions: 1 },
      update: { newSubscriptions: { increment: 1 } },
    });
  });

  describe('invoice creation', () => {
    const invoiceCreatedData = {
      invoice_id: 101n,
      merchant: 'GMERCHANT',
      amount: 5000n,
      token: TOKEN,
    };

    beforeEach(() => {
      // A replay running on a much later day: the indexing time is the wrong
      // bucket, so only the ledger close time can put the event on 2026-08-21.
      jest.useFakeTimers({ now: new Date('2027-03-04T10:00:00.000Z') });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('buckets by ledger close time, since the event carries no timestamp', async () => {
      await dispatch({
        id: 'invoice-created-1',
        topic: 'invoice_created_event',
        ledger: 1,
        txHash: 'tx-hash',
        ledgerClosedAt: '2026-08-21T13:15:00Z',
        data: invoiceCreatedData,
      });

      expect(prismaMock.platformDailyStats.upsert).toHaveBeenCalledWith({
        where: { date: DAY },
        create: { date: DAY, newInvoices: 1 },
        update: { newInvoices: { increment: 1 } },
      });
    });

    test('falls back to the indexing time when no ledger close time is present', async () => {
      await dispatchGrowth('invoice_created_event', invoiceCreatedData);

      expect(prismaMock.platformDailyStats.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { date: new Date('2027-03-04T00:00:00.000Z') } }),
      );
    });
  });

  test('status and governance events stay unhandled', async () => {
    await dispatchGrowth('merchant_status_changed_event', { merchant_id: 7n, active: false });
    await dispatchGrowth('role_granted_event', { admin: 'GADMIN', user: 'GUSER' });
    await dispatchGrowth('subscription_plan_created_event', { plan_id: 12n });
    await dispatchGrowth('event_created_event', { event_id: 3n });

    expect(prismaMock.platformDailyStats.upsert).not.toHaveBeenCalled();
  });
});

describe('topic registration', () => {
  const dispatchTopic = (topic: string, data: Record<string, unknown>) =>
    dispatch({ id: `${topic}-1`, topic, ledger: 1, txHash: 'tx-hash', data });

  const ticketData = {
    ticket_id: 9n,
    event_id: 3n,
    merchant_id: 7n,
    buyer: 'GBUYER',
    amount: 4000n,
    fee: 40n,
    merchant_amount: 3960n,
    token: TOKEN,
    timestamp: BigInt(TIMESTAMP),
  };

  const resaleData = {
    ...ticketData,
    seller: 'GSELLER',
    resale_price: 6000n,
    royalty: 300n,
    seller_proceeds: 5700n,
  };

  const refundData = {
    invoice_id: 101n,
    merchant: 'GMERCHANT',
    amount: 5000n,
    timestamp: BigInt(TIMESTAMP),
  };

  // Each handler is reached only if its topic string matches what the contract
  // actually publishes, so these guard against a topic typo going unnoticed.
  test.each([
    ['ticket_purchased_event', ticketData],
    ['ticket_resold_event', resaleData],
  ])('%s reaches the ticketing handler', async (topic, data) => {
    prismaMock.merchant.findUnique.mockResolvedValue(null);

    await dispatchTopic(topic, data);

    expect(prismaMock.merchant.findUnique).toHaveBeenCalledWith({ where: { merchantId: 7 } });
  });

  test.each([
    ['invoice_refunded_event', refundData],
    ['invoice_partially_refunded_event', { ...refundData, total_amount_refunded: 5000n }],
  ])('%s reaches the refund handler', async (topic, data) => {
    prismaMock.invoice.findUnique.mockResolvedValue(null);

    await dispatchTopic(topic, data);

    expect(prismaMock.invoice.findUnique).toHaveBeenCalledWith({ where: { invoiceId: 101 } });
  });
});
