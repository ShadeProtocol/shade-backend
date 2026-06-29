import { Router } from 'express';
import {
  resolveInvoiceController,
  confirmPaymentController,
} from '../controllers/pay.controllers.js';

const router = Router();

router.get('/:slug', resolveInvoiceController);
router.post('/:slug/confirm', confirmPaymentController);

export default router;
