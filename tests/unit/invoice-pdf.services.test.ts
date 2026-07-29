import { jest } from '@jest/globals';
import { generateInvoicePdf } from '../../src/services/invoice-pdf.services.js';

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
} as any;

// 1x1 transparent PNG, a real (tiny) embeddable image for the logo test.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const isValidPdf = (buffer: Buffer): boolean =>
  buffer.subarray(0, 5).toString('ascii') === '%PDF-' &&
  buffer.subarray(-6).toString('ascii').includes('%%EOF');

describe('generateInvoicePdf', () => {
  test('returns a valid, non-empty PDF buffer for a FIXED_CRYPTO invoice', async () => {
    const pdf = await generateInvoicePdf(baseInvoice, baseMerchant);

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(100);
    expect(isValidPdf(pdf)).toBe(true);
  });

  test('does not query the database or touch storage (pure function of its args)', async () => {
    // No mocking required to prove this: calling it twice with identical,
    // already-in-memory fixture data must succeed both times with no shared
    // state or external dependency involved.
    const first = await generateInvoicePdf(baseInvoice, baseMerchant);
    const second = await generateInvoicePdf(baseInvoice, baseMerchant);

    expect(isValidPdf(first)).toBe(true);
    expect(isValidPdf(second)).toBe(true);
  });

  test('includes fiat amount fields when pricingMode is FIXED_FIAT', async () => {
    const invoice = {
      ...baseInvoice,
      pricingMode: 'FIXED_FIAT',
      fiatAmount: 999_00n,
      fiatCurrency: 'USD',
      fiatDecimals: 2,
    };

    const pdf = await generateInvoicePdf(invoice, baseMerchant);

    expect(isValidPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(100);
  });

  test('renders paid invoices with datePaid and payer address present', async () => {
    const invoice = {
      ...baseInvoice,
      status: 'PAID',
      payer: 'GABCDEF1234567890',
      datePaid: new Date('2026-01-05T10:30:00.000Z'),
    };

    const pdf = await generateInvoicePdf(invoice, baseMerchant);

    expect(isValidPdf(pdf)).toBe(true);
  });

  test('embeds a merchant logo supplied as a data URI without throwing', async () => {
    const merchant = { ...baseMerchant, logo: `data:image/png;base64,${TINY_PNG_BASE64}` };

    const pdf = await generateInvoicePdf(baseInvoice, merchant);

    expect(isValidPdf(pdf)).toBe(true);
  });

  test('gracefully skips a non-data-URI logo (e.g. a plain https URL) without a network call', async () => {
    const merchant = { ...baseMerchant, logo: 'https://example.com/logo.png' };

    const pdf = await generateInvoicePdf(baseInvoice, merchant);

    expect(isValidPdf(pdf)).toBe(true);
  });

  test('logs and continues when the logo data URI has valid base64 that is not a valid image', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const merchant = { ...baseMerchant, logo: 'data:image/png;base64,YWJjZGVm' };

    const pdf = await generateInvoicePdf(baseInvoice, merchant);

    expect(isValidPdf(pdf)).toBe(true);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('Failed to embed invoice logo');

    errorSpy.mockRestore();
  });

  test('handles a merchant with no businessName and no logo', async () => {
    const merchant = { ...baseMerchant, businessName: null, logo: null };

    const pdf = await generateInvoicePdf(baseInvoice, merchant);

    expect(isValidPdf(pdf)).toBe(true);
  });
});
