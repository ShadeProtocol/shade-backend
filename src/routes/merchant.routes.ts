import { Router } from 'express';
import {
  createMerchantController,
  getMerchantController,
  listMerchantsController,
  registerMerchantController,
  getMyProfileController,
  updateMyProfileController,
} from '../controllers/merchant.controllers.js';
import { authenticateMerchant } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/register', authenticateMerchant, registerMerchantController);
router.get('/me', authenticateMerchant, getMyProfileController);
router.patch('/me', authenticateMerchant, updateMyProfileController);
router.post('/', createMerchantController);
router.get('/:id', getMerchantController);
router.get('/', listMerchantsController);

export default router;
