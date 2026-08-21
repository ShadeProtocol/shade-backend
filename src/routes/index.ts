import merchantRoutes from './merchant.routes.js';
import authRoutes from './auth.routes.js';
import invoiceRoutes from './invoice.routes.js';
import payRoutes from './pay.routes.js';
import adminRoutes from './admin/index.js';
import { Router } from 'express';

const router = Router();

router.use('/merchants', merchantRoutes);
router.use('/auth', authRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/pay', payRoutes);
router.use('/admin', adminRoutes);

export default router;
