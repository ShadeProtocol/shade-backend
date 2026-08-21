import { jest, beforeEach, afterEach, describe, test, expect } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { applyInvoiceCreated } = await import('../../src/services/invoice.services.js');
const { applySubscriptionPlanCreated, applySubscribed } = await import(
  '../../src/services/subscription.services.js'
);
const { decodeSubscriptionPlanCreatedEventData } = await import('../../src/indexer/types.js');
const { dispatch } = await import('../../src/indexer/registry.js');
const { INVOICE_CREATED_TOPIC } = await import('../../src/indexer/handlers/invoiceCreated.js');
const { SUBSCRIPTION_PLAN_CREATED_TOPIC } = await import(
  '../../src/indexer/handlers/subscriptionPlanCreated.js'
);
const { SUBSCRIBED_TOPIC } = await import('../../src/indexer/handlers/subscribed.js');
await import('../../src/indexer/handlers/index.js');

const MERCHANT_UUID = 'merchant-uuid';
const MERCHANT_ADDRESS = 'GAWCXMWXOEEY4R3L62FT744VGZBDZ6NLWD2ILW6VIMNCNCWQC6KAN3AA';
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const TIMESTAMP = 1_787_343_000; // 2026-08-21T20:10:00Z
const LEDGER_CLOSE = new Date('2026-08-21T20:27:17.000Z');
const DAY = new Date('2026-08-21T00:00:00.000Z');

const merchant = { id: MERCHANT_UUID, merchantId: 7, address: MERCHANT_ADDRESS };

let consoleError: any;
let consoleWarn: any;

beforeEach(() => {
  mockReset(prismaMock);
  prismaMock.$transaction.mockImplementation(async (callback: any) => callback(prismaMock));
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  consoleWarn.mockRestore();
});

describe('event shapes confirmed against testnet', () => {
  test('decodes the real subscription_plan_created_event payload', () => {
    // Exactly what scValToNative produced for a live testnet event.
    expect(
      decodeSubscriptionPlanCreatedEventData({
        amount: 2_500_000_000n,
        interval: 2_592_000n,
        merchant: MERCHANT_ADDRESS,
        plan_id: 77n,
        timestamp: 1_787_343_000n,
        token: TOKEN,
      }),
    ).toEqual({
      planId: 77,
      merchant: MERCHANT_ADDRESS,
      token: TOKEN,
      amount: 2_500_000_000n,
      interval: 2_592_000,
      timestamp: 1_787_343_000,
    });
  });

  test('registers the topic symbols the contract actually publishes', () => {
    expect(INVOICE_CREATED_TOPIC).toBe('invoice_created_event');
    expect(SUBSCRIPTION_PLAN_CREATED_TOPIC).toBe('subscription_plan_created_event');
    expect(SUBSCRIBED_TOPIC).toBe('subscribed_event');
  });

  test('each creation topic reaches its own handler', async () => {
    // A wrong or duplicated registration would surface as the wrong decoder's
    // error message here.
    await expect(
      dispatch({ id: 'a', topic: INVOICE_CREATED_TOPIC, ledger: 1, txHash: 'tx', data: null }),
    ).rejects.toThrow('InvoiceCreated event data must be a decoded map');
    await expect(
      dispatch({
        id: 'b',
        topic: SUBSCRIPTION_PLAN_CREATED_TOPIC,
        ledger: 1,
        txHash: 'tx',
        data: null,
      }),
    ).rejects.toThrow('SubscriptionPlanCreated event data must be a decoded map');
    await expect(
      dispatch({ id: 'c', topic: SUBSCRIBED_TOPIC, ledger: 1, txHash: 'tx', data: null }),
    ).rejects.toThrow('Subscribed event data must be a decoded map');
  });
});

