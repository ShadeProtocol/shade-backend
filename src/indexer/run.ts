import { startPolling, stopPolling } from './poller.js';

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down indexer...');
  stopPolling();
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down indexer...');
  stopPolling();
});

startPolling().catch(error => {
  console.error('Fatal error starting Soroban indexer:', error);
  process.exit(1);
});
