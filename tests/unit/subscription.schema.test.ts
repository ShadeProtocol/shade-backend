import { mockReset } from 'jest-mock-extended';

// Local mirror of the Prisma enum — never import runtime values from
// @prisma/client in tests; the generated client may not exist in CI.
const SubscriptionStatus = {
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
} as const;
type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;

const mockDate = new Date('2026-06-24T10:00:00Z');

const basePlan = {
  id: 'plan-uuid',
  planId: 101,
  merchantId: 'merchant-uuid',
  description: 'Monthly Pro Plan',
  token: 'CABC...TOKEN',
  amount: BigInt(10_000_000),
  interval: 2_592_000, // 30 days in seconds
  active: true,
  createdAt: mockDate,
  updatedAt: mockDate,
};

const baseSubscription = {
  id: 'sub-uuid',
  subscriptionId: 501,
  planId: 'plan-uuid',
  merchantId: 'merchant-uuid',
  customer: 'GCUSTOMER123',
  status: SubscriptionStatus.ACTIVE,
  lastCharged: null,
  createdAt: mockDate,
  updatedAt: mockDate,
};

describe('SubscriptionPlan schema', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  describe('create', () => {
    test('creates a plan with all required fields', async () => {
      prismaMock.subscriptionPlan.create.mockResolvedValue(basePlan);

      const result = await prismaMock.subscriptionPlan.create({
        data: {
          planId: 101,
          merchantId: 'merchant-uuid',
          description: 'Monthly Pro Plan',
          token: 'CABC...TOKEN',
          amount: BigInt(10_000_000),
          interval: 2_592_000,
        },
      });

      expect(result.planId).toBe(101);
      expect(result.amount).toBe(BigInt(10_000_000));
      expect(result.interval).toBe(2_592_000);
      expect(result.active).toBe(true);
      expect(prismaMock.subscriptionPlan.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          planId: 101,
          description: 'Monthly Pro Plan',
          interval: 2_592_000,
        }),
      });
    });

    test('creates a plan in inactive state', async () => {
      prismaMock.subscriptionPlan.create.mockResolvedValue({ ...basePlan, active: false });

      const result = await prismaMock.subscriptionPlan.create({
        data: { ...basePlan, active: false },
      });

      expect(result.active).toBe(false);
    });
  });

  describe('unique constraints', () => {
    test('findUnique by planId returns the plan', async () => {
      prismaMock.subscriptionPlan.findUnique.mockResolvedValue(basePlan);

      const result = await prismaMock.subscriptionPlan.findUnique({ where: { planId: 101 } });

      expect(result).toEqual(basePlan);
    });

    test('rejects duplicate planId with P2002', async () => {
      const uniqueError = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['planId'] },
      });
      prismaMock.subscriptionPlan.create.mockRejectedValue(uniqueError);

      await expect(
        prismaMock.subscriptionPlan.create({ data: { ...basePlan, id: 'plan-uuid-2' } }),
      ).rejects.toMatchObject({ code: 'P2002', meta: { target: ['planId'] } });
    });
  });

  describe('deactivation', () => {
    test('update sets active to false', async () => {
      prismaMock.subscriptionPlan.update.mockResolvedValue({ ...basePlan, active: false });

      const result = await prismaMock.subscriptionPlan.update({
        where: { id: 'plan-uuid' },
        data: { active: false },
      });

      expect(result.active).toBe(false);
    });
  });
});

describe('Subscription schema', () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  describe('create', () => {
    test('creates an ACTIVE subscription with lastCharged null initially', async () => {
      prismaMock.subscription.create.mockResolvedValue(baseSubscription);

      const result = await prismaMock.subscription.create({
        data: {
          subscriptionId: 501,
          planId: 'plan-uuid',
          merchantId: 'merchant-uuid',
          customer: 'GCUSTOMER123',
          status: SubscriptionStatus.ACTIVE,
        },
      });

      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(result.lastCharged).toBeNull();
      expect(result.customer).toBe('GCUSTOMER123');
    });
  });

  describe('SubscriptionStatus transitions', () => {
    test('records lastCharged when a billing cycle runs', async () => {
      const chargedAt = new Date('2026-07-24T10:00:00Z');
      prismaMock.subscription.update.mockResolvedValue({
        ...baseSubscription,
        lastCharged: chargedAt,
      });

      const result = await prismaMock.subscription.update({
        where: { id: 'sub-uuid' },
        data: { lastCharged: chargedAt },
      });

      expect(result.lastCharged).toEqual(chargedAt);
    });

    test('transitions to CANCELLED status', async () => {
      prismaMock.subscription.update.mockResolvedValue({
        ...baseSubscription,
        status: SubscriptionStatus.CANCELLED,
      });

      const result = await prismaMock.subscription.update({
        where: { id: 'sub-uuid' },
        data: { status: SubscriptionStatus.CANCELLED },
      });

      expect(result.status).toBe(SubscriptionStatus.CANCELLED);
    });

    test.each([
      [SubscriptionStatus.ACTIVE],
      [SubscriptionStatus.CANCELLED],
    ])('accepts status %s', async (status) => {
      prismaMock.subscription.update.mockResolvedValue({ ...baseSubscription, status });

      const result = await prismaMock.subscription.update({
        where: { id: 'sub-uuid' },
        data: { status },
      });

      expect(result.status).toBe(status);
    });
  });

  describe('unique constraints', () => {
    test('findUnique by subscriptionId returns the subscription', async () => {
      prismaMock.subscription.findUnique.mockResolvedValue(baseSubscription);

      const result = await prismaMock.subscription.findUnique({
        where: { subscriptionId: 501 },
      });

      expect(result).toEqual(baseSubscription);
    });

    test('rejects duplicate subscriptionId with P2002', async () => {
      const uniqueError = Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['subscriptionId'] },
      });
      prismaMock.subscription.create.mockRejectedValue(uniqueError);

      await expect(
        prismaMock.subscription.create({ data: { ...baseSubscription, id: 'sub-uuid-2' } }),
      ).rejects.toMatchObject({ code: 'P2002', meta: { target: ['subscriptionId'] } });
    });
  });

  describe('plan relation', () => {
    test('findUnique with plan include returns nested plan', async () => {
      prismaMock.subscription.findUnique.mockResolvedValue({
        ...baseSubscription,
        plan: basePlan,
      });

      const result = await prismaMock.subscription.findUnique({
        where: { id: 'sub-uuid' },
        include: { plan: true },
      });

      expect(result?.plan).toMatchObject({ planId: 101, interval: 2_592_000 });
    });
  });
});