describe('applyInvoiceCreated', () => {
  const event = {
    invoiceId: 4242,
    merchant: MERCHANT_ADDRESS,
    amount: 1_500_000_000n,
    token: TOKEN,
  };

  // What fetchInvoiceDetails returns for this invoice; the event itself carries
  // neither field.
  const onChain = { description: 'Design retainer', expiresAt: null };

  const unlinked = (id: string) => ({
    id,
    invoiceId: null,
    merchantId: MERCHANT_UUID,
    amount: event.amount,
    token: TOKEN,
    description: 'Design retainer',
    status: 'PENDING',
  });

  beforeEach(() => {
    prismaMock.merchant.findUnique.mockResolvedValue(merchant);
    prismaMock.invoice.findUnique.mockResolvedValue(null);
    prismaMock.invoice.findMany.mockResolvedValue([]);
    prismaMock.invoice.update.mockImplementation(async ({ where }: any) => ({
      ...unlinked(where.id),
      invoiceId: event.invoiceId,
    }));
    prismaMock.invoice.create.mockResolvedValue({ id: 'new-invoice-uuid' });
  });

  test('links the single unlinked invoice that matches', async () => {
    prismaMock.invoice.findMany.mockResolvedValue([unlinked('off-chain-uuid')]);

    const result = await applyInvoiceCreated(event, 'tx-hash', LEDGER_CLOSE, onChain);

    expect(result?.outcome).toBe('linked');
    expect(prismaMock.invoice.update).toHaveBeenCalledWith({
      where: { id: 'off-chain-uuid' },
      data: { invoiceId: 4242, status: 'PENDING' },
    });
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    // The description read back off-chain narrows the candidate query.
    expect(prismaMock.invoice.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ description: 'Design retainer', invoiceId: null }),
    });
  });

  test('refuses to guess when more than one candidate matches, and says so loudly', async () => {
    prismaMock.invoice.findMany.mockResolvedValue([
      unlinked('candidate-a'),
      unlinked('candidate-b'),
    ]);

    const result = await applyInvoiceCreated(event, 'tx-hash', LEDGER_CLOSE, onChain);

    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
    expect(result?.outcome).toBe('created-ambiguous');
    const logged = consoleError.mock.calls.map((call: any[]) => String(call[0])).join('\n');
    expect(logged).toContain('AMBIGUOUS');
    expect(logged).toContain('candidate-a');
    expect(logged).toContain('candidate-b');
  });

  test('creates a row when nothing matches, rather than dropping the event', async () => {
    const result = await applyInvoiceCreated(event, 'tx-hash', LEDGER_CLOSE, onChain);

    expect(result?.outcome).toBe('created');
    expect(prismaMock.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceId: 4242,
        merchantId: MERCHANT_UUID,
        description: 'Design retainer',
        amount: event.amount,
        token: TOKEN,
        status: 'PENDING',
        createdAt: LEDGER_CLOSE,
      }),
    });
  });

  test('falls back to a placeholder description when the contract read fails', async () => {
    await applyInvoiceCreated(event, 'tx-hash', LEDGER_CLOSE, null);

    // Match must not be narrowed by a description we do not have.
    expect(prismaMock.invoice.findMany).toHaveBeenCalledWith({
      where: expect.not.objectContaining({ description: expect.anything() }),
    });
    expect(prismaMock.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ description: 'On-chain invoice #4242' }),
    });
  });

  test('leaves an invoice whose invoiceId is already set alone', async () => {
    prismaMock.invoice.findUnique.mockResolvedValue({ id: 'already', invoiceId: 4242 });

    const result = await applyInvoiceCreated(event, 'tx-hash', LEDGER_CLOSE, onChain);

    expect(result?.outcome).toBe('already-linked');
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  test('still moves the daily new-invoice counter when the merchant is unknown', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(null);

    const result = await applyInvoiceCreated(event, 'tx-hash', LEDGER_CLOSE, onChain);

    expect(result).toBeNull();
    expect(prismaMock.invoice.create).not.toHaveBeenCalled();
    expect(prismaMock.platformDailyStats.upsert).toHaveBeenCalledWith({
      where: { date: DAY },
      create: { date: DAY, newInvoices: 1 },
      update: { newInvoices: { increment: 1 } },
    });
  });
});

