# Barcus PoDO Lightweight Devnet

Minimal backbone for **Barcus**, a Proof of Data Ownership (PoDO) blockchain: libp2p gossip, naive BFT, LevelDB state, JSON-RPC, and Solidity contracts for dataset registration + tokenization.

---

## 🚀 Prerequisites (Ubuntu latest stable)

Make sure you have the following installed:

- **Node.js >= 22** (required for `Promise.withResolvers`)  
  ```bash
  sudo apt update
  sudo apt install -y nodejs npm
  ```
- **Docker + Docker Compose**  
  ```bash
  sudo apt install -y docker.io docker-compose
  sudo systemctl enable docker
  sudo systemctl start docker
  ```
- **Make**  
  ```bash
  sudo apt install -y make
  ```
- **Git**  
  ```bash
  sudo apt install -y git
  ```

---

## ⚡ Quickstart (Devnet with Docker)

Clone the repository and enter the folder:

```bash
git clone https://github.com/biokeyper/barcus.git
cd barcus
```

Install dependencies:

```bash
make install
```

Spin up the devnet (chain nodes + Hardhat contracts):

```bash
make devnet
```

---

## 🔗 Endpoints

- **Chain Node 1 JSON-RPC:** http://localhost:8545  
- **Chain Node 2 JSON-RPC:** http://localhost:8546  
- **Chain Node 3 JSON-RPC:** http://localhost:8547  
- **Hardhat (if running separately):** http://localhost:8555 _(not started by default)_  

---

## 🧪 Example: Register a dataset

```bash
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":1,"method":"podo_submitTx",
    "params":{
      "tx":{
        "from":"addr1","nonce":0,"type":"DATA_REGISTER",
        "payload":{
          "commitmentRoot":"0xabc...def",
          "sizeGiB":100,"salt":"0xsalt","collateral":10
        },
        "signature":"0xsig"
      }
    }
}'
```

---

## 🛑 Stop & Clean

```bash
make stop
make clean
```

---

## 🖥️ Running Locally

### Chain Node (CLI)

1. **Terminal 1 - Node 1:**
   ```bash
   cd chain
   NODE_ID=node1 P2P_PORT=7001 RPC_PORT=8545 VALIDATOR_ADDR=val1 npm start
   ```

2. **Terminal 2 - Node 2:**
   ```bash
   cd chain
   BOOTSTRAP_PEERS="/ip4/127.0.0.1/tcp/7001/p2p/<NODE1_ID>" \
   NODE_ID=node2 P2P_PORT=7002 RPC_PORT=8546 VALIDATOR_ADDR=val2 npm start
   ```

### Contracts

```bash
cd contracts
npm run node
npx hardhat run scripts/deploy.ts --network localhost
```

---

## 🔧 Development Workflow

- **Build TypeScript:**  
  ```bash
  cd chain
  npm run build
  ```
- **Run tests (chain):**  
  ```bash
  cd chain
  npm test  # ~35-40 seconds total (includes 20s+ integration tests)
  ```  
  _Note: Tests use FloodSub for reliable multi-node message propagation_

---

## 🩺 Troubleshooting

- **Missing build tools:** LevelDB requires C++ compilation.  
- **Port conflicts:** Ensure `8545/8546/8547` (RPC) and `7001/7002/7003` (P2P) are free.  
- **Libp2p/Level errors:** Ensure Node.js >= 22 is installed.
- **Local connection only**: Nodes bind to `127.0.0.1` by default for local testing. To allow external connections (e.g., Docker), change the listen address in `chain/src/p2p.ts` from `127.0.0.1` to `0.0.0.0`.

---

## ⚠️ Known Issues

- **P2P Implementation:** Currently using FloodSub instead of GossipSub for reliable message propagation in devnet/tests. This floods all messages to all connected peers rather than using a gossip mesh.
  - **Why:** GossipSub mesh formation can take 10-30 seconds in test environments
  - **Production note:** Consider switching back to GossipSub for larger networks
  
- **Multi-node mesh formation:** After starting a new node, allow 5-10 seconds for FloodSub subscriptions to propagate before expecting full message delivery.

- **Test duration:** Integration tests (`p2p.integration.test.ts`) take ~20 seconds due to connection establishment and message exchange delays.

- **Block Height Sync:** Currently, nodes must start at the same block height to reach consensus. If a node joins a network that has already progressed to a higher block height, it will fail to validate proposals due to height mismatches and cannot catch up automatically.
  - **TODO:** Implement a state synchronization mechanism where late-joining nodes can request historical blocks/state from peers to catch up to the current network height.

---

## 🤝 Contributing

1. Fork the repo and create a feature branch.  
2. Make changes with clear commit messages.  
3. Run `make install && make devnet` to verify.  
4. Submit a pull request.

