export interface DecodedEvent {
  id: string;
  topic: string;
  ledger: number;
  txHash: string;
  data: any;
}

/**
 * Normalized payload for the Shade contract's `InvoicePaidEvent`.
 *
 * Soroban's `scValToNative` preserves the Rust event-map field names
 * (`invoice_id`, `merchant_id`, and so on), so the handler converts that
 * payload to this application-facing shape before calling the invoice service.
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

type EventRecord = Record<string, unknown> | Map<unknown, unknown>;

const isEventRecord = (value: unknown): value is EventRecord =>
  value instanceof Map || (typeof value === 'object' && value !== null);

const readField = (data: EventRecord, camelCase: string, snakeCase: string): unknown => {
  if (data instanceof Map) {
    return data.get(camelCase) ?? data.get(snakeCase);
  }
  return data[camelCase] ?? data[snakeCase];
};

const toBigInt = (value: unknown, field: string): bigint => {
  try {
    return typeof value === 'bigint' ? value : BigInt(value as string | number | boolean);
  } catch {
    throw new Error(`InvoicePaid event field "${field}" must be an integer`);
  }
};

const toSafeNumber = (value: unknown, field: string): number => {
  const parsed = toBigInt(value, field);
  if (parsed < 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(
      `InvoicePaid event field "${field}" is outside JavaScript's safe integer range`,
    );
  }
  return Number(parsed);
};

const toString = (value: unknown, field: string): string => {
  if (value === null || value === undefined) {
    throw new Error(`InvoicePaid event field "${field}" is required`);
  }
  return String(value);
};

export const decodeInvoicePaidEventData = (data: unknown): InvoicePaidEventData => {
  if (!isEventRecord(data)) {
    throw new Error('InvoicePaid event data must be a decoded map');
  }

  return {
    invoiceId: toSafeNumber(readField(data, 'invoiceId', 'invoice_id'), 'invoice_id'),
    merchantId: toSafeNumber(readField(data, 'merchantId', 'merchant_id'), 'merchant_id'),
    payer: toString(readField(data, 'payer', 'payer'), 'payer'),
    amount: toBigInt(readField(data, 'amount', 'amount'), 'amount'),
    fee: toBigInt(readField(data, 'fee', 'fee'), 'fee'),
    merchantAmount: toBigInt(
      readField(data, 'merchantAmount', 'merchant_amount'),
      'merchant_amount',
    ),
    token: toString(readField(data, 'token', 'token'), 'token'),
    timestamp: toSafeNumber(readField(data, 'timestamp', 'timestamp'), 'timestamp'),
  };
};
