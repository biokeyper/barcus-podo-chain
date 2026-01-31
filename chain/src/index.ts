import 'dotenv/config';
import os from 'os';
import path from 'path';
import { State } from './state.js';
import { Mempool } from './mempool.js';
import { P2P } from './p2p.js';
import { Consensus } from './consensus.js';
import { startRpc } from './rpc.js';
import { GENESIS_BLOCK } from './genesis.js';

const NODE_ID = process.env.NODE_ID || 'node1';
const RPC_PORT = Number(process.env.RPC_PORT || 8545);
const P2P_PORT = Number(process.env.P2P_PORT || 7001);
const VALIDATOR_ADDR = process.env.VALIDATOR_ADDR || 'val1';
const DATA_DIR = process.env.DATA_DIR || `./data/${NODE_ID}`;
const BOOTSTRAP_PEERS = process.env.BOOTSTRAP_PEERS || '';

const getLocalTs = () => {
  const d = new Date();
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0") + " " +
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0") + ":" +
    String(d.getSeconds()).padStart(2, "0");
};

(async () => {
  // Professional startup banner
  console.log(`${getLocalTs()} Barcus Podo Chain`);
  console.log(`${getLocalTs()} ✌️  version 0.1.0-alpha`);
  console.log(`${getLocalTs()} ❤️  by BioKeepR Team, 2025-2026`);
  console.log(`${getLocalTs()} 📋 Chain specification: Barcus Podo`);
  console.log(`${getLocalTs()} 🏷  Node name: ${NODE_ID}`);
  console.log(`${getLocalTs()} 👤 Role: AUTHORITY`);
  console.log(`${getLocalTs()} 💾 Database: LevelDB at ${path.resolve(DATA_DIR)}`);

  const state = new State(DATA_DIR);
  await state.initialize(GENESIS_BLOCK);
  const mem = new Mempool();
  const p2p = new P2P();

  // Hardware info (Polkadot style)
  console.log(`${getLocalTs()} 💻 Operating system: ${os.type().toLowerCase()} ${os.arch()}`);
  console.log(`${getLocalTs()} 💻 CPU: ${os.cpus()[0].model}`);
  console.log(`${getLocalTs()} 💻 Memory: ${Math.round(os.totalmem() / 1024 / 1024)}MB`);

  // Parse bootstrap peers from environment (comma-separated multiaddrs)
  const bootstrapPeers: string[] = BOOTSTRAP_PEERS
    ? BOOTSTRAP_PEERS.split(',').map(p => p.trim()).filter(p => p.length > 0)
    : [];

  await p2p.start(P2P_PORT, bootstrapPeers, state, { dataDir: DATA_DIR });

  const validators = ['val1', 'val2', 'val3', 'val4'];
  const me = VALIDATOR_ADDR;

  const cons = new Consensus(state, mem, p2p, validators, me);
  startRpc(mem, state, RPC_PORT);

  // Wait for network to stabilize before starting consensus
  const stabilizationStart = Date.now();
  while (Date.now() - stabilizationStart < 5000) {
    const peers = p2p.node ? p2p.node.getPeers().length : 0;
    const height = p2p.getHeadHeight();
    const hash = p2p.getPrevHash().slice(0, 10);
    process.stdout.write(`\r${getLocalTs()} 💤 Idle (${peers} peers), best: #${height} (${hash}…), finalized #${height} (${hash}…)`);
    await new Promise(r => setTimeout(r, 1000));
  }
  process.stdout.write('\n');

  await cons.run();
})();
