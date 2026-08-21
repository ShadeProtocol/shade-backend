import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import { environment } from '../config/environment.js';
import { verifySignature } from './auth.services.js';
import { recordAuditLog, ActorType } from './audit-log.services.js';

const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export function issueAdminAccessToken(adminId: string, address: string): string {
  return jwt.sign({ sub: adminId, address, type: 'admin' }, environment.jwtSecret, {
    expiresIn: '15m',
  });
}

export async function issueAdminRefreshToken(adminId: string): Promise<string> {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  await prisma.adminRefreshToken.create({
    data: { adminId, token, expiresAt },
  });

  return token;
}

export async function authenticateAdminWallet(address: string, nonce: string, signature: string) {
  const verification = await verifySignature(address, nonce, signature);
  if (!verification.valid) {
    await recordAuditLog({
      action: 'admin.login_failed',
      actorType: ActorType.ANONYMOUS,
      actorLabel: address,
      metadata: { reason: verification.reason },
    });
    return { success: false, reason: verification.reason } as const;
  }

  const admin = await prisma.admin.findUnique({ where: { address } });
  if (!admin || !admin.active) {
    await recordAuditLog({
      action: 'admin.login_failed',
      actorType: ActorType.ANONYMOUS,
      actorLabel: address,
      metadata: { reason: 'Not an admin' },
    });
    return { success: false, reason: 'Not an admin' } as const;
  }

  const accessToken = issueAdminAccessToken(admin.id, admin.address);
  const refreshToken = await issueAdminRefreshToken(admin.id);

  await recordAuditLog({
    action: 'admin.login_succeeded',
    actorType: ActorType.ADMIN,
    actorId: admin.id,
    actorLabel: admin.address,
  });

  return {
    success: true,
    accessToken,
    refreshToken,
    admin: {
      id: admin.id,
      address: admin.address,
      isSuperAdmin: admin.isSuperAdmin,
    },
  } as const;
}
