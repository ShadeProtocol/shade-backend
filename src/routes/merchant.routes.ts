import { Router } from 'express';
import {
  createMerchantController,
  getMerchantController,
  listMerchantsController,
} from '../controllers/merchant.controllers.js';

const router = Router();

router.post('/', createMerchantController);
router.get('/:id', getMerchantController);
router.get('/', listMerchantsController);

export default router;
