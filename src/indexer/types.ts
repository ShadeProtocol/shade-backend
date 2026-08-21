export interface DecodedEvent {
  id: string;
  topic: string;
  ledger: number;
  txHash: string;
  data: any;
}

/**
 * Normalized payloads for the Shade contract's events.
 *
 * Soroban's `scValToNative` preserves the Rust event-map field names
 * (`invoice_id`, `merchant_id`, and so on), so handlers convert that payload to
 * these application-facing shapes before calling a service.
 */
export interface InvoicePaidEventData {
  invoiceId: number;
  merchantId: number;
  payer: string;
  amount: bigint;
  fee: bigint;
  merchantAmount: bigint;
  token: string;
  timestamp: number;
}

export interface SubscriptionChargedEventData {
  subscriptionId: number;
  planId: number;
  customer: string;
  merchant: string;
  amount: bigint;
  fee: bigint;
  token: string;
  timestamp: number;
}

export interface TicketPurchasedEventData {
  ticketId: number;
  eventId: number;
  merchantId: number;
  buyer: string;
  amount: bigint;
  fee: bigint;
  merchantAmount: bigint;
  token: string;
  timestamp: number;
}

export interface TicketResoldEventData {
  ticketId: number;
  eventId: number;
  merchantId: number;
  seller: string;
  buyer: string;
  resalePrice: bigint;
  royalty: bigint;
  sellerProceeds: bigint;
  token: string;
  timestamp: number;
}

export interface MerchantRegisteredEventData {
  merchant: string;
  merchantId: number;
  timestamp: number;
}

/** Note: the contract's `InvoiceCreatedEvent` carries no timestamp field. */
export interface InvoiceCreatedEventData {
  invoiceId: number;
  merchant: string;
  amount: bigint;
  token: string;
}

export interface SubscribedEventData {
  subscriptionId: number;
  planId: number;
  customer: string;
  timestamp: number;
}

export interface InvoiceRefundedEventData {
  invoiceId: number;
  merchant: string;
  amount: bigint;
  timestamp: number;
}

export interface InvoicePartiallyRefundedEventData {
  invoiceId: number;
  merchant: string;
  amount: bigint;
  totalAmountRefunded: bigint;
  timestamp: number;
}

type EventRecord = Record<string, unknown> | Map<unknown, unknown>;

const isEventRecord = (value: unknown): value is EventRecord =>
  value instanceof Map || (typeof value === 'object' && value !== null);

const toCamelCase = (snakeCase: string): string =>
  snakeCase.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

/**
 * Reads one contract-event field. `scValToNative` returns a plain object for
 * some SDK versions and a `Map` for others, and callers may already have
 * camel-cased keys, so both spellings are accepted.
 */
const readField = (data: EventRecord, snakeCase: string): unknown => {
  const camelCase = toCamelCase(snakeCase);
  if (data instanceof Map) {
    return data.get(camelCase) ?? data.get(snakeCase);
  }
  return (
    (data as Record<string, unknown>)[camelCase] ?? (data as Record<string, unknown>)[snakeCase]
  );
};

/**
 * Field-level accessors for a single decoded event, carrying the event name so
 * validation failures name the event they came from.
 */
class EventFieldReader {
  constructor(
    private readonly eventName: string,
    private readonly data: EventRecord,
  ) {}

  bigint(field: string): bigint {
    const value = readField(this.data, field);
    try {
      return typeof value === 'bigint' ? value : BigInt(value as string | number | boolean);
    } catch {
      throw new Error(`${this.eventName} event field "${field}" must be an integer`);
    }
  }

  number(field: string): number {
    const parsed = this.bigint(field);
    if (parsed < 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(
        `${this.eventName} event field "${field}" is outside JavaScript's safe integer range`,
      );
    }
    return Number(parsed);
  }

  string(field: string): string {
    const value = readField(this.data, field);
    if (value === null || value === undefined) {
      throw new Error(`${this.eventName} event field "${field}" is required`);
    }
    return String(value);
  }
}

