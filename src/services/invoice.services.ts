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
import type {
  InvoicePaidEventData,
  InvoicePartiallyRefundedEventData,
  InvoiceRefundedEventData,
} from '../indexer/types.js';
import { recordVolumeEvent } from './analytics.services.js';

const SLUG_MAX_RETRIES = 5;
const INVOICE_DESCRIPTION_MAX_LENGTH = 100;

// String constants matching the Prisma `Status` enum. Defined locally so this
// module never imports a runtime value from `@prisma/client` (the generated
// client is mocked in tests and not generated in CI).
const InvoiceStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  PAID: 'PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
} as const satisfies Record<string, PrismaInvoiceStatus>;

const TransactionType = {
  INVOICE_PAYMENT: 'INVOICE_PAYMENT',
} as const;

/**
 * Public-facing view of an invoice. `amount` is serialized to a string because
 * `BigInt` is not JSON-serializable.
 */
export interface AmendInvoiceInput {
  email?: string | null;
  amount?: string | number;
  description?: string;
}

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

export const amendInvoice = async (merchantId: string, id: string, data: AmendInvoiceInput) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id, merchantId },
  });

  if (!invoice) {
    throw new AppError(404, 'Invoice not found');
  }

  if (invoice.status !== InvoiceStatus.PENDING) {
    throw new AppError(400, 'Only pending invoices can be amended');
  }

  const updateData: Prisma.InvoiceUpdateInput = {};

  if (data.email !== undefined) {
    updateData.email = data.email === null ? null : data.email.trim();
  }

  if (data.amount !== undefined) {
    const amount = parseAmount(data.amount);
    if (amount === null) {
      throw new AppError(400, 'amount must be a positive integer');
    }
    updateData.amount = amount;
  }

  if (data.description !== undefined) {
    const description =
      typeof data.description === 'string' ? data.description.trim() : data.description;
    if (typeof description !== 'string') {
      throw new AppError(400, 'description must be a string');
    }
    if (description.length > INVOICE_DESCRIPTION_MAX_LENGTH) {
      throw new AppError(400, 'description exceeds the maximum length of 100 characters');
    }
    updateData.description = description;
  }

  if (Object.keys(updateData).length === 0) {
    return sanitizeInvoice(invoice);
  }

  // This endpoint updates the DB record only. On-chain amend_invoice reconciliation is intentionally out of scope.
  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: updateData,
  });

  return sanitizeInvoice(updated);
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

    await recordVolumeEvent(tx, {
      merchantId: merchant.id,
      token: event.token,
      // The contract feeds its own analytics the gross amount and the fee taken
      // out of it, so the projection mirrors that rather than merchantAmount.
      volume: event.amount,
      fee: event.fee,
      occurredAt: paidAt,
    });

    return { invoice: updatedInvoice, transaction };
  });
};

const clampRefund = (reported: bigint, alreadyRefunded: bigint, invoiceAmount: bigint): bigint => {
  if (reported > invoiceAmount) return invoiceAmount;
  if (reported < alreadyRefunded) return alreadyRefunded;
  return reported;
};

/**
 * Applies a confirmed on-chain refund to the backend projection.
 *
 * Refunds deliberately do not touch MerchantAnalytics/TokenAnalytics/
 * PlatformDailyStats: the contract's `record_merchant_payment` is only reached
 * from the payment paths (invoice payment, subscription charge, ticket sale)
 * and never from `refund_invoice`/`refund_invoice_partial`, so on-chain
 * `total_volume` is not reduced by a refund. Refund totals are read back
 * separately from `Invoice.amountRefunded`.
 */
export const applyInvoiceRefund = async (
  event: InvoiceRefundedEventData | InvoicePartiallyRefundedEventData,
  txHash: string,
) => {
  const invoice = await prisma.invoice.findUnique({
    where: { invoiceId: event.invoiceId },
  });

  if (!invoice) {
    console.warn(
      `Refund event for invoice ${event.invoiceId} (${txHash}) skipped: invoice is not in the database.`,
    );
    return null;
  }

  return prisma.$transaction(async (tx: any) => {
    const current = await tx.invoice.findUniqueOrThrow({
      where: { invoiceId: event.invoiceId },
    });

    // Both refund events report an absolute total, never an increment: the
    // partial event carries `total_amount_refunded`, and the full event's
    // `amount` is the invoice's whole amount — `refund_invoice` and the
    // completing branch of `refund_invoice_partial` both pass `invoice.amount`,
    // not the chunk just refunded.
    const reportedRefund =
      'totalAmountRefunded' in event ? event.totalAmountRefunded : event.amount;

    // Clamped to the invoice total and never allowed to move backwards, so a
    // replayed or out-of-order refund event cannot skew the refund total that
    // /admin/analytics/summary reports.
    const amountRefunded = clampRefund(reportedRefund, current.amountRefunded, current.amount);

    const status: PrismaInvoiceStatus =
      amountRefunded >= current.amount ? InvoiceStatus.REFUNDED : InvoiceStatus.PARTIALLY_REFUNDED;

    return tx.invoice.update({
      where: { id: current.id },
      data: { amountRefunded, status },
    });
  });
};
