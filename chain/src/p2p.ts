// chain/src/p2p.ts
import { createLibp2p, Libp2p } from "libp2p";
import { floodsub } from "@libp2p/floodsub";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@libp2p/yamux";
import { mdns } from "@libp2p/mdns";
import { bootstrap } from "@libp2p/bootstrap";
import { identify } from "@libp2p/identify";
import { multiaddr } from "@multiformats/multiaddr";
import { peerIdFromString } from "@libp2p/peer-id";
import { pipe } from "it-pipe";
import * as lp from "it-length-prefixed";
import { Block } from "./types.js";
import { hashBlock } from "./block.js";
import { State } from "./state.js";
import { validateBlockProposal, ValidationError } from "./validation.js";

export class P2P {
  node!: Libp2p;
  headHeight = 0;
  prevHash = "0x" + "0".repeat(64);
  private dialedPeers = new Set<string>();
  // Map<height:type, Map<validator, Vote>>
  private votes: Map<string, Map<string, any>> = new Map();
  // Map<height, Block> - stores validated block proposals
  private validatedProposals: Map<number, Block> = new Map();
  private state?: State;
  private networkHeight = 0;
  private stopping = false;

  async start(port: number, bootstrapPeers: string[] = [], state?: State, options: { enableMdns?: boolean } = {}) {
    const { enableMdns = true } = options;
    this.state = state;
    if (this.state) {
      this.headHeight = await this.state.getHead();
      const lastBlock = await this.state.getBlock(this.headHeight);
      if (lastBlock) {
        this.prevHash = hashBlock(lastBlock);
        console.log(`[P2P] Resuming from height ${this.headHeight}, head hash: ${this.prevHash}`);
      }
    }

    this.node = await createLibp2p({
      addresses: { listen: [`/ip4/0.0.0.0/tcp/${port}`] },
      transports: [tcp()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      services: {
        pubsub: floodsub(),
        identify: identify()
      } as any,
      peerDiscovery: [
        ...(enableMdns ? [mdns()] : []),
        ...(bootstrapPeers.length > 0 ? [bootstrap({ list: bootstrapPeers.map(p => multiaddr(p).toString()) })] : [])
      ],
      connectionManager: {
        maxConnections: 100
      }
    } as any);

    // Setup event listeners BEFORE start
    this.node.addEventListener('peer:connect', (evt) => {
      console.log(`[P2P] Connected to peer: ${evt.detail.toString().slice(0, 8)}`);
    });

    this.node.addEventListener('peer:discovery', async (evt) => {
      const peerId = evt.detail.id.toString();
      const addrs = evt.detail.multiaddrs;
      if (!this.dialedPeers.has(peerId) && addrs && addrs.length > 0) {
        this.dialedPeers.add(peerId);
        for (const addr of addrs) {
          try {
            await this.node.dial(addr);
            console.log(`[P2P] Connected to discovered peer ${peerId.slice(0, 8)}...`);
            break;
          } catch (err) { }
        }
      }
    });

    await this.node.start();

    const pubsub = (this.node.services as any).pubsub;

    // Join topics
    await pubsub.subscribe("block:proposal");
    await pubsub.subscribe("vote:prevote");
    await pubsub.subscribe("vote:precommit");

    pubsub.addEventListener('message', (evt: any) => {
      const { topic, data, from } = evt.detail;
      const peerId = from.toString();
      try {
        const decoded = JSON.parse(new TextDecoder().decode(data));
        let height = decoded.height;
        if (topic === 'block:proposal' && decoded.header) {
          height = decoded.header.height;
        }

        if (height && height > this.networkHeight) {
          this.networkHeight = height;
        }

        if (topic === 'block:proposal' && decoded.header) {
          height = decoded.header.height;

          // Validate block proposal
          try {
            const expectedHeight = this.headHeight + 1;
            validateBlockProposal(decoded, expectedHeight, this.prevHash);

            // Store validated proposal
            this.validatedProposals.set(height, decoded);
            console.log(`[P2P] Validated block proposal from ${peerId}: height ${height}`);
          } catch (validationErr) {
            if (validationErr instanceof ValidationError) {
              console.warn(`[P2P] Invalid block proposal from ${peerId} at height ${height}: ${validationErr.message}`);
            } else {
              console.error(`[P2P] Error validating block proposal from ${peerId}:`, validationErr);
            }
            // Don't process invalid proposals
            return;
          }
        }

        if (['block:proposal', 'vote:prevote', 'vote:precommit'].includes(topic)) {
          console.log(`[P2P] Incoming ${topic} from ${peerId}: height ${height}`);
          if (topic.startsWith('vote:')) {
            const key = `${decoded.height}:${topic}`;
            if (!this.votes.has(key)) this.votes.set(key, new Map());
            this.votes.get(key)!.set(decoded.validator, decoded);
          }
        } else {
          console.log(`[P2P] Ignored message on unknown topic ${topic} from ${peerId}`);
        }
      } catch (err) {
        console.error(`[P2P] Failed to decode message on topic ${topic}:`, err);
      }
    });

    pubsub.addEventListener('subscription-change', (evt: any) => {
      const { peerId, subscriptions } = evt.detail;
      console.log(`[P2P] Subscription change for peer ${peerId.toString()}: ${subscriptions.map((s: any) => s.topic).join(', ')}`);
    });

    // Manual initial dial for bootstrap peers to ensure immediate connection
    if (bootstrapPeers.length > 0) {
      for (const peerAddr of bootstrapPeers) {
        try {
          await this.node.dial(multiaddr(peerAddr));
          console.log(`[P2P] Explicitly dialed bootstrap peer: ${peerAddr}`);
        } catch (err) { }
      }
    }

    // Register sync handler
    this.node.handle('/barcus/sync/1.0.0', async (data: any) => {
      if (this.stopping) return;
      const stream = data.stream || data;
      const self = this;

      try {
        const decodedSource = lp.decode(stream);
        for await (const msg of decodedSource) {
          if (self.stopping) break;
          const reqStr = new TextDecoder().decode(msg.subarray());
          const req = JSON.parse(reqStr);
          const height = req.height;
          if (self.state) {
            const block = await self.state.getBlock(height);
            if (block) {
              const encoded = lp.encode([new TextEncoder().encode(JSON.stringify(block))]);
              for await (const chunk of encoded) {
                if (self.stopping) break;
                stream.send(chunk.subarray());
              }
            }
          }
        }
      } catch (err: any) {
        // Only log errors that are not expected during normal operation
        const ignoredErrors = ['StreamClosedError', 'StreamResetError', 'StreamStateError', 'InvalidStateError'];
        if (!ignoredErrors.includes(err.name)) {
          console.error('[P2P] Sync stream error:', err);
        }
      }
    });

    console.log(`[P2P] Peer ID: ${this.node.peerId.toString()}`);
    console.log(`[P2P] Node listening on port ${port}`);
  }

  async stop() {
    this.stopping = true;
    if (this.node) {
      await this.node.stop();
    }
  }

  async broadcast(topic: string, data: any) {
    if (this.stopping) return;
    const pubsub = (this.node.services as any).pubsub;
    if (!pubsub) return;

    const payload = new TextEncoder().encode(JSON.stringify(data));
    try {
      await pubsub.publish(topic, payload);
    } catch (err: any) {
      if (err.name === 'PublishError' && err.code === 'ERR_NO_PEERS_SUBSCRIBED_TO_TOPIC') {
        let retries = 0;
        const maxRetries = 5;
        while (retries < maxRetries) {
          await new Promise(r => setTimeout(r, 100 * Math.pow(2, retries)));
          try {
            await pubsub.publish(topic, payload);
            return;
          } catch (e: any) {
            retries++;
          }
        }
      }
    }
  }

  collectVotes(height: number, type: string, total: number): Promise<any[]> {
    const key = `${height}:${type}`;
    const target = Math.ceil((2 * total) / 3);

    return new Promise((resolve) => {
      let attempts = 0;
      const check = setInterval(() => {
        const collected = this.votes.get(key);
        if (collected && collected.size >= target) {
          clearInterval(check);
          console.log(`[P2P] Reached quorum for ${type} at height ${height}: ${collected.size}/${total}`);
          resolve(Array.from(collected.values()));
        } else if (++attempts > 20) {
          clearInterval(check);
          console.log(`[P2P] Timeout waiting for ${type} quorum at height ${height}. Found ${collected?.size || 0}/${total}`);
          resolve(collected ? Array.from(collected.values()) : []);
        }
      }, 500);
    });
  }

  setHead(h: number, hash: string) {
    this.headHeight = h;
    this.prevHash = hash;
    for (const key of this.votes.keys()) {
      const height = parseInt(key.split(':')[0]);
      if (height < h) {
        this.votes.delete(key);
      }
    }
    // Clean up old validated proposals
    for (const height of this.validatedProposals.keys()) {
      if (height <= h) {
        this.validatedProposals.delete(height);
      }
    }
  }

  getHeadHeight(): number {
    return this.headHeight;
  }

  getNetworkHeight(): number {
    return this.networkHeight;
  }

  getPrevHash(): string {
    return this.prevHash;
  }

  /**
   * Get a validated block proposal for a specific height, if available.
   * Returns undefined if no validated proposal exists for that height.
   */
  getValidatedProposal(height: number): Block | undefined {
    return this.validatedProposals.get(height);
  }

  getMultiaddrs(): string[] {
    const peerId = this.node.peerId.toString();
    return this.node.getMultiaddrs().map(ma => `${ma.toString()}/p2p/${peerId}`);
  }

  async requestBlockFromPeer(peerId: string, height: number): Promise<Block | undefined> {
    if (this.stopping) return undefined;
    console.log(`[P2P] Requesting block ${height} from ${peerId.slice(0, 8)}...`);
    try {
      const stream = await this.node.dialProtocol(peerIdFromString(peerId), '/barcus/sync/1.0.0') as any;

      // Send request
      const request = [new TextEncoder().encode(JSON.stringify({ height }))];
      const encoded = lp.encode(request);
      for await (const chunk of encoded) {
        stream.send(chunk.subarray());
      }

      // Read response
      const decodedSource = lp.decode(stream);
      for await (const msg of decodedSource) {
        const res = new TextDecoder().decode(msg.subarray());
        if (res) {
          return JSON.parse(res);
        }
        break;
      }
    } catch (err: any) {
      const ignoredErrors = ['StreamClosedError', 'StreamResetError', 'StreamStateError', 'InvalidStateError'];
      if (!ignoredErrors.includes(err.name)) {
        console.error(`[P2P] Error requesting block ${height} from ${peerId}:`, err);
      }
    }
    return undefined;
  }
}
