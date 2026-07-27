import prisma from '../config/prisma.js';
import { AppError } from '../utils/errors.js';
import { generateApiKeyMaterial, hashApiKey, MAX_ACTIVE_API_KEYS } from '../utils/api-key.utils.js';
const toApiKeySummary = (apiKey) => ({
    id: apiKey.id,
    prefix: apiKey.prefix ?? '',
    label: apiKey.name,
    lastUsedAt: apiKey.lastUsedAt,
    createdAt: apiKey.createdAt,
});
const activeApiKeyWhere = (merchantId) => ({
    merchantId,
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});
export const createApiKey = async (merchantId, label) => {
    const { rawKey, prefix, keyHash } = generateApiKeyMaterial();
    const normalizedLabel = label?.trim() || null;
    const apiKey = await prisma.$transaction(async (tx) => {
        const activeKeys = await tx.apiKey.count({
            where: activeApiKeyWhere(merchantId),
        });
        if (activeKeys >= MAX_ACTIVE_API_KEYS) {
            throw new AppError(400, `Maximum of ${MAX_ACTIVE_API_KEYS} active API keys allowed`);
        }
        return tx.apiKey.create({
            data: {
                merchantId,
                keyHash,
                prefix,
                name: normalizedLabel,
            },
        });
    });
    return {
        ...toApiKeySummary(apiKey),
        key: rawKey,
    };
};
export const listApiKeys = async (merchantId) => {
    const apiKeys = await prisma.apiKey.findMany({
        where: {
            merchantId,
            revokedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            prefix: true,
            name: true,
            lastUsedAt: true,
            createdAt: true,
        },
    });
    return apiKeys.map(toApiKeySummary);
};
export const revokeApiKey = async (merchantId, keyId) => {
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
export const authenticateApiKey = async (rawKey) => {
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
