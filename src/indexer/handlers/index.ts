import { registerEventHandler } from '../registry.js';
import { handleInvoicePaid, INVOICE_PAID_TOPIC } from './invoicePaid.js';
import { handleSubscriptionCharged, SUBSCRIPTION_CHARGED_TOPIC } from './subscriptionCharged.js';
import {
  handleTicketPurchased,
  handleTicketResold,
  TICKET_PURCHASED_TOPIC,
  TICKET_RESOLD_TOPIC,
} from './ticketing.js';
import {
  handleInvoiceCreated,
  handleMerchantRegistered,
  handleSubscribed,
  INVOICE_CREATED_TOPIC,
  MERCHANT_REGISTERED_TOPIC,
  SUBSCRIBED_TOPIC,
} from './growth.js';
import {
  handleInvoicePartiallyRefunded,
  handleInvoiceRefunded,
  INVOICE_PARTIALLY_REFUNDED_TOPIC,
  INVOICE_REFUNDED_TOPIC,
} from './refunds.js';

// Volume-moving events: they update MerchantAnalytics, TokenAnalytics and the
// protocol-wide PlatformDailyStats rollup.
registerEventHandler(INVOICE_PAID_TOPIC, handleInvoicePaid);
registerEventHandler(SUBSCRIPTION_CHARGED_TOPIC, handleSubscriptionCharged);
registerEventHandler(TICKET_PURCHASED_TOPIC, handleTicketPurchased);
registerEventHandler(TICKET_RESOLD_TOPIC, handleTicketResold);

// Growth events: they only move PlatformDailyStats' "new X today" counters.
registerEventHandler(MERCHANT_REGISTERED_TOPIC, handleMerchantRegistered);
registerEventHandler(INVOICE_CREATED_TOPIC, handleInvoiceCreated);
registerEventHandler(SUBSCRIBED_TOPIC, handleSubscribed);

// Refund events: they adjust the invoice only. Volume is deliberately not
// netted down — see applyInvoiceRefund.
registerEventHandler(INVOICE_REFUNDED_TOPIC, handleInvoiceRefunded);
registerEventHandler(INVOICE_PARTIALLY_REFUNDED_TOPIC, handleInvoicePartiallyRefunded);

// Intentionally unhandled, and left to log "no handler registered":
//   - subscription_plan_created_event / event_created_event: growth events with
//     no dedicated daily counter in PlatformDailyStats. Plan and event totals
//     are point-in-time counts, and adding daily counters for them is a
//     follow-up if a dashboard ever asks for the trend.
//   - status and governance events (merchant_status_changed_event,
//     role_granted_event, contract_paused_event, fee_set_event, ...): out of
//     scope for analytics indexing.
