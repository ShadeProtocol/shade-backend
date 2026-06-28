import { Router } from 'express';
import {
  createNonceController,
  verifySignatureController,
  verifyEmailController,
  resendOtpController,
} from '../controllers/auth.controllers.js';
import { authenticateMerchant } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/nonce', createNonceController);
router.post('/verify', verifySignatureController);
router.post('/verify-email', authenticateMerchant, verifyEmailController);
router.post('/resend-otp', authenticateMerchant, resendOtpController);

export default router;
