import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import { environment } from '../config/environment.js';
import { authenticateApiKey } from '../services/api-key.services.js';
import { isApiKeyToken } from '../utils/api-key.utils.js';

const extractBearerToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
};

const authenticateRefreshToken = async (token: string) => {
  const session = await prisma.refreshToken.findUnique({
    where: { token },
    include: { merchant: true },
  });

  if (!session || session.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return session.merchant;
};

const authenticateJwt = async (token: string) => {
  try {
    const payload = jwt.verify(token, environment.jwtSecret) as { sub?: string };
    if (!payload.sub) {
      return null;
    }

    return prisma.merchant.findUnique({ where: { id: payload.sub } });
  } catch {
    return null;
  }
};

const resolveMerchantFromToken = async (token: string) => {
  if (isApiKeyToken(token)) {
    return authenticateApiKey(token);
  }

  if (token.split('.').length === 3) {
    return authenticateJwt(token);
  }

  return authenticateRefreshToken(token);
};

/**
 * Authenticates API key bearer tokens, updates lastUsedAt, and attaches the merchant.
 */
export const apiKeyAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = extractBearerToken(req);

    if (!token || !isApiKeyToken(token)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const merchant = await authenticateApiKey(token);
    if (!merchant) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    req.merchant = merchant;
    next();
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * Authenticates a merchant using refresh tokens or JWT access tokens only.
 * API keys are rejected to prevent key-management operations via API keys.
 */
export const authenticateSessionOnly = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (isApiKeyToken(token)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const merchant =
      token.split('.').length === 3
        ? await authenticateJwt(token)
        : await authenticateRefreshToken(token);

    if (!merchant) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    req.merchant = merchant;
    next();
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * Authenticates a merchant using refresh tokens, JWT access tokens, or API keys.
 */
export const authenticateMerchant = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const merchant = await resolveMerchantFromToken(token);
    if (!merchant) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    req.merchant = merchant;
    next();
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
