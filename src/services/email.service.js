import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { environment } from '../config/environment.js';
import { generateInvoicePdf } from './invoice-pdf.services.js';
const escapeHtml = (value) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const buildOtpEmailContent = (firstName, code) => {
    const safeFirstName = escapeHtml(firstName);
    const subject = 'Verify your Shade email';
    const html = `
    <p>Hi ${safeFirstName},</p>
    <p>Your email verification code is:</p>
    <p><strong style="font-size: 24px; letter-spacing: 4px;">${code}</strong></p>
    <p>This code expires in 10 minutes.</p>
  `.trim();
    const text = `Hi ${firstName},\n\nYour verification code is: ${code}\n\nThis code expires in 10 minutes.`;
    return { subject, html, text };
};
const sendViaResend = async (to, subject, html, attachments) => {
    const resend = new Resend(environment.email.resendApiKey);
    const { error } = await resend.emails.send({
        from: environment.email.from,
        to,
        subject,
        html,
        attachments: attachments?.map(({ filename, content }) => ({ filename, content })),
    });
    if (error) {
        throw new Error(`Failed to send email via Resend: ${error.message}`);
    }
};
const sendViaSmtp = async (to, subject, html, text, attachments) => {
    const transporter = nodemailer.createTransport({
        host: environment.email.smtp.host,
        port: environment.email.smtp.port,
        secure: environment.email.smtp.secure,
        auth: {
            user: environment.email.smtp.user,
            pass: environment.email.smtp.pass,
        },
    });
    await transporter.sendMail({
        from: environment.email.from,
        to,
        subject,
        html,
        text,
        attachments,
    });
};
/**
 * Delivers a one-time verification code to the merchant's email address.
 */
export const sendOtp = async (to, code, firstName) => {
    const { subject, html, text } = buildOtpEmailContent(firstName, code);
    switch (environment.email.provider) {
        case 'resend':
            await sendViaResend(to, subject, html);
            return;
        case 'smtp':
            await sendViaSmtp(to, subject, html, text);
            return;
        case 'console':
        default:
            console.log(`[OTP] Verification code ${code} sent to ${to} for ${firstName}`);
    }
};
const buildInvoiceEmailContent = (invoice, merchant) => {
    const merchantName = escapeHtml(merchant.businessName || 'Your merchant');
    const description = escapeHtml(invoice.description);
    const subject = `Invoice from ${merchant.businessName || 'Shade'}: ${invoice.description}`;
    const html = `
    <p>Hi,</p>
    <p>${merchantName} has sent you an invoice for <strong>${description}</strong>.</p>
    <p>Amount: <strong>${invoice.amount.toString()} ${escapeHtml(invoice.token)}</strong></p>
    <p>Status: <strong>${invoice.status}</strong></p>
    <p>Your invoice is attached as a PDF.</p>
  `.trim();
    const text = `Hi,\n\n${merchant.businessName || 'Your merchant'} has sent you an invoice for ${invoice.description}.\n\nAmount: ${invoice.amount.toString()} ${invoice.token}\nStatus: ${invoice.status}\n\nYour invoice is attached as a PDF.`;
    return { subject, html, text };
};
/**
 * Emails the invoice to `invoice.email` with a freshly generated PDF attached.
 * No-ops (does not throw) when the invoice has no email on file — callers
 * that need to surface that as a user-facing error (e.g. the /send route)
 * should check `invoice.email` before calling this.
 */
export const sendInvoiceEmail = async (invoice, merchant) => {
    if (!invoice.email) {
        return;
    }
    const pdf = await generateInvoicePdf(invoice, merchant);
    const { subject, html, text } = buildInvoiceEmailContent(invoice, merchant);
    const attachments = [
        { filename: `invoice-${invoice.paymentSlug}.pdf`, content: pdf },
    ];
    switch (environment.email.provider) {
        case 'resend':
            await sendViaResend(invoice.email, subject, html, attachments);
            return;
        case 'smtp':
            await sendViaSmtp(invoice.email, subject, html, text, attachments);
            return;
        case 'console':
        default:
            console.log(`[Invoice email] Invoice ${invoice.paymentSlug} (${pdf.length} byte PDF) sent`);
    }
};
