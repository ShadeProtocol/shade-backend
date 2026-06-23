import { Router } from 'express';
import {
  createMerchantController,
  getMerchantController,
  listMerchantsController,
  registerMerchantController,
} from '../controllers/merchant.controllers.js';
import { authenticateMerchant } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/register', authenticateMerchant, registerMerchantController);
router.post('/', createMerchantController);
router.get('/:id', getMerchantController);
router.get('/', listMerchantsController);

export default router;
