import { Router } from 'express';
import {
  createMerchantController,
  getMerchantController,
  listMerchantsController,
  registerMerchantController,
} from '../controllers/merchant.controllers.js';
import {
  createApiKeyController,
  listApiKeysController,
  revokeApiKeyController,
} from '../controllers/api-key.controllers.js';
import { authenticateMerchant } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/register', authenticateMerchant, registerMerchantController);
router.post('/api-keys', authenticateMerchant, createApiKeyController);
router.get('/api-keys', authenticateMerchant, listApiKeysController);
router.delete('/api-keys/:id', authenticateMerchant, revokeApiKeyController);
router.post('/', createMerchantController);
router.get('/:id', getMerchantController);
router.get('/', listMerchantsController);

export default router;
