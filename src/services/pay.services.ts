import prisma from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import type { InvoiceStatus as PrismaInvoiceStatus } from '@prisma/client';

const InvoiceStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const satisfies Record<string, PrismaInvoiceStatus>;

export const resolveInvoiceBySlug = async (slug: string) => {
  const invoice = await prisma.invoice.findUnique({
    where: { paymentSlug: slug },
    select: {
      paymentSlug: true,
      description: true,
      amount: true,
      token: true,
      status: true,
      expiresAt: true,
      pricingMode: true,
      merchant: {
        select: {
          businessName: true,
        },
      },
    },
  });

  if (!invoice) {
    throw new AppError(404, 'Invoice not found');
  }

  if (
    invoice.status === InvoiceStatus.CANCELLED ||
    invoice.status === InvoiceStatus.PAID ||
    invoice.status === InvoiceStatus.REFUNDED
  ) {
    throw new AppError(410, 'Invoice is no longer available');
  }

  if (invoice.expiresAt && invoice.expiresAt < new Date()) {
    throw new AppError(410, 'expired');
  }

  return {
    slug: invoice.paymentSlug,
    description: invoice.description,
    amount: invoice.amount.toString(),
    token: invoice.token,
    status: invoice.status,
    merchantName: invoice.merchant.businessName,
    expiresAt: invoice.expiresAt,
    pricingMode: invoice.pricingMode,
  };
};

export const confirmPayment = async (slug: string, payerAddress: string, txHash?: string) => {
  return await prisma.$transaction(async tx => {
    const invoice = await tx.invoice.findUnique({
      where: { paymentSlug: slug },
    });

    if (!invoice) {
      throw new AppError(404, 'Invoice not found');
    }

    if (
      invoice.status === InvoiceStatus.CANCELLED ||
      invoice.status === InvoiceStatus.PAID ||
      invoice.status === InvoiceStatus.REFUNDED
    ) {
      throw new AppError(410, 'Invoice is no longer available');
    }

    if (invoice.expiresAt && invoice.expiresAt < new Date()) {
      throw new AppError(410, 'expired');
    }

    const idempotencyKey = `${invoice.id}-${payerAddress}-${txHash || 'none'}`;

    const confirmation = await tx.paymentConfirmation.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        invoiceId: invoice.id,
        merchantId: invoice.merchantId,
        payerAddress,
        txHash: txHash || null,
        idempotencyKey,
      },
    });

    return confirmation;
  });
};
