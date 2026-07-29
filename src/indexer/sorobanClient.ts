import { rpc } from '@stellar/stellar-sdk';
import { environment } from '../config/environment.js';

export const sorobanServer = new rpc.Server(environment.stellar.rpcUrl);
export default sorobanServer;
