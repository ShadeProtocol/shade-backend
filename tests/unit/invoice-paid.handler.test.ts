const { decodeInvoicePaidEventData } = await import('../../src/indexer/types.js');
const { dispatch } = await import('../../src/indexer/registry.js');
const { INVOICE_PAID_TOPIC } = await import('../../src/indexer/handlers/invoicePaid.js');
await import('../../src/indexer/handlers/index.js');

describe('InvoicePaid indexer handler', () => {
  test('normalizes the contract event map emitted by scValToNative', () => {
    expect(
      decodeInvoicePaidEventData({
        invoice_id: 42n,
        merchant_id: 9n,
        merchant_account: 'C_MERCHANT_ACCOUNT',
        payer: 'G_PAYER',
        amount: 5000n,
        fee: 50n,
        merchant_amount: 4950n,
        token: 'C_TOKEN',
        timestamp: 1_700_000_000n,
      }),
    ).toEqual({
      invoiceId: 42,
      merchantId: 9,
      payer: 'G_PAYER',
      amount: 5000n,
      fee: 50n,
      merchantAmount: 4950n,
      token: 'C_TOKEN',
      timestamp: 1_700_000_000,
    });
  });

  test('registers the contract event symbol used by InvoicePaidEvent', async () => {
    expect(INVOICE_PAID_TOPIC).toBe('InvoicePaid');
    await expect(
      dispatch({
        id: 'invoice-paid-invalid-payload',
        topic: INVOICE_PAID_TOPIC,
        ledger: 1,
        txHash: 'tx-hash',
        data: null,
      }),
    ).rejects.toThrow('InvoicePaid event data must be a decoded map');
  });
});
