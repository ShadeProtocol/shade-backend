import { randomInt } from 'node:crypto';
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
  return randomInt(min, max + 1).toString();
};

export const hashOtp = async (code: string): Promise<string> => bcrypt.hash(code, BCRYPT_ROUNDS);

export const verifyOtpHash = async (code: string, hash: string): Promise<boolean> =>
  bcrypt.compare(code, hash);

/**
 * Generates a 6-digit OTP, stores its bcrypt hash as a new EmailOtp row with a
 * 10-minute expiry, and sends the code to the merchant's email. Previous codes
 * are left untouched; verification always uses the most recent one.
 */
export const issueEmailOtp = async (merchant: {
  id: string;
  email: string;
  firstName: string | null;
}): Promise<void> => {
  const code = generateOtp();
  const codeHash = await hashOtp(code);

  await prisma.emailOtp.create({
    data: {
      merchantId: merchant.id,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
    },
  });

  await sendOtp(merchant.email, code, merchant.firstName?.trim() || 'there');
};

/**
 * Validates the submitted OTP against the merchant's most recent unused code and
 * marks the email verified. The matched row is stamped usedAt so it cannot be
 * replayed.
 */
export const verifyEmailOtp = async (merchantId: string, code: string) => {
  const otp = await prisma.emailOtp.findFirst({
    where: { merchantId, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) {
    throw new AppError(400, 'Invalid verification code');
  }

  if (otp.expiresAt.getTime() < Date.now()) {
    throw new AppError(400, 'Code expired');
  }

  const isValid = await verifyOtpHash(code, otp.codeHash);
  if (!isValid) {
    throw new AppError(400, 'Invalid verification code');
  }

  await prisma.emailOtp.update({
    where: { id: otp.id },
    data: { usedAt: new Date() },
  });

  return prisma.merchant.update({
    where: { id: merchantId },
    data: { emailVerified: true },
  });
};

/**
 * Re-generates and re-sends the email OTP, rate-limited to one request per
 * minute by checking for an EmailOtp row created within the cooldown window.
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

  const recentOtp = await prisma.emailOtp.findFirst({
    where: {
      merchantId,
      createdAt: { gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS) },
    },
  });

  if (recentOtp) {
    throw new AppError(429, 'Please wait before requesting a new code');
  }

  await issueEmailOtp({
    id: merchant.id,
    email: merchant.email,
    firstName: merchant.firstName,
  });
};
