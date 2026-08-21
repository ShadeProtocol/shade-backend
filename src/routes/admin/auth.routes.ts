import { Router } from 'express';
import {
  createAdminChallengeController,
  verifyAdminSignatureController,
} from '../../controllers/admin-auth.controllers.js';

const router = Router();

router.post('/challenge', createAdminChallengeController);
router.post('/verify', verifyAdminSignatureController);

export default router;
