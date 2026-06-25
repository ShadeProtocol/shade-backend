import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { environment } from '../config/environment.js';

const buildOtpEmailContent = (firstName: string, code: string) => {
  const subject = 'Verify your Shade email';
  const html = `
    <p>Hi ${firstName},</p>
    <p>Your email verification code is:</p>
    <p><strong style="font-size: 24px; letter-spacing: 4px;">${code}</strong></p>
    <p>This code expires in 10 minutes.</p>
  `.trim();
  const text = `Hi ${firstName},\n\nYour verification code is: ${code}\n\nThis code expires in 10 minutes.`;

  return { subject, html, text };
};

const sendViaResend = async (to: string, subject: string, html: string): Promise<void> => {
  const resend = new Resend(environment.email.resendApiKey);
  const { error } = await resend.emails.send({
    from: environment.email.from,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Failed to send email via Resend: ${error.message}`);
  }
};

const sendViaSmtp = async (
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<void> => {
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
  });
};

/**
 * Delivers a one-time verification code to the merchant's email address.
 */
export const sendOtp = async (to: string, code: string, firstName: string): Promise<void> => {
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
