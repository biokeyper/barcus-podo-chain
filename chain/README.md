# Barcus Chain Node

Core blockchain logic for the Barcus PoDO network. This module implements the internal state machine, BFT consensus, P2P networking using libp2p, and a JSON-RPC interface.

---

## 🏗️ Architecture

The node is composed of several modular components:

- **P2P (`src/p2p.ts`)**: Handles peer discovery (mDNS + Bootstrap), Gossipsub messaging, and connection management using libp2p.
- **Consensus (`src/consensus.ts`)**: Implements a simple BFT-style consensus loop that proposes blocks and collects votes from validators.
- **State (`src/state.ts`)**: Manages the persistent blockchain state using LevelDB. It tracks balances and registered datasets.
- **Mempool (`src/mempool.ts`)**: Buffers incoming transactions before they are proposed in a block.
- **RPC (`src/rpc.ts`)**: Provides a JSON-RPC 2.0 interface for interacting with the node.

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

### Start a Node
```bash
# Start Node 1
NODE_ID=node1 P2P_PORT=7001 RPC_PORT=8545 VALIDATOR_ADDR=val1 npm start

# Start Node 2 (using Node 1's multiaddr as bootstrap)
BOOTSTRAP_PEERS="/ip4/127.0.0.1/tcp/7001/p2p/PEER_ID_HERE" \
NODE_ID=node2 P2P_PORT=7002 RPC_PORT=8546 VALIDATOR_ADDR=val2 npm start
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

### Dev Mode (Auto-reload)
```bash
npm run dev
```
