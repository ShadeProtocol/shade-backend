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
  getMerchantAnalyticsController,
  getMerchantController,
  listMerchantInvoicesController,
  listMerchantsController,
} from '../../controllers/admin-merchant.controllers.js';
import { requireSuperAdmin } from '../../middlewares/admin.middleware.js';

const router = Router();

// Read-only dashboard data: any authenticated admin, no superadmin requirement.
// authenticateAdmin is applied where this router is mounted (admin/index.ts).
router.get('/', listMerchantsController);
router.get('/:id', getMerchantController);
router.get('/:id/invoices', listMerchantInvoicesController);
router.get('/:id/analytics', getMerchantAnalyticsController);

// Moderation: superadmin only. Unblocking is deliberately not exposed here —
// only blocking was in scope; see blockMerchant in merchant.services.ts.
router.post('/:id/block', requireSuperAdmin, blockMerchantController);

export default router;
