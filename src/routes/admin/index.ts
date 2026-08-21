import { Router } from 'express';
import authRoutes from './auth.routes.js';
import analyticsRoutes from './analytics.routes.js';

const router = Router();

// Public: issues the wallet challenge/verify pair, no admin session yet.
router.use('/auth', authRoutes);

// Protected: the router applies authenticateAdmin to every route it owns.
router.use('/analytics', analyticsRoutes);

// Sibling routers added by later issues (merchant.routes.ts, invoice.routes.ts, ...)
// are mounted here behind authenticateAdmin.

export default router;
