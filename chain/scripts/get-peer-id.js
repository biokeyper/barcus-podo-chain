#!/usr/bin/env node
// Script to get a node's peer ID and multiaddr for bootstrap configuration
import { createLibp2p } from "libp2p";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@libp2p/yamux";
import { identify } from "@libp2p/identify";

const port = parseInt(process.argv[2] || process.env.P2P_PORT || '7001');

async function getPeerInfo() {
  const node = await createLibp2p({
    addresses: { listen: [`/ip4/0.0.0.0/tcp/${port}`] },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      pubsub: gossipsub(),
      identify: identify()
    },
  });

  await node.start();
  
  const peerId = node.peerId.toString();
  const multiaddrs = node.getMultiaddrs();
  
  console.log(`\nPeer ID for port ${port}:`);
  console.log(`  Peer ID: ${peerId}`);
  console.log(`\nMultiaddrs for bootstrap:`);
  multiaddrs.forEach((addr, i) => {
    console.log(`  ${i + 1}. ${addr.toString()}/p2p/${peerId}`);
  });
  console.log(`\nBootstrap peer string (use this in BOOTSTRAP_PEERS):`);
  const bootstrapAddr = multiaddrs[0];
  if (bootstrapAddr) {
    console.log(`  ${bootstrapAddr.toString()}/p2p/${peerId}`);
  }
  
  await node.stop();
  process.exit(0);
}

getPeerInfo().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
