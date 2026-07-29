import { jest } from '@jest/globals';
import { mockReset } from 'jest-mock-extended';

jest.unstable_mockModule('../../src/indexer/sorobanClient.js', () => {
  const mockServer = {
    getLatestLedger: jest.fn(),
    getEvents: jest.fn(),
  };
  return {
    __esModule: true,
    sorobanServer: mockServer,
    default: mockServer,
  };
});

const { default: prismaMock } = (await import('../../src/config/prisma.js')) as any;
const { sorobanServer } = (await import('../../src/indexer/sorobanClient.js')) as any;
const { tick, startPolling, stopPolling, getCursor, resetPoller } = await import(
  '../../src/indexer/poller.js'
);
const { registerEventHandler, clearHandlers, dispatch } = await import(
  '../../src/indexer/registry.js'
);
const { environment } = await import('../../src/config/environment.js');

describe('Core Soroban Indexer Infrastructure', () => {
  beforeEach(() => {
    mockReset(prismaMock);
    clearHandlers();
    resetPoller();
    jest.clearAllMocks();
    environment.stellar.contractId = 'C_TEST_CONTRACT_ID';
    environment.stellar.indexerStartLedger = undefined;
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  });

  afterEach(() => {
    stopPolling();
  });

  it('fails fast if STELLAR_CONTRACT_ID is unset', async () => {
    environment.stellar.contractId = '';
    await expect(tick()).rejects.toThrow(
      'STELLAR_CONTRACT_ID environment variable is unset or empty',
    );
    await expect(startPolling()).rejects.toThrow(
      'STELLAR_CONTRACT_ID environment variable is unset or empty',
    );
  });

  it('connects to RPC, fetches latest ledger, and logs decoded event without erroring', async () => {
    sorobanServer.getLatestLedger.mockResolvedValue({ sequence: 100 });
    sorobanServer.getEvents.mockResolvedValue({
      events: [
        {
          id: 'evt-1',
          topic: [],
          value: null,
          ledger: 100,
          txHash: 'hash-1',
        },
      ],
    });
    prismaMock.indexerCursor.findUnique.mockResolvedValue(null);
    prismaMock.indexerEvent.findUnique.mockResolvedValue(null);

    await tick();

    expect(sorobanServer.getLatestLedger).toHaveBeenCalled();
    expect(sorobanServer.getEvents).toHaveBeenCalledWith({
      startLedger: 100,
      filters: [{ type: 'contract', contractIds: ['C_TEST_CONTRACT_ID'] }],
      limit: 100,
    });
    expect(getCursor()).toBe(101);
  });

  it('persists cursor after processed batch and resumes correctly', async () => {
    prismaMock.indexerCursor.findUnique.mockResolvedValue({
      contractId: 'C_TEST_CONTRACT_ID',
      lastLedger: 50,
    });
    sorobanServer.getLatestLedger.mockResolvedValue({ sequence: 55 });
    sorobanServer.getEvents.mockResolvedValue({ events: [] });

    await tick();

    expect(sorobanServer.getEvents).toHaveBeenCalledWith({
      startLedger: 50,
      filters: [{ type: 'contract', contractIds: ['C_TEST_CONTRACT_ID'] }],
      limit: 100,
    });
    expect(prismaMock.indexerCursor.upsert).toHaveBeenCalledWith({
      where: { contractId: 'C_TEST_CONTRACT_ID' },
      update: { lastLedger: 56 },
      create: { contractId: 'C_TEST_CONTRACT_ID', lastLedger: 56 },
    });
    expect(getCursor()).toBe(56);
  });

  it('prevents raw event id from being dispatched twice via IndexerEvent replay guard', async () => {
    sorobanServer.getLatestLedger.mockResolvedValue({ sequence: 10 });
    sorobanServer.getEvents.mockResolvedValue({
      events: [
        {
          id: 'evt-duplicate',
          topic: [],
          value: null,
          ledger: 10,
          txHash: 'hash-dup',
        },
      ],
    });
    prismaMock.indexerCursor.findUnique.mockResolvedValue({
      contractId: 'C_TEST_CONTRACT_ID',
      lastLedger: 10,
    });
    prismaMock.indexerEvent.findUnique.mockResolvedValue({
      id: 'evt-duplicate',
      topic: '',
      ledger: 10,
    });

    const handler = jest.fn();
    registerEventHandler('', handler);

    await tick();

    expect(handler).not.toHaveBeenCalled();
    expect(prismaMock.indexerEvent.create).not.toHaveBeenCalled();
  });

  it('skips dispatching on topic with no registered handler without throwing', async () => {
    await expect(
      dispatch({
        id: 'test-id',
        topic: 'unregistered_topic',
        ledger: 1,
        txHash: 'hash',
        data: { foo: 'bar' },
      }),
    ).resolves.not.toThrow();
  });

  it('logs error on bad event and continues poll loop', async () => {
    sorobanServer.getLatestLedger.mockResolvedValue({ sequence: 20 });
    sorobanServer.getEvents.mockResolvedValue({
      events: [
        {
          id: 'evt-bad',
          topic: [],
          value: null,
          ledger: 20,
          txHash: 'hash-bad',
        },
        {
          id: 'evt-good',
          topic: [],
          value: null,
          ledger: 20,
          txHash: 'hash-good',
        },
      ],
    });
    prismaMock.indexerCursor.findUnique.mockResolvedValue({
      contractId: 'C_TEST_CONTRACT_ID',
      lastLedger: 20,
    });
    prismaMock.indexerEvent.findUnique.mockResolvedValue(null);

    const handler = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('Handler failed on bad event');
      })
      .mockImplementationOnce(() => {});
    registerEventHandler('', handler);

    await tick();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(prismaMock.indexerEvent.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.indexerEvent.create).toHaveBeenCalledWith({
      data: {
        id: 'evt-good',
        topic: '',
        ledger: 20,
      },
    });
  });
});
