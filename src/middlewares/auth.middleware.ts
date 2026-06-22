import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma.js';

/**
 * Authenticates a merchant using a session bearer token.
 *
 * Expects an `Authorization: Bearer <token>` header that maps to a valid,
 * non-expired MerchantSession. On success the resolved merchant is attached to
 * `req.merchant`. Otherwise the request is rejected with 401.
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

    const session = await prisma.merchantSession.findUnique({
      where: { token },
      include: { merchant: true },
    });

    if (!session || session.expiresAt.getTime() < Date.now()) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    req.merchant = session.merchant;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
};
