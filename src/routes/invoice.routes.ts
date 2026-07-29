import { Router } from 'express';
import {
  createInvoiceController,
  getInvoiceController,
  getInvoicePdfController,
  listInvoicesController,
  sendInvoiceController,
  voidInvoiceController,
} from '../controllers/invoice.controllers.js';
import { authenticateMerchant } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authenticateMerchant);

router.post('/', createInvoiceController);
router.get('/', listInvoicesController);
router.get('/:id', getInvoiceController);
router.get('/:id/pdf', getInvoicePdfController);
router.post('/:id/send', sendInvoiceController);
router.patch('/:id/void', voidInvoiceController);

export default router;
