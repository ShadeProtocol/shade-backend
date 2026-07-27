import prisma from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
const InvoiceStatus = {
    DRAFT: 'DRAFT',
    PENDING: 'PENDING',
    PAID: 'PAID',
    CANCELLED: 'CANCELLED',
    REFUNDED: 'REFUNDED',
};
const assertInvoiceVisible = (invoice) => {
    if (invoice.status === InvoiceStatus.CANCELLED ||
        invoice.status === InvoiceStatus.PAID ||
        invoice.status === InvoiceStatus.REFUNDED) {
        throw new AppError(410, 'Invoice is no longer available');
    }
    if (invoice.expiresAt && invoice.expiresAt < new Date()) {
        throw new AppError(410, 'expired');
    }
};
export const resolveInvoiceBySlug = async (slug) => {
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
    assertInvoiceVisible(invoice);
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
/**
 * Fetches the full invoice + merchant records for a publicly visible invoice,
 * applying the same 404/410 visibility rules as `resolveInvoiceBySlug`. Used
 * by the public PDF download route, which needs raw fields (payer, dates,
 * fiat breakdown, logo) rather than the trimmed public-facing view.
 */
export const getInvoiceForPdfBySlug = async (slug) => {
    const invoice = await prisma.invoice.findUnique({
        where: { paymentSlug: slug },
        include: { merchant: true },
    });
    if (!invoice) {
        throw new AppError(404, 'Invoice not found');
    }
    assertInvoiceVisible(invoice);
    return invoice;
};
export const confirmPayment = async (slug, payerAddress, txHash) => {
    return await prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.findUnique({
            where: { paymentSlug: slug },
        });
        if (!invoice) {
            throw new AppError(404, 'Invoice not found');
        }
        assertInvoiceVisible(invoice);
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
