# 🛠️ Guidelines for AI Coding Agents in PoDO Standalone

## 🔑 Chain Configuration
- Use **environment variables** or local config files to define node identity, ports, and validator addresses.  
- No relay chain or parachain registration — nodes bootstrap directly via peer discovery.

## 🌱 Genesis State
- Initialize balances, validator set, and dataset registry entries locally at node startup.  
- Persist state in **LevelDB**; expose via JSON‑RPC.  
- Treat genesis as local initialization data, not something uploaded externally.

## ⚡ Consensus
- PoDO uses **naive BFT gossip** (proposal, prevote, precommit).  
- Ensure genesis validators are correctly defined for quorum.  
- AI agents should help implement vote collection, quorum checks, and logging.

## 🔧 Upgrades
- Runtime upgrades are **code changes**.  
- Redeploy nodes and migrate LevelDB state if necessary.  
- No Wasm blob submission or relay chain governance.

## 🧪 Testing
- Spin up multiple nodes locally (CLI or Docker).  
- Verify gossip propagation and consensus rounds.  
- Simulate faulty validators to test quorum resilience.

---

## 🔐 Identity Management in PoDO Standalone

### Why Persist IDs
- **Stable connectivity**: Nodes need consistent Peer IDs so others can bootstrap reliably.
- **Validator recognition**: Consensus depends on knowing which validator is which.
- **Operational reality**: Every major blockchain persists node identities for continuity.

### Security Risks
- If the private key file is stolen, an attacker can impersonate the node.
- This could enable eclipse attacks or disrupt consensus.

### Recommended Practices
- **File permissions**: Store identity files in `./data/<NODE_ID>` with restricted access (`chmod 600`).
- **Encryption**: Protect validator keys with a passphrase (required at startup).
- **Environment isolation**: Run nodes inside Docker or systemd units.
- **Disk security**: Use encrypted volumes for production-like setups.
- **Rotation**: Generate new identity if compromise is suspected.

### Local Devnet vs Production-like
- **Local devnet**: Docker volumes + file permissions are sufficient.
- **Production-like**: Add passphrase protection and disk encryption.

---

### 📌 Summary
In PoDO standalone, chain specs, genesis state, and node identities are **local and self‑contained**. AI coding agents should focus on helping developers configure nodes, initialize genesis data, implement persistent identity management, and test multi‑node setups.
