import bcrypt from 'bcrypt';
import prisma from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import { sendOtp } from './email.service.js';

const OTP_LENGTH = 6;
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const BCRYPT_ROUNDS = 10;

export const generateOtp = (): string => {
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
};

export const hashOtp = async (code: string): Promise<string> => bcrypt.hash(code, BCRYPT_ROUNDS);

export const verifyOtpHash = async (code: string, hash: string): Promise<boolean> =>
  bcrypt.compare(code, hash);

const getLastOtpSentAt = (expiresAt: Date): Date =>
  new Date(expiresAt.getTime() - OTP_EXPIRY_MS);

/**
 * Generates a 6-digit OTP, stores its bcrypt hash with a 10-minute expiry,
 * and sends the code to the merchant's email.
 */
export const issueEmailOtp = async (merchant: {
  id: string;
  email: string;
  firstName: string | null;
}): Promise<void> => {
  const code = generateOtp();
  const emailOtp = await hashOtp(code);
  const emailOtpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await prisma.merchant.update({
    where: { id: merchant.id },
    data: { emailOtp, emailOtpExpiresAt },
  });

  await sendOtp(merchant.email, code, merchant.firstName?.trim() || 'there');
};

/**
 * Validates the submitted OTP against the stored hash and marks the email verified.
 */
export const verifyEmailOtp = async (merchantId: string, code: string) => {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
  });

  if (!merchant?.emailOtp || !merchant.emailOtpExpiresAt) {
    throw new AppError(400, 'Invalid verification code');
  }

  if (merchant.emailOtpExpiresAt.getTime() < Date.now()) {
    throw new AppError(400, 'Code expired');
  }

  const isValid = await verifyOtpHash(code, merchant.emailOtp);
  if (!isValid) {
    throw new AppError(400, 'Invalid verification code');
  }

  return prisma.merchant.update({
    where: { id: merchantId },
    data: {
      emailVerified: true,
      emailOtp: null,
      emailOtpExpiresAt: null,
    },
  });
};

/**
 * Re-generates and re-sends the email OTP, rate-limited to one request per minute.
 */
export const resendEmailOtp = async (merchantId: string): Promise<void> => {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
  });

  if (!merchant) {
    throw new AppError(404, 'Merchant not found');
  }

  if (!merchant.registered || !merchant.email) {
    throw new AppError(400, 'Registration incomplete');
  }

  if (merchant.emailVerified) {
    throw new AppError(400, 'Email already verified');
  }

  if (merchant.emailOtpExpiresAt) {
    const lastSentAt = getLastOtpSentAt(merchant.emailOtpExpiresAt);
    if (Date.now() - lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
      throw new AppError(429, 'Please wait before requesting a new code');
    }
  }

  await issueEmailOtp({
    id: merchant.id,
    email: merchant.email,
    firstName: merchant.firstName,
  });
};
