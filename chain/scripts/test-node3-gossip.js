#!/usr/bin/env node
// Script to test gossip propagation to Node 3
import { P2P } from '../dist/p2p.js';

async function testGossipPropagation() {
  console.log('Testing gossip propagation to Node 3...\n');
  
  // Start Node 3 (or connect to existing one)
  const node3 = new P2P();
  const node1Multiaddr = process.argv[2];
  
  if (!node1Multiaddr) {
    console.error('Usage: node test-node3-gossip.js <node1-multiaddr>');
    console.error('Example: node test-node3-gossip.js /ip4/127.0.0.1/tcp/7001/p2p/12D3KooW...');
    process.exit(1);
  }
  
  console.log(`Starting Node 3 with bootstrap: ${node1Multiaddr}`);
  await node3.start(7003, [node1Multiaddr]);
  
  console.log('\nWaiting for connection to establish...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Check peer connections
  const peers = node3.node.getPeers();
  console.log(`\nNode 3 connected peers: ${peers.length}`);
  if (peers.length > 0) {
    console.log('Peers:', peers.map(p => p.toString().slice(0, 8)).join(', '));
  }
  
  // Setup listener for gossip messages
  const pubsub = node3.node.services.pubsub;
  let messageCount = 0;
  
  pubsub.addEventListener('message', (evt) => {
    const { topic, data } = evt.detail;
    messageCount++;
    try {
      const decoded = JSON.parse(new TextDecoder().decode(data));
      console.log(`\n[Node 3] Received ${topic} message #${messageCount}:`, decoded);
    } catch (err) {
      console.error('Failed to decode message:', err);
    }
  });
  
  // Subscribe to topics
  await pubsub.subscribe('block:proposal');
  await pubsub.subscribe('vote:prevote');
  await pubsub.subscribe('vote:precommit');
  
  console.log('\nNode 3 subscribed to gossip topics');
  console.log('Listening for messages from Node 1/2...');
  console.log('(This will run for 30 seconds, then exit)\n');
  
  // Wait for messages
  await new Promise(resolve => setTimeout(resolve, 30000));
  
  console.log(`\nTest complete. Node 3 received ${messageCount} messages.`);
  
  if (messageCount > 0) {
    console.log('✅ Gossip propagation is working!');
  } else {
    console.log('⚠️  No messages received. Check that Node 1/2 are running and broadcasting.');
  }
  
  await node3.node.stop();
  process.exit(0);
}

testGossipPropagation().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
