import { Block, Vote } from './types.js';
import { merkleRoot, hashBlock, hashTx } from './block.js';
import { State, applyTx } from './state.js';
import { Mempool } from './mempool.js';
import { P2P } from './p2p.js';
import { validateBlockProposal } from './validation.js';

export class Consensus {
  private running = false;

  constructor(
    private state: State,
    private mempool: Mempool,
    private p2p: P2P,
    private validators: string[],
    private me: string
  ) {
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  async propose(height: number): Promise<Block> {
    const txs = await this.mempool.take(100);
    const header = {
      height,
      prevHash: await this.p2p.getPrevHash(),
      txRoot: merkleRoot(txs.map(tx => hashTx(tx))),
      timestamp: Date.now(),
      proposer: this.me,
    };
    return { header, txs, signature: 'sig-placeholder' };
  }

  isProposer(height: number): boolean {
    const proposerIndex = height % this.validators.length;
    return this.validators[proposerIndex] === this.me;
  }

  async step(height: number) {
    let block: Block;

    if (this.isProposer(height)) {
      block = await this.propose(height);

      const expectedHeight = height;
      const expectedPrevHash = await this.p2p.getPrevHash();
      try {
        validateBlockProposal(block, expectedHeight, expectedPrevHash);
      } catch (err) {
        console.error(`[Consensus] Invalid block proposal at height ${height}:`, err);
        return;
      }

      await this.p2p.broadcast('block:proposal', block);
    } else {
      const maxRetries = 10;
      let retries = 0;
      while (retries < maxRetries && this.running) {
        const existing = this.p2p.getValidatedProposal(height);
        if (existing) {
          block = existing;
          break;
        }
        await new Promise(r => setTimeout(r, 100));
        retries++;
      }
      if (!block!) return;
    }

    if (!this.running) return;

    const blockHash = hashBlock(block);

    const prevote: Vote = {
      height, round: 0, type: 'PREVOTE', blockHash,
      validator: this.me, signature: 'sig-prevote'
    };
    await this.p2p.broadcast('vote:prevote', prevote);

    const prevotes = await this.p2p.collectVotes(height, 'PREVOTE', this.validators.length);
    if (!this.running || prevotes.length < Math.ceil((2 * this.validators.length) / 3)) return;

    const precommit: Vote = {
      height, round: 0, type: 'PRECOMMIT', blockHash,
      validator: this.me, signature: 'sig-precommit'
    };
    await this.p2p.broadcast('vote:precommit', precommit);

    const precommits = await this.p2p.collectVotes(height, 'PRECOMMIT', this.validators.length);
    if (!this.running || precommits.length < Math.ceil((2 * this.validators.length) / 3)) return;

    for (const tx of block.txs) {
      if (!this.running) break;
      try { await applyTx(this.state, tx); } catch (e) { /* log */ }
    }
    if (!this.running) return;

    await this.state.commitBlock(block);
    this.p2p.setHead(height, blockHash);
  }

  async sync(targetHeight: number) {
    let currentHeight = Number(await this.p2p.getHeadHeight());
    if (currentHeight >= targetHeight) return;

    console.log(`[Consensus] Synchronizing from height ${currentHeight} to ${targetHeight}...`);

    for (let h = currentHeight + 1; h <= targetHeight; h++) {
      if (!this.running) break;
      let block: Block | undefined;
      const peers = this.p2p.node.getPeers();

      for (const peerId of peers) {
        if (!this.running) break;
        block = await this.p2p.requestBlockFromPeer(peerId.toString(), h);
        if (block) break;
      }

      if (block) {
        const prevHash = await this.p2p.getPrevHash();
        try {
          validateBlockProposal(block, h, prevHash);
          for (const tx of block.txs) {
            if (!this.running) break;
            try { await applyTx(this.state, tx); } catch (e) { /* log */ }
          }
          if (!this.running) break;
          await this.state.commitBlock(block);
          const blockHash = hashBlock(block);
          this.p2p.setHead(h, blockHash);
          console.log(`[Consensus] Synchronized block #${h} (${blockHash.slice(0, 10)}...)`);
        } catch (err) {
          console.error(`[Consensus] Failed to validate synced block #${h}:`, err);
          break;
        }
      } else {
        console.warn(`[Consensus] Could not find block #${h} from any peer`);
        break;
      }
    }
  }

  async run() {
    this.running = true;
    while (this.running) {
      const networkHeight = this.p2p.getNetworkHeight();
      const currentHeight = this.p2p.getHeadHeight();
      const peerCount = this.p2p.node.getPeers().length;

      if (networkHeight > currentHeight) {
        console.log(`[Consensus] Network height (${networkHeight}) is ahead of local height (${currentHeight}). Peers: ${peerCount}. Starting sync...`);
        await this.sync(networkHeight);
      }

      const nextHeight = this.p2p.getHeadHeight() + 1;
      // console.log(`[Consensus] Running consensus step for height ${nextHeight}...`);
      await this.step(nextHeight);

      if (!this.running) break;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
