import 'dotenv/config';
import { State } from './state.js';
import { Mempool } from './mempool.js';
import { P2P } from './p2p.js';
import { Consensus } from './consensus.js';
import { startRpc } from './rpc.js';

const NODE_ID = process.env.NODE_ID || 'node1';
const RPC_PORT = Number(process.env.RPC_PORT || 8545);
const P2P_PORT = Number(process.env.P2P_PORT || 7001);
const VALIDATOR_ADDR = process.env.VALIDATOR_ADDR || 'val1';
const DATA_DIR = process.env.DATA_DIR || `./data/${NODE_ID}`;
const BOOTSTRAP_PEERS = process.env.BOOTSTRAP_PEERS || '';

(async () => {
  console.log(`[${NODE_ID}] booting...`);
  const state = new State(DATA_DIR);
  const mem = new Mempool();
  const p2p = new P2P();
  
  // Parse bootstrap peers from environment (comma-separated multiaddrs)
  const bootstrapPeers: string[] = BOOTSTRAP_PEERS 
    ? BOOTSTRAP_PEERS.split(',').map(p => p.trim()).filter(p => p.length > 0)
    : [];
  
  await p2p.start(P2P_PORT, bootstrapPeers);

  const validators = ['val1', 'val2', 'val3', 'val4'];
  const me = VALIDATOR_ADDR;

  const cons = new Consensus(state, mem, p2p, validators, me);
  startRpc(mem, state, RPC_PORT);
  
  // Wait for network to stabilize before starting consensus
  console.log(`[${NODE_ID}] waiting for network to stabilize...`);
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  await cons.run();
})();
