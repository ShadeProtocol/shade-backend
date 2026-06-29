import { Router } from 'express';
import {
  createMerchantController,
  getMerchantController,
  listMerchantsController,
  registerMerchantController,
  getMyProfileController,
  updateMyProfileController,
} from '../controllers/merchant.controllers.js';
import {
  createApiKeyController,
  listApiKeysController,
  revokeApiKeyController,
} from '../controllers/api-key.controllers.js';
import { authenticateMerchant, authenticateSessionOnly } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/register', authenticateMerchant, registerMerchantController);
router.get('/me', authenticateMerchant, getMyProfileController);
router.patch('/me', authenticateMerchant, updateMyProfileController);
router.post('/api-keys', authenticateSessionOnly, createApiKeyController);
router.get('/api-keys', authenticateSessionOnly, listApiKeysController);
router.delete('/api-keys/:id', authenticateSessionOnly, revokeApiKeyController);
router.post('/', createMerchantController);
router.get('/:id', getMerchantController);
router.get('/', listMerchantsController);

export default router;
