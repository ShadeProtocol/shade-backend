import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import { environment } from '../config/environment.js';
import { authenticateApiKey } from '../services/api-key.services.js';
import { isApiKeyToken } from '../utils/api-key.utils.js';

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

/**
 * Authenticates API key bearer tokens, updates lastUsedAt, and attaches the merchant.
 */
export const apiKeyAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();
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
    res.status(401).json({ error: 'Unauthorized' });
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
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    let merchant = null;

    if (isApiKeyToken(token)) {
      merchant = await authenticateApiKey(token);
    } else if (token.split('.').length === 3) {
      merchant = await authenticateJwt(token);
    } else {
      merchant = await authenticateRefreshToken(token);
    }

    if (!merchant) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    req.merchant = merchant;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
};
