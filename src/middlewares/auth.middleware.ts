import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import { environment } from '../config/environment.js';

interface AccessTokenPayload extends jwt.JwtPayload {
  sub: string;
  address?: string;
}

/**
 * Authenticates a merchant from a JWT access token.
 *
 * Expects an `Authorization: Bearer <token>` header containing a JWT signed
 * with `JWT_SECRET`. The token is verified and its `sub` claim is used to load
 * the corresponding Merchant, which is attached to `req.merchant` on success.
 *
 * Responds with 401 when the header is missing/malformed, the token is invalid
 * or expired, or the referenced merchant no longer exists.
 */
export const authenticateMerchant = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  let payload: AccessTokenPayload;
  try {
    payload = jwt.verify(token, environment.jwtSecret) as AccessTokenPayload;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  if (!payload.sub) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const merchant = await prisma.merchant.findUnique({ where: { id: payload.sub } });

  if (!merchant) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.merchant = merchant;
  next();
};
