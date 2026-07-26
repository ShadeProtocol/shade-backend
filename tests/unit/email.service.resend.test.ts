import { jest } from '@jest/globals';

// Exercise the real 'resend' provider branch. Only the third-party Resend SDK
// is mocked (no live network call in a test run) — sendInvoiceEmail,
// generateInvoicePdf, and all attachment-building logic run for real.
// Save/restore EMAIL_PROVIDER since sibling test modules in this worker rely
// on it being unset (console provider) or set to 'smtp'.
const previousEmailProvider = process.env.EMAIL_PROVIDER;
process.env.EMAIL_PROVIDER = 'resend';
process.env.RESEND_API_KEY = 'test-resend-key';
process.env.EMAIL_FROM = 'noreply@shade.test';

const sendMock = jest.fn(async () => ({ data: { id: 'email-1' }, error: null }));

jest.unstable_mockModule('resend', () => ({
  __esModule: true,
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

const { sendInvoiceEmail } = await import('../../src/services/email.service.js');

if (previousEmailProvider === undefined) {
  delete process.env.EMAIL_PROVIDER;
} else {
  process.env.EMAIL_PROVIDER = previousEmailProvider;
}

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

describe('sendInvoiceEmail (resend provider)', () => {
  beforeEach(() => {
    sendMock.mockClear();
  });

  test('sends the invoice PDF as a real attachment via Resend', async () => {
    await sendInvoiceEmail(baseInvoice, baseMerchant);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0][0] as any;

    expect(payload.to).toBe('payer@example.com');
    expect(payload.from).toBe('noreply@shade.test');
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].filename).toBe(`invoice-${baseInvoice.paymentSlug}.pdf`);
    expect(Buffer.isBuffer(payload.attachments[0].content)).toBe(true);
    expect(payload.attachments[0].content.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  test('does not call Resend when invoice has no email', async () => {
    await sendInvoiceEmail({ ...baseInvoice, email: null }, baseMerchant);

    expect(sendMock).not.toHaveBeenCalled();
  });

  test('throws when Resend returns an error', async () => {
    sendMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } } as any);

    await expect(sendInvoiceEmail(baseInvoice, baseMerchant)).rejects.toThrow(
      'Failed to send email via Resend: boom',
    );
  });
});
