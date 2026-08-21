import { Router } from 'express';
import authRoutes from './auth.routes.js';
import merchantRoutes from './merchant.routes.js';
import logsRoutes from './logs.routes.js';
import { authenticateAdmin } from '../../middlewares/admin.middleware.js';

const router = Router();

// Public: issues the wallet challenge/verify pair, no admin session yet.
router.use('/auth', authRoutes);

router.use('/merchants', authenticateAdmin, merchantRoutes);
router.use('/logs', authenticateAdmin, logsRoutes);

// Sibling routers added by later issues (invoice.routes.ts, ...) are mounted
// here behind authenticateAdmin.

export default router;
