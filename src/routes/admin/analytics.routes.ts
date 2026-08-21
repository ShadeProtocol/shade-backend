import { Router } from 'express';
import {
  getAnalyticsSummaryController,
  getAnalyticsTimeseriesController,
  getAnalyticsTokensController,
} from '../../controllers/admin-analytics.controllers.js';
import { authenticateAdmin } from '../../middlewares/admin.middleware.js';

const router = Router();

// Read-only dashboard data: any authenticated admin, no superadmin requirement.
router.use(authenticateAdmin);

router.get('/summary', getAnalyticsSummaryController);
router.get('/timeseries', getAnalyticsTimeseriesController);
router.get('/tokens', getAnalyticsTokensController);

export default router;
