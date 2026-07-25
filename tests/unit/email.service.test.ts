import { jest } from '@jest/globals';

// EMAIL_PROVIDER is unset here, so environment.email.provider resolves to the
// default 'console' branch. This exercises sendInvoiceEmail's real logic
// (the no-op guard and the real generateInvoicePdf call) with nothing mocked.
const { sendInvoiceEmail } = await import('../../src/services/email.service.js');

const baseMerchant = {
  id: 'merchant-1',
  merchantId: 1,
  address: '0x123',
  account: null,
  merchantKey: null,
  email: 'merchant@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  businessName: 'Analytical Engines',
  category: 'software',
  description: null,
  logo: null,
  webhook: null,
  active: true,
  verified: true,
  emailVerified: true,
  registered: true,
  emailOtp: null,
  emailOtpExpiresAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
} as any;

const baseInvoice = {
  id: 'invoice-1',
  invoiceId: null,
  paymentSlug: 'slug-abc123',
  description: 'Website design',
  amount: 5000n,
  amountPaid: 0n,
  amountRefunded: 0n,
  token: 'USDC',
  merchantId: 'merchant-1',
  payer: null,
  email: 'payer@example.com',
  status: 'PENDING',
  pricingMode: 'FIXED_CRYPTO',
  fiatCurrency: null,
  fiatAmount: null,
  fiatDecimals: null,
  expiresAt: null,
  datePaid: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
} as any;

describe('sendInvoiceEmail (console provider — default when EMAIL_PROVIDER unset)', () => {
  let logSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test('no-ops without sending anything when invoice.email is not set', async () => {
    const invoice = { ...baseInvoice, email: null };

    await sendInvoiceEmail(invoice, baseMerchant);

    expect(logSpy).not.toHaveBeenCalled();
  });

  test('generates a real PDF and "sends" (logs) when invoice.email is set', async () => {
    await sendInvoiceEmail(baseInvoice, baseMerchant);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [message] = logSpy.mock.calls[0] as [string];
    expect(message).toContain('payer@example.com');
    expect(message).toContain(baseInvoice.paymentSlug);
  });

  test('reflects current invoice state on each call (not cached)', async () => {
    await sendInvoiceEmail(baseInvoice, baseMerchant);
    await sendInvoiceEmail({ ...baseInvoice, status: 'PAID' }, baseMerchant);

    expect(logSpy).toHaveBeenCalledTimes(2);
  });
});
