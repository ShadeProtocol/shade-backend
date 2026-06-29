import { ApiKey, Merchant } from '@prisma/client';
import prisma from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import { generateApiKeyMaterial, hashApiKey, MAX_ACTIVE_API_KEYS } from '../utils/api-key.utils.js';

export type ApiKeySummary = {
  id: string;
  prefix: string;
  label: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export type CreateApiKeyResult = ApiKeySummary & {
  key: string;
};

const toApiKeySummary = (apiKey: ApiKey): ApiKeySummary => ({
  id: apiKey.id,
  prefix: apiKey.prefix,
  label: apiKey.name,
  lastUsedAt: apiKey.lastUsedAt,
  createdAt: apiKey.createdAt,
});

const countActiveApiKeys = async (merchantId: string): Promise<number> =>
  prisma.apiKey.count({
    where: {
      merchantId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

export const createApiKey = async (
  merchantId: string,
  label?: string,
): Promise<CreateApiKeyResult> => {
  const activeKeys = await countActiveApiKeys(merchantId);
  if (activeKeys >= MAX_ACTIVE_API_KEYS) {
    throw new AppError(400, 'Maximum of 10 active API keys allowed');
  }

  const { rawKey, prefix, keyHash } = generateApiKeyMaterial();
  const normalizedLabel = label?.trim() || null;

  const apiKey = await prisma.apiKey.create({
    data: {
      merchantId,
      keyHash,
      prefix,
      name: normalizedLabel,
    },
  });

  return {
    ...toApiKeySummary(apiKey),
    key: rawKey,
  };
};

export const listApiKeys = async (merchantId: string): Promise<ApiKeySummary[]> => {
  const apiKeys = await prisma.apiKey.findMany({
    where: {
      merchantId,
      revokedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });

  return apiKeys.map(toApiKeySummary);
};

export const revokeApiKey = async (merchantId: string, keyId: string): Promise<void> => {
  const apiKey = await prisma.apiKey.findFirst({
    where: { id: keyId, merchantId },
  });

  if (!apiKey) {
    throw new AppError(404, 'API key not found');
  }

  if (apiKey.revokedAt) {
    throw new AppError(400, 'API key already revoked');
  }

  await prisma.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
  });
};

export const authenticateApiKey = async (rawKey: string): Promise<Merchant | null> => {
  const keyHash = hashApiKey(rawKey);
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { merchant: true },
  });

  if (!apiKey || apiKey.revokedAt) {
    return null;
  }

  if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
    return null;
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  return apiKey.merchant;
};
