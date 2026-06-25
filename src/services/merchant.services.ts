import { Merchant } from '@prisma/client';
import prisma from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import { RegisterMerchantInput } from '../utils/validation.js';
import { generateOtp, hashOtp } from './otp.services.js';
import { sendOtp } from './email.service.js';

const OTP_EXPIRY_MS = 10 * 60 * 1000;

interface MerchantData {
  merchantId: number;
  email?: string;
  address: string;
  active?: boolean;
  verified?: boolean;
}

/**
 * Returns a public-facing view of a merchant. Built as an allow-list so that
 * any sensitive fields added to the model later are never exposed by default.
 */
export const sanitizeMerchant = (merchant: Merchant) => ({
  id: merchant.id,
  merchantId: merchant.merchantId,
  email: merchant.email,
  address: merchant.address,
  firstName: merchant.firstName,
  lastName: merchant.lastName,
  businessName: merchant.businessName,
  category: merchant.category,
  description: merchant.description,
  logo: merchant.logo,
  active: merchant.active,
  verified: merchant.verified,
  emailVerified: merchant.emailVerified,
  registered: merchant.registered,
  createdAt: merchant.createdAt,
  updatedAt: merchant.updatedAt,
});

export const createMerchant = async (merchantData: MerchantData) => {
  try {
    const merchant = await prisma.merchant.create({
      data: merchantData,
    });
    return merchant;
  } catch (error) {
    throw error;
  }
};

export const getMerchant = async (merchantId: number) => {
  try {
    const merchant = await prisma.merchant.findUnique({
      where: {
        merchantId: merchantId,
      },
    });
    return merchant;
  } catch (error) {
    throw error;
  }
};

export const listMerchants = async (limit: number, offset: number) => {
  try {
    const merchants = await prisma.merchant.findMany({
      take: limit,
      skip: offset,
    });
    return merchants;
  } catch (error) {
    throw error;
  }
};

/**
 * Completes a merchant's profile after wallet authentication.
 *
 * Enforces that the email is unique across merchants and that the profile has
 * not already been completed, persists the profile data, resets email
 * verification, and triggers an OTP email.
 */
export const registerMerchant = async (merchantId: string, data: RegisterMerchantInput) => {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
  });

  if (!merchant) {
    throw new AppError(404, 'Merchant not found');
  }

  if (merchant.registered) {
    throw new AppError(409, 'Profile already set up');
  }

  const normalizedEmail = data.email.trim().toLowerCase();

  const existingEmail = await prisma.merchant.findFirst({
    where: {
      email: normalizedEmail,
      NOT: { id: merchantId },
    },
  });

  if (existingEmail) {
    throw new AppError(409, 'Email already registered');
  }

  const code = generateOtp();
  const emailOtp = await hashOtp(code);
  const emailOtpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  const updatedMerchant = await prisma.merchant.update({
    where: { id: merchantId },
    data: {
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      email: normalizedEmail,
      businessName: data.businessName.trim(),
      category: data.category.trim(),
      description: data.description.trim(),
      logo: data.logo?.trim() ?? null,
      emailVerified: false,
      registered: true,
      emailOtp,
      emailOtpExpiresAt,
    },
  });

  try {
    await sendOtp(normalizedEmail, code, data.firstName.trim());
  } catch (err) {
    console.error('Failed to send OTP email after registration', err);
  }

  return sanitizeMerchant(updatedMerchant);
};
