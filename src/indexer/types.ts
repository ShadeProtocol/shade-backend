export interface DecodedEvent {
  id: string;
  topic: string;
  ledger: number;
  txHash: string;
  data: any;
}
