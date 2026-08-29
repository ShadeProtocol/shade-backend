import { Router } from 'express';
import {
  blockMerchantController,
  getAdminMerchantAnalyticsController,
  getAdminMerchantController,
  getAdminMerchantInvoicesController,
  listAdminMerchantsController,
} from '../../controllers/admin-merchant.controllers.js';
import { authenticateAdmin, requireSuperAdmin } from '../../middlewares/admin.middleware.js';

const router = Router();

router.use(authenticateAdmin);

// Read-only dashboard data: any authenticated admin.
router.get('/', listAdminMerchantsController);
router.get('/:id', getAdminMerchantController);
router.get('/:id/invoices', getAdminMerchantInvoicesController);
router.get('/:id/analytics', getAdminMerchantAnalyticsController);

// Moderation: superadmin only. Off-chain block; on-chain set_merchant_status
// reconciliation is deferred (see blockMerchantController). Unblocking is
// intentionally not implemented here.
router.post('/:id/block', requireSuperAdmin, blockMerchantController);

export default router;
