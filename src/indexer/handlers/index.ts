import { registerEventHandler } from '../registry.js';
import { handleInvoicePaid, INVOICE_PAID_TOPIC } from './invoicePaid.js';

registerEventHandler(INVOICE_PAID_TOPIC, handleInvoicePaid);
