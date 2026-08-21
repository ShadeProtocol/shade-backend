import { Router } from 'express';
import { blockMerchantController } from '../../controllers/admin-merchant.controllers.js';

const router = Router();

router.patch('/:id/block', blockMerchantController);

export default router;
