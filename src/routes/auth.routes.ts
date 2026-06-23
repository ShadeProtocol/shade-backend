import { Router } from 'express';
import {
  createNonceController,
  verifySignatureController,
} from '../controllers/auth.controllers.js';

const router = Router();

router.post('/nonce', createNonceController);
router.post('/verify', verifySignatureController);

export default router;
