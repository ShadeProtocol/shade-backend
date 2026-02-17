import prisma from '../config/prisma.js';

interface MerchantData {
  merchantId: number;
  email?: string;
  address: string;
  active?: boolean;
  verified?: boolean;
}

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
