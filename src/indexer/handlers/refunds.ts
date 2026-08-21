import { applyInvoiceRefund } from '../../services/invoice.services.js';
import {
  decodeInvoicePartiallyRefundedEventData,
  decodeInvoiceRefundedEventData,
  type DecodedEvent,
} from '../types.js';

export const INVOICE_REFUNDED_TOPIC = 'invoice_refunded_event';
export const INVOICE_PARTIALLY_REFUNDED_TOPIC = 'invoice_partially_refunded_event';

export const handleInvoiceRefunded = async (event: DecodedEvent): Promise<void> => {
  await applyInvoiceRefund(decodeInvoiceRefundedEventData(event.data), event.txHash);
};

export const handleInvoicePartiallyRefunded = async (event: DecodedEvent): Promise<void> => {
  await applyInvoiceRefund(decodeInvoicePartiallyRefundedEventData(event.data), event.txHash);
};
