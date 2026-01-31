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
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from "@libp2p/crypto/keys";
import { peerIdFromPrivateKey } from "@libp2p/peer-id";
import fs from "fs";
import path from "path";

const getLocalTs = () => {
  const d = new Date();
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0") + " " +
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0") + ":" +
    String(d.getSeconds()).padStart(2, "0");
};

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
  private maxFinalizedHeight = 0;
  private stopping = false;

  private async loadOrCreatePeerId(dataDir: string) {
    const keyPath = path.join(dataDir, "identity.key");
    if (fs.existsSync(keyPath)) {
      const encoded = fs.readFileSync(keyPath);
      const privKey = await privateKeyFromProtobuf(encoded);
      return peerIdFromPrivateKey(privKey);
    }

    // Generate new key
    console.log(`${getLocalTs()} 🔑 Generating new node identity...`);
    const privKey = await generateKeyPair("Ed25519");
    const encoded = privateKeyToProtobuf(privKey);

    // Ensure dir exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(keyPath, encoded);
    // Set restricted permissions
    try {
      fs.chmodSync(keyPath, 0o600);
    } catch (err) { }

    return peerIdFromPrivateKey(privKey);
  }

  async start(port: number, bootstrapPeers: string[] = [], state?: State, options: { enableMdns?: boolean, dataDir?: string } = {}) {
    const { enableMdns = true, dataDir = "./data" } = options;

    const id = await this.loadOrCreatePeerId(dataDir);
    console.log(`${getLocalTs()} 🆔 Node PeerID: ${id.toString()}`);

    this.state = state;
    if (this.state) {
      this.headHeight = await this.state.getHead();
      const lastBlock = await this.state.getBlock(this.headHeight);
      if (lastBlock) {
        this.prevHash = hashBlock(lastBlock);
        console.log(`${getLocalTs()} 💾 Resuming from height #${this.headHeight} (${this.prevHash.slice(0, 10)}…)`);
      }
    }

    this.node = await createLibp2p({
      peerId: id,
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
    await pubsub.subscribe("network:status");
    console.log(`${getLocalTs()} ✨ Subscribed to consensus & status topics`);

    pubsub.addEventListener('message', (evt: any) => {
      const { topic, data, from } = evt.detail;
      const peerId = from.toString();
      try {
        const decoded = JSON.parse(new TextDecoder().decode(data));
        let height = decoded.height;
        if (topic === 'block:proposal' && decoded.header) {
          height = decoded.header.height;
        } else if (topic === 'network:status') {
          height = decoded.height;
          if (height > this.maxFinalizedHeight) {
            this.maxFinalizedHeight = height;
          }
        }

        if (height && height > this.networkHeight) {
          this.networkHeight = height;
        }

        if (topic === 'block:proposal' && decoded.header) {
          // Validate block proposal
          try {
            const expectedHeight = this.headHeight + 1;
            validateBlockProposal(decoded, expectedHeight, this.prevHash);
            this.validatedProposals.set(height, decoded);
          } catch (validationErr) {
            if (validationErr instanceof ValidationError) {
              console.warn(`${getLocalTs()} ⚠️  Invalid block proposal from ${peerId.slice(0, 8)} at height ${height}: ${validationErr.message}`);
            }
            return;
          }
        }

        if (['block:proposal', 'vote:prevote', 'vote:precommit'].includes(topic)) {
          if (topic.startsWith('vote:')) {
            const key = `${decoded.height}:${decoded.type}`;
            if (!this.votes.has(key)) this.votes.set(key, new Map());
            this.votes.get(key)!.set(decoded.validator, decoded);
          }
        }
      } catch (err) { }
    });

    // Manual initial dial for bootstrap peers
    if (bootstrapPeers.length > 0) {
      for (const peerAddr of bootstrapPeers) {
        try {
          await this.node.dial(multiaddr(peerAddr));
          console.log(`${getLocalTs()} 🏷  Explicitly dialed bootstrap peer: ${peerAddr}`);
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
      } catch (err: any) { }
    });

    console.log(`${getLocalTs()} 🏷  Local node identity is: ${this.node.peerId.toString()}`);
    console.log(`${getLocalTs()} 🏁 Running libp2p network backend`);

    setInterval(() => {
      this.broadcast('network:status', { height: this.headHeight }).catch(() => { });
    }, 5000);
  }

  async stop() {
    this.stopping = true;
    if (this.node) await this.node.stop();
  }

  getNetworkHeight() { return this.networkHeight; }
  getMaxFinalizedHeight() { return this.maxFinalizedHeight; }
  getHeadHeight() { return this.headHeight; }
  getPrevHash() { return this.prevHash; }

  async broadcast(topic: string, data: any) {
    if (this.stopping) return;

    try {
      let height = data.height;
      if (topic === 'block:proposal' && data.header) {
        height = data.header.height;
        this.validatedProposals.set(height, data);
      } else if (topic.startsWith('vote:')) {
        const key = `${data.height}:${data.type}`;
        if (!this.votes.has(key)) this.votes.set(key, new Map());
        this.votes.get(key)!.set(data.validator, data);
      }
    } catch (err) { }

    const pubsub = (this.node.services as any).pubsub;
    if (!pubsub) return;

    const payload = new TextEncoder().encode(JSON.stringify(data));
    try {
      await pubsub.publish(topic, payload);
    } catch (err: any) {
      if (err.name === 'PublishError' && err.code === 'ERR_NO_PEERS_SUBSCRIBED_TO_TOPIC') {
        let retries = 0;
        while (retries < 5) {
          await new Promise(r => setTimeout(r, 100 * Math.pow(2, retries)));
          try {
            await pubsub.publish(topic, payload);
            return;
          } catch (e: any) { retries++; }
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
          resolve(Array.from(collected.values()));
        } else if (++attempts > 20) {
          clearInterval(check);
          resolve(collected ? Array.from(collected.values()) : []);
        }
      }, 500);
    });
  }

  setHead(height: number, hash: string) {
    this.headHeight = height;
    this.prevHash = hash;
    for (const key of this.votes.keys()) {
      if (parseInt(key.split(':')[0]) < height) this.votes.delete(key);
    }
    for (const h of this.validatedProposals.keys()) {
      if (h <= height) this.validatedProposals.delete(h);
    }
  }

  getValidatedProposal(height: number): Block | undefined {
    return this.validatedProposals.get(height);
  }

  async requestBlockFromPeer(peerId: string, height: number): Promise<Block | undefined> {
    if (this.stopping) return undefined;
    try {
      const stream = await this.node.dialProtocol(peerIdFromString(peerId), '/barcus/sync/1.0.0') as any;
      const encoded = lp.encode([new TextEncoder().encode(JSON.stringify({ height }))]);
      for await (const chunk of encoded) stream.send(chunk.subarray());
      const decodedSource = lp.decode(stream);
      for await (const msg of decodedSource) {
        const res = new TextDecoder().decode(msg.subarray());
        if (res) return JSON.parse(res);
        break;
      }
    } catch (err: any) { }
    return undefined;
  }

  getMultiaddrs(): string[] {
    const peerId = this.node.peerId.toString();
    return this.node.getMultiaddrs().map(ma => `${ma.toString()}/p2p/${peerId}`);
  }
}
