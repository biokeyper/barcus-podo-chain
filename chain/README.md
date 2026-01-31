# Barcus Chain Node

Core blockchain logic for the Barcus PoDO network. This module implements the internal state machine, BFT consensus, P2P networking using libp2p, and a JSON-RPC interface.

---

## 🏗️ Architecture

The node is composed of several modular components:

- **P2P (`src/p2p.ts`)**: Handles peer discovery (mDNS + Bootstrap), Gossipsub messaging, and persistent node identity using libp2p.
- **Consensus (`src/consensus.ts`)**: Implements a simple BFT-style consensus loop that proposes blocks and collects votes from validators.
- **State (`src/state.ts`)**: Manages the persistent blockchain state using LevelDB. It tracks balances and registered datasets.
- **Mempool (`src/mempool.ts`)**: Buffers incoming transactions before they are proposed in a block.
- **RPC (`src/rpc.ts`)**: Provides a JSON-RPC 2.0 interface for interacting with the node.
- **Synchronization (`src/p2p.ts` & `src/consensus.ts`)**: Implements a request/response block sync protocol (`/barcus/sync/1.0.0`) to help nodes catch up to the network height.

---

## 🔄 Synchronization

The node features an automated synchronization mechanism:
1. **Detection**: Upon receiving gossip messages (e.g., block proposals), the node compares its local head height with the message's height.
2. **Sync Trigger**: If the network is ahead, the `Consensus` loop triggers a `sync()` call.
3. **Peer Retrieval**: The node iterates through connected peers and requests missing blocks by height using a dedicated libp2p protocol.
4. **Validation & Commit**: Each retrieved block is validated against the previous hash, its transactions are applied to the state, and it is persisted to LevelDB.

---

## ⚙️ Configuration

The node is configured via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ID` | Human-readable identifier for the node | `node1` |
| `RPC_PORT` | Port for the JSON-RPC server | `8545` |
| `P2P_PORT` | Port for libp2p TCP connections | `7001` |
| `VALIDATOR_ADDR`| Address used by this validator | `val1` |
| `DATA_DIR` | Directory for LevelDB state files | `./data/${NODE_ID}` |
| `BOOTSTRAP_PEERS`| Comma-separated list of bootstrap multiaddrs | (empty) |

---

## 🚀 Running Locally

### Prerequisites
- Node.js >= 18
- Build-essential (for LevelDB/Node-gyp)

### Installation
```bash
npm install
```

### Running a Local Cluster (4 Nodes)

The consensus logic expects 4 validators (`val1`, `val2`, `val3`, `val4`). You can run them manually or via Docker.

The consensus logic expects 4 validators (`val1`, `val2`, `val3`, `val4`). Node identities are **persistent** (saved in `./data/*/identity.key`), so bootstrap multiaddrs remain stable.

**Environment Setup**:
Copy the sample environment files:
```bash
cp .env.node1.sample .env
cp .env.node2.sample .env.node2
cp .env.node3.sample .env.node3
cp .env.node4.sample .env.node4
```
> [!NOTE]
> For nodes 2, 3, and 4, edit their `.env` files to replace `<NODE1_PEER_ID>` with the actual PeerID printed by Node 1 when it starts.

**Fresh Start (Recommended after code changes)**:
```bash
rm -rf data        # Clear old state
npm run build      # Recompile TypeScript
```

#### Option 1: Manual (Simplified with .env)

1. **Terminal 1 (Node 1 - Bootstrap)**:
   ```bash
   npm start
   ```

2. **Terminal 2 (Node 2)**:
   ```bash
   export $(cat .env.node2 | xargs) && npm start
   ```

3. **Terminal 3 (Node 3)**:
   ```bash
   export $(cat .env.node3 | xargs) && npm start
   ```

4. **Terminal 4 (Node 4)**:
   ```bash
   export $(cat .env.node4 | xargs) && npm start
   ```

#### Option 2: Docker Compose

You can start a pre-configured 4-node cluster from the root directory:
```bash
make devnet
```

---

## 🛠️ API Reference

The node supports JSON-RPC 2.0 at `http://localhost:${RPC_PORT}`.

### `podo_submitTx`
Submit a transaction to the mempool.
- **Params**: `{ tx: Tx }`
- **Returns**: Transaction hash

### `podo_getBalance`
Get the balance of an address.
- **Params**: `{ address: string }`
- **Returns**: Number

### `podo_getDataset`
Retrieve registration info for a commitment root.
- **Params**: `{ hash: string }`
- **Returns**: Dataset object or null

---

## 🧪 Development

### Build
```bash
npm run build
```

### Test
```bash
npm test
```

### Dev Mode (Auto-reload)
```bash
npm run dev
```

---

## 🤖 AI Coding Guidelines
For AI agents contributing to this project, please follow the [PODO_AI_GUIDELINES.md](../docs/PODO_AI_GUIDELINES.md).