describe('applySubscriptionPlanCreated', () => {
  const event = {
    planId: 77,
    merchant: MERCHANT_ADDRESS,
    token: TOKEN,
    amount: 2_500_000_000n,
    interval: 2_592_000,
    timestamp: TIMESTAMP,
  };

  beforeEach(() => {
    prismaMock.merchant.findUnique.mockResolvedValue(merchant);
    prismaMock.subscriptionPlan.findUnique.mockResolvedValue(null);
    prismaMock.subscriptionPlan.create.mockResolvedValue({ id: 'plan-uuid', planId: 77 });
  });

  test('creates the plan with the description read back off-chain', async () => {
    const plan = await applySubscriptionPlanCreated(event, 'tx-hash', 'Pro monthly');

    expect(plan).toEqual({ id: 'plan-uuid', planId: 77 });
    expect(prismaMock.subscriptionPlan.create).toHaveBeenCalledWith({
      data: {
        planId: 77,
        merchantId: MERCHANT_UUID,
        description: 'Pro monthly',
        token: TOKEN,
        amount: 2_500_000_000n,
        interval: 2_592_000,
        active: true,
        createdAt: new Date(TIMESTAMP * 1000),
      },
    });
  });

  test('replaying the same event does not create a second plan', async () => {
    prismaMock.subscriptionPlan.findUnique.mockResolvedValue({ id: 'plan-uuid', planId: 77 });

    const plan = await applySubscriptionPlanCreated(event, 'tx-hash', 'Pro monthly');

    expect(plan).toEqual({ id: 'plan-uuid', planId: 77 });
    expect(prismaMock.subscriptionPlan.create).not.toHaveBeenCalled();
  });

  test('skips a plan whose merchant is unknown', async () => {
    prismaMock.merchant.findUnique.mockResolvedValue(null);

    expect(await applySubscriptionPlanCreated(event, 'tx-hash', 'Pro monthly')).toBeNull();
    expect(prismaMock.subscriptionPlan.create).not.toHaveBeenCalled();
  });
});

describe('applySubscribed', () => {
  const event = {
    subscriptionId: 909,
    planId: 77,
    customer: MERCHANT_ADDRESS,
    timestamp: TIMESTAMP,
  };
  const plan = { id: 'plan-uuid', planId: 77, merchantId: MERCHANT_UUID };

  beforeEach(() => {
    prismaMock.subscription.findUnique.mockResolvedValue(null);
    prismaMock.subscriptionPlan.findUnique.mockResolvedValue(plan);
    prismaMock.subscription.create.mockResolvedValue({ id: 'subscription-uuid' });
  });

  test('takes merchantId from the resolved plan, not the event', async () => {
    await applySubscribed(event, 'tx-hash');

    expect(prismaMock.subscription.create).toHaveBeenCalledWith({
      data: {
        subscriptionId: 909,
        planId: 'plan-uuid',
        merchantId: MERCHANT_UUID,
        customer: MERCHANT_ADDRESS,
        status: 'ACTIVE',
        createdAt: new Date(TIMESTAMP * 1000),
      },
    });
  });

  test('replaying the same event does not create a second subscription', async () => {
    prismaMock.subscription.findUnique.mockResolvedValue({ id: 'subscription-uuid' });

    await applySubscribed(event, 'tx-hash');

    expect(prismaMock.subscription.create).not.toHaveBeenCalled();
  });

  test('skips a subscription whose plan is not indexed yet', async () => {
    prismaMock.subscriptionPlan.findUnique.mockResolvedValue(null);

    expect(await applySubscribed(event, 'tx-hash')).toBeNull();
    expect(prismaMock.subscription.create).not.toHaveBeenCalled();
  });

  test('moves the daily new-subscription counter', async () => {
    await applySubscribed(event, 'tx-hash');

    expect(prismaMock.platformDailyStats.upsert).toHaveBeenCalledWith({
      where: { date: DAY },
      create: { date: DAY, newSubscriptions: 1 },
      update: { newSubscriptions: { increment: 1 } },
    });
  });
});