const readEvent = (eventName: string, data: unknown): EventFieldReader => {
  if (!isEventRecord(data)) {
    throw new Error(`${eventName} event data must be a decoded map`);
  }
  return new EventFieldReader(eventName, data);
};

export const decodeInvoicePaidEventData = (data: unknown): InvoicePaidEventData => {
  const event = readEvent('InvoicePaid', data);

  return {
    invoiceId: event.number('invoice_id'),
    merchantId: event.number('merchant_id'),
    payer: event.string('payer'),
    amount: event.bigint('amount'),
    fee: event.bigint('fee'),
    merchantAmount: event.bigint('merchant_amount'),
    token: event.string('token'),
    timestamp: event.number('timestamp'),
  };
};

export const decodeSubscriptionChargedEventData = (data: unknown): SubscriptionChargedEventData => {
  const event = readEvent('SubscriptionCharged', data);

  return {
    subscriptionId: event.number('subscription_id'),
    planId: event.number('plan_id'),
    customer: event.string('customer'),
    merchant: event.string('merchant'),
    amount: event.bigint('amount'),
    fee: event.bigint('fee'),
    token: event.string('token'),
    timestamp: event.number('timestamp'),
  };
};

export const decodeTicketPurchasedEventData = (data: unknown): TicketPurchasedEventData => {
  const event = readEvent('TicketPurchased', data);

  return {
    ticketId: event.number('ticket_id'),
    eventId: event.number('event_id'),
    merchantId: event.number('merchant_id'),
    buyer: event.string('buyer'),
    amount: event.bigint('amount'),
    fee: event.bigint('fee'),
    merchantAmount: event.bigint('merchant_amount'),
    token: event.string('token'),
    timestamp: event.number('timestamp'),
  };
};

export const decodeTicketResoldEventData = (data: unknown): TicketResoldEventData => {
  const event = readEvent('TicketResold', data);

  return {
    ticketId: event.number('ticket_id'),
    eventId: event.number('event_id'),
    merchantId: event.number('merchant_id'),
    seller: event.string('seller'),
    buyer: event.string('buyer'),
    resalePrice: event.bigint('resale_price'),
    royalty: event.bigint('royalty'),
    sellerProceeds: event.bigint('seller_proceeds'),
    token: event.string('token'),
    timestamp: event.number('timestamp'),
  };
};

export const decodeMerchantRegisteredEventData = (data: unknown): MerchantRegisteredEventData => {
  const event = readEvent('MerchantRegistered', data);

  return {
    merchant: event.string('merchant'),
    merchantId: event.number('merchant_id'),
    timestamp: event.number('timestamp'),
  };
};

export const decodeInvoiceCreatedEventData = (data: unknown): InvoiceCreatedEventData => {
  const event = readEvent('InvoiceCreated', data);

  return {
    invoiceId: event.number('invoice_id'),
    merchant: event.string('merchant'),
    amount: event.bigint('amount'),
    token: event.string('token'),
  };
};

export const decodeSubscribedEventData = (data: unknown): SubscribedEventData => {
  const event = readEvent('Subscribed', data);

  return {
    subscriptionId: event.number('subscription_id'),
    planId: event.number('plan_id'),
    customer: event.string('customer'),
    timestamp: event.number('timestamp'),
  };
};

export const decodeInvoiceRefundedEventData = (data: unknown): InvoiceRefundedEventData => {
  const event = readEvent('InvoiceRefunded', data);

  return {
    invoiceId: event.number('invoice_id'),
    merchant: event.string('merchant'),
    amount: event.bigint('amount'),
    timestamp: event.number('timestamp'),
  };
};

export const decodeInvoicePartiallyRefundedEventData = (
  data: unknown,
): InvoicePartiallyRefundedEventData => {
  const event = readEvent('InvoicePartiallyRefunded', data);

  return {
    invoiceId: event.number('invoice_id'),
    merchant: event.string('merchant'),
    amount: event.bigint('amount'),
    totalAmountRefunded: event.bigint('total_amount_refunded'),
    timestamp: event.number('timestamp'),
  };
};
