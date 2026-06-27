import { Merchant, Prisma } from '@prisma/client';
import prisma from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import { RegisterMerchantInput, UpdateMerchantInput } from '../utils/validation.js';
import { sendOtpEmail } from './otp.services.js';

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
  account: merchant.account,
  firstName: merchant.firstName,
  lastName: merchant.lastName,
  businessName: merchant.businessName,
  category: merchant.category,
  description: merchant.description,
  logo: merchant.logo,
  webhook: merchant.webhook,
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
    },
  });

  await sendOtpEmail(normalizedEmail);

  return sanitizeMerchant(updatedMerchant);
};

/**
 * Returns the authenticated merchant's own profile.
 */
export const getMyProfile = async (id: string) => {
  const merchant = await prisma.merchant.findUnique({ where: { id } });

  if (!merchant) {
    throw new AppError(404, 'Merchant not found');
  }

  return sanitizeMerchant(merchant);
};

/**
 * Partially updates the authenticated merchant's editable profile fields.
 *
 * Only fields present in `data` are written. Strings are trimmed; an empty
 * `logo`/`webhook` is normalized to null so the merchant can clear them.
 * Non-editable fields are never read here, so they cannot be changed.
 */
export const updateMyProfile = async (id: string, data: UpdateMerchantInput) => {
  const updateData: Prisma.MerchantUpdateInput = {};

  const textFields = ['firstName', 'lastName', 'businessName', 'category', 'description'] as const;
  for (const field of textFields) {
    const value = data[field];
    if (value !== undefined) {
      updateData[field] = value.trim();
    }
  }

  if (data.logo !== undefined) {
    const logo = typeof data.logo === 'string' ? data.logo.trim() : data.logo;
    updateData.logo = logo ? logo : null;
  }

  if (data.webhook !== undefined) {
    const webhook = typeof data.webhook === 'string' ? data.webhook.trim() : data.webhook;
    updateData.webhook = webhook ? webhook : null;
  }

  const updated = await prisma.merchant.update({ where: { id }, data: updateData });

  return sanitizeMerchant(updated);
};
