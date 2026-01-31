// chain/src/p2p.ts
import { createLibp2p, Libp2p } from "libp2p";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@libp2p/yamux";
import { mdns } from "@libp2p/mdns";
import { identify } from "@libp2p/identify";
import { multiaddr } from "@multiformats/multiaddr";

export class P2P {
  node!: Libp2p;
  headHeight = 0;
  prevHash = "0x" + "0".repeat(64);
  private dialedPeers = new Set<string>();

  async start(port: number, bootstrapPeers: string[] = []) {
    const tcpTransport = tcp() as any;
    const noiseEncrypt = noise() as any;
    const yamuxMuxer = yamux() as any;
    const gs = gossipsub({
      floodPublish: true,
      D: 2,
      Dlo: 1,
      Dhi: 4,
    }) as any;

    const peerDiscoveryModules: any[] = [mdns() as any];

    this.node = await createLibp2p({
      addresses: { listen: [`/ip4/0.0.0.0/tcp/${port}`] },
      transports: [tcp()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      services: {
        pubsub: gossipsub({
          allowPublishToZeroTopicPeers: true,
          floodPublish: true,
          D: 2,
          Dlo: 1,
          Dhi: 4,
        }),
        identify: identify()
      } as any,
      peerDiscovery: [mdns()],
      connectionManager: {
        maxConnections: 100
      }
    } as any);

    await this.node.start();

    const pubsub = (this.node.services as any).pubsub;

    await pubsub.subscribe("block:proposal");
    await pubsub.subscribe("vote:prevote");
    await pubsub.subscribe("vote:precommit");

    // Add message handlers
    pubsub.addEventListener('message', (evt: any) => {
      const { topic, data, from } = evt.detail;
      const peerId = from.toString().slice(-6);

      try {
        const decoded = JSON.parse(new TextDecoder().decode(data));
        let height = decoded.height;
        if (topic === 'block:proposal' && decoded.header) {
          height = decoded.header.height;
        }

        if (['block:proposal', 'vote:prevote', 'vote:precommit'].includes(topic)) {
          console.log(`[P2P] Incoming ${topic} from ...${peerId}: height ${height}`);
        } else {
          console.log(`[P2P] Ignored message on unknown topic ${topic} from ...${peerId}`);
        }
      } catch (err) {
        console.error(`[P2P] Failed to decode message on topic ${topic}:`, err);
      }
    });

    console.log(`[P2P] Peer ID: ${this.node.peerId.toString()}`);
    console.log(`[P2P] Listening addresses:`, this.node.getMultiaddrs().map(a => a.toString()));
    console.log(`[P2P] Node listening on port ${port}, waiting for peers...`);

    // Listen for peer discovery and connection events
    this.node.addEventListener('peer:connect', (evt) => {
      console.log(`[P2P] Connected to peer: ${evt.detail.toString().slice(0, 8)}`);
    });

    this.node.addEventListener('peer:discovery', async (evt) => {
      const peerId = evt.detail.id.toString();
      const addrs = evt.detail.multiaddrs;

      if (!this.dialedPeers.has(peerId) && addrs && addrs.length > 0) {
        this.dialedPeers.add(peerId);
        // Try each address until one works
        for (const addr of addrs) {
          try {
            await this.node.dial(addr);
            console.log(`[P2P] Connected to discovered peer ${peerId.slice(0, 8)}...`);
            break;
          } catch (err) {
            // Try next address
          }
        }
      }
    });

    // Connect to bootstrap peers if provided
    if (bootstrapPeers && bootstrapPeers.length > 0) {
      console.log(`[P2P] Bootstrap peers configured: ${bootstrapPeers.join(', ')}`);

      const dialBootstrapPeers = async () => {
        for (const peerAddr of bootstrapPeers) {
          try {
            const ma = multiaddr(peerAddr);
            await this.node.dial(ma);
            console.log(`[P2P] Successfully connected to bootstrap peer: ${peerAddr}`);
          } catch (err: any) {
            console.log(`[P2P] Failed to connect to bootstrap peer ${peerAddr}: ${err.message}`);
          }
        }
      };

      // Try to connect after 2 seconds to allow node to fully initialize
      setTimeout(async () => {
        await dialBootstrapPeers();

        // Retry every 5 seconds if still no peers
        const retryInterval = setInterval(async () => {
          const peers = this.node.getPeers();
          if (peers.length === 0) {
            console.log(`[P2P] No peers connected, retrying bootstrap peers...`);
            await dialBootstrapPeers();
          } else {
            console.log(`[P2P] Connected to ${peers.length} peer(s), stopping retry.`);
            clearInterval(retryInterval);
          }
        }, 5000);
      }, 2000);
    } else {
      console.log(`[P2P] No bootstrap peers configured. Relying on mDNS discovery only.`);
    }
  }

  broadcast(topic: string, msg: any): Promise<void> {
    const peers = this.node.getPeers();

    if (peers.length === 0) {
      console.log(`[P2P] No peers connected yet. Skipping publish on ${topic}.`);
      return Promise.resolve();
    }

    return this.publishWithRetry(topic, msg, 10);
  }

  private async publishWithRetry(topic: string, msg: any, maxRetries: number) {
    const pubsub = (this.node.services as any).pubsub;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await pubsub.publish(topic, new TextEncoder().encode(JSON.stringify(msg)));
        const peers = this.node.getPeers();
        console.log(`[P2P] Published message on ${topic} to ${peers.length} peers.`);
        return;
      } catch (err: any) {
        if (attempt < maxRetries - 1) {
          const waitTime = 500 * Math.pow(2, attempt);
          console.log(`[P2P] Publish retry on ${topic} (attempt ${attempt + 1}/${maxRetries}), waiting ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          console.log(`[P2P] Publish on ${topic} failed after ${maxRetries} attempts: ${err.message}`);
        }
      }
    }
  }

  async collectVotes(height: number, type: "PREVOTE" | "PRECOMMIT", total: number) {
    return new Array(Math.ceil((2 * total) / 3)).fill(0);
  }

  async getHeadHeight() {
    return this.headHeight;
  }

  async setHead(h: number, hash: string) {
    this.headHeight = h;
    this.prevHash = hash;
  }

  async getPrevHash() {
    return this.prevHash;
  }

  getPeerId(): string {
    return this.node.peerId.toString();
  }

  getMultiaddrs(): string[] {
    return this.node.getMultiaddrs().map(a => a.toString());
  }
}
