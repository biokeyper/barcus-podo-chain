# Node Scripts

Helper scripts for running and testing nodes.

## Getting Peer IDs for Bootstrap

To connect Node 3 to Node 1 or Node 2, you need the peer ID. Here are methods to get it:

### Method 1: From Node Logs

When a node starts, it logs its peer ID:
```
[P2P] Peer ID: 12D3KooW...
```

Use this with the IP and port to create the bootstrap multiaddr:
```
/ip4/127.0.0.1/tcp/7001/p2p/<PEER_ID>
```

### Method 2: Using get-peer-id.js

```bash
cd chain
node scripts/get-peer-id.js 7001  # For Node 1 (port 7001)
node scripts/get-peer-id.js 7002  # For Node 2 (port 7002)
```

This will output the peer ID and full multiaddr for bootstrap.

## Starting Node 3

### Option 1: Using the start script

```bash
cd chain
# Get Node 1's peer ID first, then:
./scripts/start-node3.sh "/ip4/127.0.0.1/tcp/7001/p2p/<NODE1_PEER_ID>"
```

### Option 2: Manual start

```bash
cd chain
NODE_ID=node3 \
RPC_PORT=8547 \
P2P_PORT=7003 \
VALIDATOR_ADDR=val3 \
DATA_DIR=./data/node3 \
BOOTSTRAP_PEERS="/ip4/127.0.0.1/tcp/7001/p2p/<NODE1_PEER_ID>" \
npm start
```

### Option 3: Using Docker Compose

```bash
# First, you'll need to update docker-compose.yml with the correct peer ID
# Then:
docker compose -f docker/docker-compose.yml up node3
```

## Testing Gossip Propagation

After starting Node 3, you can test if it receives gossip messages:

```bash
cd chain
npm run build  # Build first
node scripts/test-node3-gossip.js "/ip4/127.0.0.1/tcp/7001/p2p/<NODE1_PEER_ID>"
```

This will:
1. Start Node 3 with bootstrap to Node 1
2. Subscribe to gossip topics
3. Listen for 30 seconds
4. Report how many messages were received

## Verification

To verify Node 3 is connected and receiving gossip:

1. **Check connections**: Node 3 logs should show:
   ```
   [P2P] Connected to peer: ...
   [P2P] Connected to discovered peer ...
   ```

2. **Check gossip**: Node 3 should log incoming messages:
   ```
   [P2P] Incoming block:proposal from ...
   [P2P] Incoming vote:prevote from ...
   [P2P] Incoming vote:precommit from ...
   ```

3. **Check peers**: Use RPC to query peer count (if implemented) or check logs

4. **Check consensus**: Node 3 should participate in consensus rounds
