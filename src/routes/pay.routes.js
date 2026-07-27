import { Router } from 'express';
import { resolveInvoiceController, confirmPaymentController, getInvoicePdfController, } from '../controllers/pay.controllers.js';
const router = Router();
router.get('/:slug', resolveInvoiceController);
router.get('/:slug/pdf', getInvoicePdfController);
router.post('/:slug/confirm', confirmPaymentController);
export default router;
