import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Keypair } from '@stellar/stellar-sdk';
import prisma from '../config/prisma.js';
import { environment } from '../config/environment.js';

const NONCE_EXPIRY_MS = 5 * 60 * 1000;
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_NONCE_CREATE_ATTEMPTS = 3;

function formatChallengeResponse(authNonce: {
  message: string;
  nonce: string;
  expiresAt: Date;
}) {
  return {
    message: authNonce.message,
    nonce: authNonce.nonce,
    expiresAt: authNonce.expiresAt,
  };
}

function isActiveNonceConflict(error: unknown): boolean {
  return (error as { code?: string })?.code === 'P2002';
}

async function findActiveNonceForAddress(address: string, now: Date) {
  return prisma.authNonce.findFirst({
    where: {
      address,
      usedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function createNonceInTransaction(address: string, now: Date) {
  const nonce = crypto.randomBytes(32).toString('hex');
  const createdAt = now;
  const expiresAt = new Date(createdAt.getTime() + NONCE_EXPIRY_MS);
  const message = buildChallengeMessage(address, nonce, createdAt);

  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${address}))`;

    await tx.authNonce.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { address, usedAt: null }],
      },
    });

    return tx.authNonce.create({
      data: { address, nonce, message, expiresAt },
    });
  });
}

export function buildChallengeMessage(address: string, nonce: string, createdAt: Date): string {
  return [
    'Shade Authentication',
    `Address: ${address}`,
    `Nonce: ${nonce}`,
    `Timestamp: ${createdAt.toISOString()}`,
  ].join('\n');
}

export async function createNonce(address: string) {
  const now = new Date();

  for (let attempt = 0; attempt < MAX_NONCE_CREATE_ATTEMPTS; attempt++) {
    try {
      const authNonce = await createNonceInTransaction(address, now);
      return formatChallengeResponse(authNonce);
    } catch (error) {
      if (!isActiveNonceConflict(error)) {
        throw error;
      }

      const existing = await findActiveNonceForAddress(address, now);
      if (existing) {
        return formatChallengeResponse(existing);
      }
    }
  }

  throw new Error('Failed to create auth challenge after concurrent conflict');
}

export async function verifySignature(address: string, nonce: string, rawSignature: string) {
  const authNonce = await prisma.authNonce.findUnique({ where: { nonce } });
  if (!authNonce) {
    return { valid: false, reason: 'Nonce not found' } as const;
  }
  if (authNonce.address !== address) {
    return { valid: false, reason: 'Address mismatch' } as const;
  }
  if (authNonce.usedAt) {
    return { valid: false, reason: 'Nonce already used' } as const;
  }
  if (new Date() > authNonce.expiresAt) {
    return { valid: false, reason: 'Nonce expired' } as const;
  }

  const messageBytes = Buffer.from(authNonce.message, 'utf-8');
  const signatureBytes = Buffer.from(rawSignature, 'hex');

  let isValid: boolean;
  try {
    const keypair = Keypair.fromPublicKey(address);
    isValid = keypair.verify(messageBytes, signatureBytes);
  } catch {
    return { valid: false, reason: 'Invalid address or signature format' } as const;
  }

  if (!isValid) {
    return { valid: false, reason: 'Signature verification failed' } as const;
  }

  await prisma.authNonce.update({
    where: { id: authNonce.id },
    data: { usedAt: new Date() },
  });

  return { valid: true, reason: null } as const;
}

export async function upsertMerchant(address: string) {
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

export function issueAccessToken(merchantId: string, address: string): string {
  return jwt.sign({ sub: merchantId, address }, environment.jwtSecret, { expiresIn: '15m' });
}

export async function issueRefreshToken(merchantId: string): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  await prisma.refreshToken.create({
    data: { merchantId, token, expiresAt },
  });

  return token;
}

export async function authenticateWallet(address: string, nonce: string, signature: string) {
  const verification = await verifySignature(address, nonce, signature);
  if (!verification.valid) {
    return { success: false, reason: verification.reason } as const;
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
  } as const;
}
