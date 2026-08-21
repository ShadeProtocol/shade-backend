import {
  Account,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  type xdr,
} from '@stellar/stellar-sdk';
import { environment } from '../config/environment.js';
import { sorobanServer } from './sorobanClient.js';

/**
 * Read-only contract calls, used to fill fields the contract's events omit.
 *
 * Some `#[contractevent]` payloads are narrower than the struct they describe —
 * `SubscriptionPlanCreatedEvent` has no `description`, and
 * `InvoiceCreatedEvent` has neither `description` nor `expires_at` — while our
 * schema requires them. The values are read back from contract storage with a
 * simulated (never submitted) invocation.
 *
 * Every read here is best-effort: callers fall back to a placeholder rather
 * than throwing, because a handler that throws loses the event entirely (the
 * poller advances its cursor past events whose handler failed), whereas a row
 * with a placeholder description is visible and repairable.
 */

// Simulation never submits, so the source account is only a structural
// requirement of the envelope and does not need to exist or hold a balance.
// The all-zero ed25519 key is the conventional stand-in.
const NULL_SOURCE_ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

let cachedNetworkPassphrase: string | undefined;

/**
 * Read from the RPC rather than configured, so the indexer cannot end up
 * simulating against a different network than the one it polls for events.
 */
const networkPassphrase = async (): Promise<string> => {
  cachedNetworkPassphrase ??= (await sorobanServer.getNetwork()).passphrase;
  return cachedNetworkPassphrase;
};

const simulateRead = async (method: string, args: xdr.ScVal[]): Promise<unknown> => {
  const contractId = environment.stellar.contractId;
  if (!contractId || contractId.trim() === '') {
    throw new Error('STELLAR_CONTRACT_ID environment variable is unset or empty');
  }

  const transaction = new TransactionBuilder(new Account(NULL_SOURCE_ACCOUNT, '0'), {
    fee: BASE_FEE,
    networkPassphrase: await networkPassphrase(),
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();

  const simulation = await sorobanServer.simulateTransaction(transaction);

  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(`${method} simulation failed: ${simulation.error}`);
  }
  if (!simulation.result?.retval) {
    throw new Error(`${method} simulation returned no value`);
  }

  return scValToNative(simulation.result.retval);
};

/** Reads one field off a `scValToNative`-decoded contract struct. */
const structField = (value: unknown, field: string): unknown => {
  if (value instanceof Map) return value.get(field);
  if (typeof value === 'object' && value !== null) return (value as Record<string, unknown>)[field];
  return undefined;
};

const optionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

export interface OnChainInvoiceDetails {
  /** The description the contract stored; `InvoiceCreatedEvent` does not carry it. */
  description: string | null;
  expiresAt: Date | null;
}

/**
 * Reads back the parts of `get_invoice` that `InvoiceCreatedEvent` leaves out.
 * Returns null if the read fails for any reason, including the invoice having
 * been pruned from contract storage — callers must cope with not knowing.
 */
export const fetchInvoiceDetails = async (
  invoiceId: number,
): Promise<OnChainInvoiceDetails | null> => {
  try {
    const invoice = await simulateRead('get_invoice', [nativeToScVal(invoiceId, { type: 'u64' })]);
    const expiresAt = structField(invoice, 'expires_at');

    return {
      description: optionalString(structField(invoice, 'description')),
      // `Option<u64>` decodes to undefined when None.
      expiresAt:
        typeof expiresAt === 'bigint' || typeof expiresAt === 'number'
          ? new Date(Number(expiresAt) * 1000)
          : null,
    };
  } catch (error) {
    console.warn(
      `Could not read invoice ${invoiceId} from the contract:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
};

/**
 * Reads back the `description` that `SubscriptionPlanCreatedEvent` omits.
 * Returns null if the read fails; callers must cope with not knowing.
 */
export const fetchSubscriptionPlanDescription = async (planId: number): Promise<string | null> => {
  try {
    const plan = await simulateRead('get_subscription_plan', [
      nativeToScVal(planId, { type: 'u64' }),
    ]);
    return optionalString(structField(plan, 'description'));
  } catch (error) {
    console.warn(
      `Could not read subscription plan ${planId} from the contract:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
};
