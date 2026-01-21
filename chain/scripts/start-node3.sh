#!/bin/bash
# Script to start Node 3 with bootstrap connection to Node 1 or Node 2

set -e

# Configuration
NODE_ID=node3
RPC_PORT=8547
P2P_PORT=7003
VALIDATOR_ADDR=val3
DATA_DIR="./data/${NODE_ID}"

# Bootstrap peer (default to Node 1, can be overridden)
# Format: /ip4/127.0.0.1/tcp/P2P_PORT/p2p/PEER_ID
BOOTSTRAP_PEER="${1:-/ip4/127.0.0.1/tcp/7001/p2p/NODE1_PEER_ID_HERE}"

echo "Starting Node 3..."
echo "Node ID: ${NODE_ID}"
echo "RPC Port: ${RPC_PORT}"
echo "P2P Port: ${P2P_PORT}"
echo "Validator Address: ${VALIDATOR_ADDR}"
echo "Bootstrap Peer: ${BOOTSTRAP_PEER}"
echo ""

# Create data directory if it doesn't exist
mkdir -p "${DATA_DIR}"

# Start the node
cd "$(dirname "$0")/.."
NODE_ID="${NODE_ID}" \
RPC_PORT="${RPC_PORT}" \
P2P_PORT="${P2P_PORT}" \
VALIDATOR_ADDR="${VALIDATOR_ADDR}" \
DATA_DIR="${DATA_DIR}" \
BOOTSTRAP_PEERS="${BOOTSTRAP_PEER}" \
npm start
