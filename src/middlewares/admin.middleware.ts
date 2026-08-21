import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import { environment } from '../config/environment.js';

const extractBearerToken = (req: Request): string | null => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
};

/**
 * Authenticates an admin from a JWT bearer token issued by admin-auth.services.ts.
 *
 * Rejects tokens missing the `type: 'admin'` claim (including structurally valid
 * merchant JWTs), tokens for an unknown admin, and tokens for a deactivated admin.
 * The resolved Admin is attached to `req.admin` on success.
 */
export const authenticateAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    let payload: { sub?: string; type?: string };
    try {
      payload = jwt.verify(token, environment.jwtSecret) as { sub?: string; type?: string };
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    if (!payload.sub || payload.type !== 'admin') {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
    if (!admin || !admin.active) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    req.admin = admin;
    next();
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

/**
 * Chained after authenticateAdmin. Rejects an authenticated admin that is not a superadmin.
 */
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.admin) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!req.admin.isSuperAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
};
