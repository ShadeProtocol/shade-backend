import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Keypair } from '@stellar/stellar-sdk';
import prisma from '../config/prisma.js';
import { environment } from '../config/environment.js';
const NONCE_EXPIRY_MS = 5 * 60 * 1000;
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
export function buildChallengeMessage(address, nonce, createdAt) {
    return [
        'Shade Authentication',
        `Address: ${address}`,
        `Nonce: ${nonce}`,
        `Timestamp: ${createdAt.toISOString()}`,
    ].join('\n');
}
export async function createNonce(address) {
    const nonce = crypto.randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + NONCE_EXPIRY_MS);
    const message = buildChallengeMessage(address, nonce, createdAt);
    const authNonce = await prisma.authNonce.create({
        data: { address, nonce, message, expiresAt },
    });
    return { nonce: authNonce.nonce, message: authNonce.message, expiresAt: authNonce.expiresAt };
}
export async function verifySignature(address, nonce, rawSignature) {
    const authNonce = await prisma.authNonce.findUnique({ where: { nonce } });
    if (!authNonce) {
        return { valid: false, reason: 'Nonce not found' };
    }
    if (authNonce.address !== address) {
        return { valid: false, reason: 'Address mismatch' };
    }
    if (authNonce.usedAt) {
        return { valid: false, reason: 'Nonce already used' };
    }
    if (new Date() > authNonce.expiresAt) {
        return { valid: false, reason: 'Nonce expired' };
    }
    const message = buildChallengeMessage(address, authNonce.nonce, authNonce.createdAt);
    const messageBytes = Buffer.from(message, 'utf-8');
    const signatureBytes = Buffer.from(rawSignature, 'hex');
    let isValid;
    try {
        const keypair = Keypair.fromPublicKey(address);
        isValid = keypair.verify(messageBytes, signatureBytes);
    }
    catch {
        return { valid: false, reason: 'Invalid address or signature format' };
    }
    if (!isValid) {
        return { valid: false, reason: 'Signature verification failed' };
    }
    await prisma.authNonce.update({
        where: { id: authNonce.id },
        data: { usedAt: new Date() },
    });
    return { valid: true, reason: null };
}
export async function upsertMerchant(address) {
    const existing = await prisma.merchant.findFirst({ where: { address } });
    if (existing) {
        return existing;
    }
    const merchantId = crypto.randomInt(100_000, 999_999);
    const merchant = await prisma.merchant.create({
        data: { merchantId, address },
    });
    return merchant;
}
export function issueAccessToken(merchantId, address) {
    return jwt.sign({ sub: merchantId, address }, environment.jwtSecret, { expiresIn: '15m' });
}
export async function issueRefreshToken(merchantId) {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
    await prisma.refreshToken.create({
        data: { merchantId, token, expiresAt },
    });
    return token;
}
export async function authenticateWallet(address, nonce, signature) {
    const verification = await verifySignature(address, nonce, signature);
    if (!verification.valid) {
        return { success: false, reason: verification.reason };
    }
    const merchant = await upsertMerchant(address);
    const accessToken = issueAccessToken(merchant.id, merchant.address);
    const refreshToken = await issueRefreshToken(merchant.id);
    return {
        success: true,
        accessToken,
        refreshToken,
        merchant: {
            id: merchant.id,
            address: merchant.address,
            isRegistered: merchant.registered,
        },
    };
}
