import merchantRoutes from './merchant.routes.js';
import authRoutes from './auth.routes.js';
import invoiceRoutes from './invoice.routes.js';
import { Router } from 'express';

const router = Router();

router.use('/merchants', merchantRoutes);
router.use('/auth', authRoutes);
router.use('/invoices', invoiceRoutes);

export default router;
