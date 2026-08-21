import { Router } from 'express';
import authRoutes from './auth.routes.js';

const router = Router();

// Public: issues the wallet challenge/verify pair, no admin session yet.
router.use('/auth', authRoutes);

// Sibling routers added by later issues (merchant.routes.ts, invoice.routes.ts, ...)
// are mounted here behind authenticateAdmin.

export default router;