---

## 📌 Notes

- Cryptography and vote collection are stubbed for demo purposes.  
- Contracts deploy automatically to the local Hardhat node.  
- Extend with secp256k1 keys, validator set management, slashing, and SNARK/STARK proofs.

---

## 🏃 First Run Walkthrough

### Option A: Run with Docker

```bash
make install
make devnet
```

Expected output:
```
Devnet running. RPC: http://localhost:8545 (node1) | http://localhost:8546 (node2) | http://localhost:8547 (node3)
Hardhat JSON-RPC: http://127.0.0.1:8555
```

### Option B: Run locally

```bash
cd chain
npm run dev
```

Expected output:
```
[node1] booting...
JSON-RPC listening on :8545
Proposing block #1...
Committed block #1
```

---

## 🔮 Consensus Walkthrough

Barcus uses a **naive BFT loop** with three gossip topics:

- **block:proposal** – proposer broadcasts a candidate block.  
- **vote:prevote** – validators signal acceptance of the proposal.  
- **vote:precommit** – validators confirm quorum and commit.

**Expected logs (outbound):**
```
[P2P] Published message on block:proposal to 2 peers.
[P2P] Published message on vote:prevote to 2 peers.
[P2P] Published message on vote:precommit to 2 peers.
```

**Expected logs (inbound):**
```
[P2P] Incoming block:proposal from 12D3KooW...: height 1
[P2P] Validated block proposal from 12D3KooW...: height 1
[P2P] Incoming vote:prevote from 12D3KooW...: height 1
[P2P] Incoming vote:precommit from 12D3KooW...: height 1
```

Consensus is reached when ≥2/3 validators send precommits for the same block.

---

## 🌐 Multi‑Node Scaling

## 🌐 Multi‑Node Scaling

The default devnet runs 3 nodes. To add **Node 4**:

```bash
BOOTSTRAP_PEERS="/ip4/127.0.0.1/tcp/7001/p2p/<NODE1_ID>" \
NODE_ID=node4 P2P_PORT=7004 RPC_PORT=8548 VALIDATOR_ADDR=val4 npm start
```

You'll see subscription changes as the node discovers the existing network:
```
[P2P] Subscription change for peer 12D3KooW...: block:proposal, vote:prevote, vote:precommit
[P2P] Connected to peer: 12D3KooW
```

> **Note:** Allow 5-10 seconds after node startup for FloodSub subscriptions to fully propagate before expecting all nodes to receive messages.

---

## 🎭 Validator Roles

Nodes can be configured as:

- **Validator** – proposes and votes.  
- **Observer** – subscribes to gossip but does not vote.  
- **Light client** – queries state via RPC only.

Use `VALIDATOR_ADDR` or CLI flags to set role.

---

## 💾 State Persistence

- Chain state stored in `./data/<NODE_ID>` via LevelDB.  
- Snapshots can be taken after each commit.  
- `make clean` wipes state for a fresh devnet.


---

## 🛠️ Helper Scripts

Located in `chain/scripts/`, these help with node operations:

- `start-node3.sh`: Quickly start node 3 connecting to node 1.
- `get-peer-id.js`: Fetch peer ID from a running node.
- `test-node3-gossip.js`: Verify gossip propagation.

---

## 🔐 Security Notes

- Current cryptography is stubbed.  
- Roadmap: secp256k1 signatures, validator set management, slashing, SNARK/STARK proofs.  
- Do not use this devnet for production workloads.

---

## 🧪 Testing Consensus

- **Faulty validator simulation:** Start a node that skips prevotes.  
- **Expected outcome:** Remaining validators still reach quorum if ≥2/3 are honest.  
- **Logs:** Missing votes will be visible in consensus round logging.

---

## 📊 Metrics & Monitoring

Future enhancements:

- Peer count and latency tracking.  
- Gossip throughput metrics.  
- Prometheus/Grafana integration for dashboards.

---

## 🗺️ Architecture Diagram

```
+-------------------+       +-------------------+
|   Node 1 (val1)   |<----->|   Node 2 (val2)   |
| RPC:8545, P2P:7001|       | RPC:8546, P2P:7002|
+-------------------+       +-------------------+
         ^    ^                    ^
         |    |                    |
         |    +-----------+--------+
         |                |
 +-------------------+    |
 |   Node 3 (val3)   |<---+
 | RPC:8547, P2P:7003|
 +-------------------+
```

Nodes gossip proposals/votes via libp2p, persist state in LevelDB, and expose JSON‑RPC for clients. Contracts run on Hardhat.

---

## ✅ Success Criteria

- Nodes connect and gossip proposals/votes.  
- Consensus rounds log quorum and commits.  
- RPC calls return valid responses.  
- Contracts deploy and respond to transactions.

---

