import { scValToNative } from '@stellar/stellar-sdk';
import prisma from '../config/prisma.js';
import { environment } from '../config/environment.js';
import { sorobanServer } from './sorobanClient.js';
import { dispatch } from './registry.js';

let isRunning = false;
let cursor: number | undefined;

function decodeTopic(val: any): string {
  if (!val) return '';
  try {
    const native = scValToNative(val);
    if (typeof native === 'symbol') {
      return native.description ?? native.toString();
    }
    return String(native);
  } catch {
    return 'unknown_topic';
  }
}

export async function tick(): Promise<void> {
  try {
    const contractId = environment.stellar.contractId;
    if (!contractId || contractId.trim() === '') {
      throw new Error('STELLAR_CONTRACT_ID environment variable is unset or empty');
    }

    const latestLedgerResp = await sorobanServer.getLatestLedger();
    const latestLedger = latestLedgerResp.sequence;

    if (cursor === undefined) {
      const cursorRecord = await prisma.indexerCursor.findUnique({
        where: { contractId },
      });
      if (cursorRecord?.lastLedger != null) {
        cursor = cursorRecord.lastLedger;
      } else if (environment.stellar.indexerStartLedger != null) {
        cursor = environment.stellar.indexerStartLedger;
      } else {
        cursor = latestLedger;
      }
      console.log(`Indexer initialized with cursor at ledger ${cursor}`);
    }

    const currentCursor = cursor ?? latestLedger;
    cursor = currentCursor;

    if (currentCursor > latestLedger) {
      return;
    }

    const eventsResp = await sorobanServer.getEvents({
      startLedger: currentCursor,
      filters: [{ type: 'contract', contractIds: [contractId] }],
      limit: 100,
    });

    const events = eventsResp.events || [];
    const processedIds: { id: string; topic: string; ledger: number }[] = [];

    for (const event of events) {
      try {
        const existing = await prisma.indexerEvent.findUnique({
          where: { id: event.id },
        });
        if (existing) {
          continue;
        }

        const topicVal = event.topic && event.topic.length > 0 ? event.topic[0] : undefined;
        const decodedTopic = decodeTopic(topicVal);
        let decodedValue: any = null;
        try {
          decodedValue = event.value ? scValToNative(event.value) : null;
        } catch {
          decodedValue = null;
        }

        console.log(`Decoded event [${event.id}] - topic: ${decodedTopic}, value:`, decodedValue);

        await dispatch({
          id: event.id,
          topic: decodedTopic,
          ledger: event.ledger,
          txHash: event.txHash,
          ledgerClosedAt: event.ledgerClosedAt,
          data: decodedValue,
        });

        processedIds.push({
          id: event.id,
          topic: decodedTopic,
          ledger: event.ledger,
        });
      } catch (err) {
        console.error(`Error processing event ${event.id}:`, err);
      }
    }

    const nextCursor =
      events.length === 100 && events[events.length - 1]
        ? events[events.length - 1].ledger + 1
        : latestLedger + 1;

    await prisma.$transaction(async (tx: any) => {
      for (const item of processedIds) {
        await tx.indexerEvent.create({
          data: {
            id: item.id,
            topic: item.topic,
            ledger: item.ledger,
          },
        });
      }
      await tx.indexerCursor.upsert({
        where: { contractId },
        update: { lastLedger: nextCursor },
        create: { contractId, lastLedger: nextCursor },
      });
    });

    cursor = nextCursor;
  } catch (error) {
    console.error('Error in poller tick:', error);
    if (!environment.stellar.contractId || environment.stellar.contractId.trim() === '') {
      throw error;
    }
  }
}

export async function startPolling(intervalMs = 6000): Promise<void> {
  const contractId = environment.stellar.contractId;
  if (!contractId || contractId.trim() === '') {
    throw new Error('STELLAR_CONTRACT_ID environment variable is unset or empty');
  }
  if (isRunning) return;
  isRunning = true;
  console.log(`Starting Soroban indexer poller for contract ${contractId}...`);

  while (isRunning) {
    await tick();
    if (!isRunning) break;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

export function stopPolling(): void {
  isRunning = false;
}

export function getCursor(): number | undefined {
  return cursor;
}

export function setCursor(val: number | undefined): void {
  cursor = val;
}

export function resetPoller(): void {
  stopPolling();
  cursor = undefined;
}
