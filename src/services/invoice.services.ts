import type { Invoice, InvoiceStatus as PrismaInvoiceStatus, Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import { generatePaymentSlug } from '../utils/slug.js';
import {
  CreateInvoiceInput,
  InvoiceListFilters,
  InvoicePagination,
  parseAmount,
} from '../utils/invoice.validation.js';
import type { InvoicePaidEventData } from '../indexer/types.js';

const SLUG_MAX_RETRIES = 5;

// String constants matching the Prisma `Status` enum. Defined locally so this
// module never imports a runtime value from `@prisma/client` (the generated
// client is mocked in tests and not generated in CI).
const InvoiceStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  PAID: 'PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  CANCELLED: 'CANCELLED',
} as const satisfies Record<string, PrismaInvoiceStatus>;

const TransactionType = {
  INVOICE_PAYMENT: 'INVOICE_PAYMENT',
} as const;

/**
 * Public-facing view of an invoice. `amount` is serialized to a string because
 * `BigInt` is not JSON-serializable.
 */
export const sanitizeInvoice = (invoice: Invoice) => ({
  id: invoice.id,
  paymentSlug: invoice.paymentSlug,
  description: invoice.description,
  amount: invoice.amount.toString(),
  token: invoice.token,
  status: invoice.status,
  merchantId: invoice.merchantId,
  email: invoice.email,
  expiresAt: invoice.expiresAt,
  datePaid: invoice.datePaid,
  createdAt: invoice.createdAt,
  updatedAt: invoice.updatedAt,
});

const isUniqueSlugError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;
  const { code, meta } = error as { code?: string; meta?: { target?: unknown } };
  return code === 'P2002' && Array.isArray(meta?.target) && meta.target.includes('paymentSlug');
};

export const createInvoice = async (merchantId: string, data: CreateInvoiceInput) => {
  const amount = parseAmount(data.amount);
  if (amount === null) {
    throw new AppError(400, 'amount must be a positive integer');
  }

  const status: PrismaInvoiceStatus = data.isDraft ? InvoiceStatus.DRAFT : InvoiceStatus.PENDING;
  const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

  for (let attempt = 0; attempt < SLUG_MAX_RETRIES; attempt++) {
    try {
      const invoice = await prisma.invoice.create({
        data: {
          merchantId,
          description: data.description.trim(),
          amount,
          token: data.token.trim(),
          email: data.payerEmail?.trim() ?? null,
          expiresAt,
          status,
          paymentSlug: generatePaymentSlug(),
        },
      });
      return sanitizeInvoice(invoice);
    } catch (error) {
      if (isUniqueSlugError(error) && attempt < SLUG_MAX_RETRIES - 1) {
        continue;
      }
      throw error;
    }
  }

  throw new AppError(500, 'Failed to generate a unique payment slug');
};

export const listInvoices = async (
  merchantId: string,
  filters: InvoiceListFilters,
  pagination: InvoicePagination,
) => {
  const where: Prisma.InvoiceWhereInput = { merchantId };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.token) {
    where.token = filters.token;
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = filters.startDate;
    if (filters.endDate) where.createdAt.lte = filters.endDate;
  }

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      take: pagination.limit,
      skip: pagination.offset,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    data: invoices.map(sanitizeInvoice),
    pagination: {
      limit: pagination.limit,
      offset: pagination.offset,
      total,
    },
  };
};

export const getInvoice = async (merchantId: string, id: string) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id, merchantId },
  });

  if (!invoice) {
    throw new AppError(404, 'Invoice not found');
  }

  return sanitizeInvoice(invoice);
};

/**
 * Fetches the raw invoice + merchant records, scoped to the owning merchant,
 * for the PDF/email flows that need fields beyond the sanitized public view
 * (payer address, fiat breakdown, merchant logo).
 */
export const getInvoiceWithMerchant = async (merchantId: string, id: string) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id, merchantId },
    include: { merchant: true },
  });

  if (!invoice) {
    throw new AppError(404, 'Invoice not found');
  }

  return invoice;
};

export const voidInvoice = async (merchantId: string, id: string) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id, merchantId },
  });

  if (!invoice) {
    throw new AppError(404, 'Invoice not found');
  }

  if (invoice.status !== InvoiceStatus.PENDING) {
    throw new AppError(400, 'Only pending invoices can be voided');
  }

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: InvoiceStatus.CANCELLED },
  });

  return sanitizeInvoice(updated);
};

/**
 * Applies a confirmed on-chain invoice payment to the backend projection.
 *
 * The indexer's IndexerEvent table is the only replay guard. Do not add an
 * event-level guard here: this service deliberately owns state mutation only.
 * Deposit-account payment detection is intentionally out of scope; it will be
 * handled by a dedicated indexer handler in a follow-up issue.
 */
export const applyInvoicePayment = async (event: InvoicePaidEventData, txHash: string) => {
  const invoice = await prisma.invoice.findUnique({
    where: { invoiceId: event.invoiceId },
  });

  if (!invoice) {
    console.warn(
      `InvoicePaid event for invoice ${event.invoiceId} (${txHash}) skipped: invoice is not in the database.`,
    );
    return null;
  }

  const merchant = await prisma.merchant.findUnique({
    where: { merchantId: event.merchantId },
  });

  if (!merchant) {
    console.warn(
      `InvoicePaid event for invoice ${event.invoiceId} (${txHash}) skipped: merchant ${event.merchantId} is not in the database.`,
    );
    return null;
  }

  if (invoice.merchantId !== merchant.id) {
    console.warn(
      `InvoicePaid event for invoice ${event.invoiceId} (${txHash}) skipped: invoice and event merchants do not match.`,
    );
    return null;
  }

  const paidAt = new Date(event.timestamp * 1000);
  const description = `Invoice #${event.invoiceId} payment${txHash ? ` (${txHash})` : ''}`;

  return prisma.$transaction(async (tx: any) => {
    const transactionInvoice = await tx.invoice.findUniqueOrThrow({
      where: { invoiceId: event.invoiceId },
    });
    const amountPaid = transactionInvoice.amountPaid + event.amount;
    const status: PrismaInvoiceStatus =
      amountPaid >= transactionInvoice.amount ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

    const updatedInvoice = await tx.invoice.update({
      where: { id: transactionInvoice.id },
      data: {
        status,
        payer: event.payer,
        amountPaid,
        datePaid: status === InvoiceStatus.PAID ? paidAt : null,
      },
    });

    const transaction = await tx.transaction.create({
      data: {
        transactionType: TransactionType.INVOICE_PAYMENT,
        refId: event.invoiceId,
        amount: event.amount,
        token: event.token,
        description,
        merchantId: merchant.id,
        date: paidAt,
      },
    });

    return { invoice: updatedInvoice, transaction };
  });
};
