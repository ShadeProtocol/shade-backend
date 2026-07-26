import PDFDocument from 'pdfkit';
import type { Invoice, Merchant } from '@prisma/client';

const FIXED_FIAT = 'FIXED_FIAT';

// merchant.logo is a free-form string (set via the merchant profile API). Only a
// data: URI can be embedded without giving this "pure" renderer a network
// dependency, so a plain image URL is intentionally skipped rather than fetched.
const DATA_URI_IMAGE = /^data:image\/(png|jpe?g);base64,([a-z0-9+/=]+)$/i;

const decodeLogo = (logo: string | null): Buffer | null => {
  if (!logo) return null;

  const match = DATA_URI_IMAGE.exec(logo.trim());
  if (!match) return null;

  try {
    return Buffer.from(match[2], 'base64');
  } catch {
    return null;
  }
};

const formatDate = (date: Date | null): string => {
  if (!date) return '-';
  return date
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' UTC');
};

const formatFiatAmount = (
  fiatAmount: bigint,
  fiatDecimals: number,
  fiatCurrency: string,
): string => {
  const decimals = Math.max(fiatDecimals, 0);
  const divisor = 10n ** BigInt(decimals);
  const whole = fiatAmount / divisor;
  const fraction = fiatAmount % divisor;

  if (decimals === 0) {
    return `${whole.toString()} ${fiatCurrency}`;
  }

  const fractionStr = fraction.toString().padStart(decimals, '0');
  return `${whole.toString()}.${fractionStr} ${fiatCurrency}`;
};

const drawField = (doc: PDFKit.PDFDocument, label: string, value: string): void => {
  doc.font('Helvetica-Bold').fontSize(10).text(label, { continued: true });
  doc.font('Helvetica').fontSize(10).text(`  ${value}`);
  doc.moveDown(0.5);
};

/**
 * Renders an invoice + merchant pair to a PDF buffer. Pure and side-effect
 * free: no database access, no filesystem or network writes. Callers are
 * responsible for fetching the records; this only formats what it's given.
 */
export const generateInvoicePdf = (invoice: Invoice, merchant: Merchant): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const logoBuffer = decodeLogo(merchant.logo);
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, { fit: [80, 80] });
        doc.moveDown();
      } catch (err) {
        // Corrupt/undecodable image data — skip it rather than fail the render,
        // but log so real failures (not just bad merchant uploads) stay visible.
        console.error(`Failed to embed invoice logo for merchant ${merchant.id}`, err);
      }
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(merchant.businessName || 'Invoice');
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(14).text('Invoice');
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(11).text(invoice.description);
    doc.moveDown();

    drawField(doc, 'Amount:', `${invoice.amount.toString()} ${invoice.token}`);

    if (
      invoice.pricingMode === FIXED_FIAT &&
      invoice.fiatAmount !== null &&
      invoice.fiatCurrency !== null &&
      invoice.fiatDecimals !== null
    ) {
      drawField(
        doc,
        'Fiat amount:',
        formatFiatAmount(invoice.fiatAmount, invoice.fiatDecimals, invoice.fiatCurrency),
      );
    }

    drawField(doc, 'Status:', invoice.status);
    drawField(doc, 'Payment link:', invoice.paymentSlug);
    drawField(doc, 'Created:', formatDate(invoice.createdAt));

    if (invoice.datePaid) {
      drawField(doc, 'Paid:', formatDate(invoice.datePaid));
    }

    if (invoice.payer) {
      drawField(doc, 'Payer address:', invoice.payer);
    }

    doc.end();
  });
};
