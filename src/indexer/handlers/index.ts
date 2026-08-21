import { registerEventHandler } from '../registry.js';
import { handleInvoicePaid, INVOICE_PAID_TOPIC } from './invoicePaid.js';
import { handleSubscriptionCharged, SUBSCRIPTION_CHARGED_TOPIC } from './subscriptionCharged.js';
import {
  handleTicketPurchased,
  handleTicketResold,
  TICKET_PURCHASED_TOPIC,
  TICKET_RESOLD_TOPIC,
} from './ticketing.js';
import { handleMerchantRegistered, MERCHANT_REGISTERED_TOPIC } from './growth.js';
import { handleInvoiceCreated, INVOICE_CREATED_TOPIC } from './invoiceCreated.js';
import {
  handleSubscriptionPlanCreated,
  SUBSCRIPTION_PLAN_CREATED_TOPIC,
} from './subscriptionPlanCreated.js';
import { handleSubscribed, SUBSCRIBED_TOPIC } from './subscribed.js';
import {
  handleInvoicePartiallyRefunded,
  handleInvoiceRefunded,
  INVOICE_PARTIALLY_REFUNDED_TOPIC,
  INVOICE_REFUNDED_TOPIC,
} from './refunds.js';

// One handler per topic: registerEventHandler overwrites on a repeated topic,
// so a second registration would silently replace the first, not run alongside it.

// Volume-moving events: they update MerchantAnalytics, TokenAnalytics and the
// protocol-wide PlatformDailyStats rollup.
registerEventHandler(INVOICE_PAID_TOPIC, handleInvoicePaid);
registerEventHandler(SUBSCRIPTION_CHARGED_TOPIC, handleSubscriptionCharged);
registerEventHandler(TICKET_PURCHASED_TOPIC, handleTicketPurchased);
registerEventHandler(TICKET_RESOLD_TOPIC, handleTicketResold);

// Growth event: only moves PlatformDailyStats' "new merchants today" counter.
registerEventHandler(MERCHANT_REGISTERED_TOPIC, handleMerchantRegistered);

// Creation events: they project the on-chain record into its own table and, for
// invoices and subscriptions, still move the same daily "new X today" counter
// they moved when they were stats-only handlers.
registerEventHandler(INVOICE_CREATED_TOPIC, handleInvoiceCreated);
registerEventHandler(SUBSCRIPTION_PLAN_CREATED_TOPIC, handleSubscriptionPlanCreated);
registerEventHandler(SUBSCRIBED_TOPIC, handleSubscribed);

// Refund events: they adjust the invoice only. Volume is deliberately not
// netted down — see applyInvoiceRefund.
registerEventHandler(INVOICE_REFUNDED_TOPIC, handleInvoiceRefunded);
registerEventHandler(INVOICE_PARTIALLY_REFUNDED_TOPIC, handleInvoicePartiallyRefunded);

// Intentionally unhandled, and left to log "no handler registered":
//   - event_created_event: a growth event with no dedicated daily counter in
//     PlatformDailyStats. Event totals are point-in-time counts, and adding a
//     daily counter for them is a follow-up if a dashboard ever asks for the
//     trend.
//   - status and governance events (merchant_status_changed_event,
//     role_granted_event, contract_paused_event, fee_set_event, ...): out of
//     scope for analytics indexing.
