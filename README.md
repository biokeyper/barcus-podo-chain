# Barcus PoDO Lightweight Devnet

Minimal backbone for **Barcus**, a Proof of Data Ownership (PoDO) blockchain: libp2p gossip, naive BFT, LevelDB state, JSON-RPC, and Solidity contracts for dataset registration + tokenization.

---

## 🚀 Prerequisites (Ubuntu latest stable)

Make sure you have the following installed:

- **Node.js >= 18**  
  ```bash
  sudo apt update
  sudo apt install -y nodejs npm
  # optional: install nvm for managing versions
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
- **Hardhat local chain:** http://127.0.0.1:8545  

---

## 🧪 Example: Register a dataset

Submit a dataset registration transaction via JSON-RPC:

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

### Chain Node (CLI)

The blockchain logic resides in the `chain/` directory. For detailed configuration, architecture, and API docs, see [chain/README.md](chain/README.md).

To run a multi-node devnet locally:

1. **Terminal 1 - Node 1:**
   ```bash
   cd chain
   NODE_ID=node1 P2P_PORT=7001 RPC_PORT=8545 VALIDATOR_ADDR=val1 npm start
   ```

2. **Terminal 2 - Node 2:**
   Copy Node 1's peer ID and run:
   ```bash
   cd chain
   BOOTSTRAP_PEERS="/ip4/127.0.0.1/tcp/7001/p2p/<NODE1_ID>" \
   NODE_ID=node2 P2P_PORT=7002 RPC_PORT=8546 VALIDATOR_ADDR=val2 npm start
   ```

### Contracts

To run contracts locally:

```bash
cd contracts
npx hardhat node
npx hardhat run scripts/deploy.ts --network localhost
```

---

## 🔧 Development Workflow

- **Build TypeScript:**  
  ```bash
  cd chain
  npm run build
  ```
- **Run tests (contracts):**  
  ```bash
  cd contracts
  npx hardhat test
  ```
- **Lint code:**  
  ```bash
  npm run lint
  ```
- **Restart TS server in VS Code:**  
  `Ctrl+Shift+P → TypeScript: Restart TS server`

---


- **Missing build tools:** LevelDB requires C++ compilation. On Linux: `sudo apt install build-essential`.
- **Port conflicts:** Ensure `8545/8546` (RPC) and `7001/7002` (P2P) are free.
- **Libp2p/Level errors:** Refer to [chain/README.md](chain/README.md#technical-notes) for module-specific troubleshooting.

---

## 🤝 Contributing

1. Fork the repo and create a feature branch.  
2. Make changes with clear commit messages.  
3. Run `make install && make devnet` to verify.  
4. Submit a pull request.

---

## 📌 Notes

- Cryptography and vote collection are stubbed for demo purposes.  
- Contracts deploy automatically to the local Hardhat node when you run `make devnet`.  
- Extend with secp256k1 keys, validator set management, slashing, and SNARK/STARK proofs.


## 🏃 First Run Walkthrough

### Option A: Run with Docker (recommended for quick devnet)

```bash
make install
make devnet
```

**Expected console output (abridged):**
```
Starting devnet (chain nodes + local EVM + contracts)...
Creating network "barcus_default" ...
Building node1
Building node2
Starting node1 ... done
Starting node2 ... done
Devnet running. RPC: http://localhost:8545 (node1) | http://localhost:8546 (node2)
Hardhat JSON-RPC: http://127.0.0.1:8545
```

At this point:
- Node1 and Node2 are gossiping blocks over libp2p.
- Hardhat has deployed `DataToken` and `DataRegistry` contracts.
- You can hit `curl http://localhost:8545` with JSON‑RPC requests.

---

### Option B: Run locally (no Docker)

1. Start a chain node:
   ```bash
   cd chain
   npm run dev
   ```
   **Expected output:**
   ```
   [node1] booting...
   JSON-RPC listening on :8545
   Proposing block #1...
   Committed block #1
   Proposing block #2...
   ...
   ```

   You’ll see blocks being proposed and committed in a loop.

2. Start Hardhat for contracts:
   ```bash
   cd contracts
   npx hardhat node
   ```
   **Expected output:**
   ```
   Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
   Accounts: 0x5FbDB2315678afecb367f032d93F642f64180aa3 ...
   ```

3. Deploy contracts:
   ```bash
   npx hardhat run scripts/deploy.ts --network localhost
   ```
   **Expected output:**
   ```
   DataToken: 0x1234...abcd
   DataRegistry: 0xabcd...1234
   ```

---

### Verify connectivity

Submit a test transaction:

```bash
curl -X POST http://localhost:8545 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0","id":1,"method":"podo_getBalance",
    "params":{"address":"addr1"}
  }'
```

**Expected response:**
```json
{"jsonrpc":"2.0","id":1,"result":0}
```

---

## ✅ Success Criteria

- **Docker mode:** You see containers running (`docker ps`) and contracts deployed.  
- **Local mode:** You see blocks being proposed/committed in the console, and Hardhat node prints accounts.  
- **RPC test:** JSON‑RPC calls return valid responses (balances, dataset registration, etc.).

