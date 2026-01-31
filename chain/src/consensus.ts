import { Block, Vote } from './types.js';
import { merkleRoot, hashBlock, hashTx } from './block.js';
import { State, applyTx } from './state.js';
import { Mempool } from './mempool.js';
import { P2P } from './p2p.js';
import { validateBlockProposal } from './validation.js';

const getLocalTs = () => {
  const d = new Date();
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0") + " " +
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0") + ":" +
    String(d.getSeconds()).padStart(2, "0");
};

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
    const proposerIndex = height % this.validators.length;
    const proposer = this.validators[proposerIndex];

    if (this.isProposer(height)) {
      console.log(`${getLocalTs()} [Consensus] ✨ Prepared block for height #${height}`);
      block = await this.propose(height);

      const expectedHeight = height;
      const expectedPrevHash = await this.p2p.getPrevHash();
      try {
        validateBlockProposal(block, expectedHeight, expectedPrevHash);
      } catch (err) {
        console.error(`${getLocalTs()} ⚠️  Invalid block proposal at height #${height}:`, err);
        return;
      }

      await this.p2p.broadcast('block:proposal', block);
    } else {
      const maxRetries = 50; // Wait up to 5s for the proposal
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
    if (!this.running) return;

    if (prevotes.length < Math.ceil((2 * this.validators.length) / 3)) {
      console.log(`${getLocalTs()} [Consensus] 🗳  Collecting prevotes for #${height}... (${prevotes.length}/${this.validators.length})`);
      return;
    }

    const precommit: Vote = {
      height, round: 0, type: 'PRECOMMIT', blockHash,
      validator: this.me, signature: 'sig-precommit'
    };
    await this.p2p.broadcast('vote:precommit', precommit);

    const precommits = await this.p2p.collectVotes(height, 'PRECOMMIT', this.validators.length);
    if (!this.running) return;

    if (precommits.length < Math.ceil((2 * this.validators.length) / 3)) {
      console.log(`${getLocalTs()} [Consensus] 🗳  Collecting precommits for #${height}... (${precommits.length}/${this.validators.length})`);
      return;
    }

    for (const tx of block.txs) {
      if (!this.running) break;
      try {
        await applyTx(this.state, tx);
      } catch (e: any) {
        console.error(`${getLocalTs()} ⚠️  Failed to apply transaction: ${e.message}`);
      }
    }
    if (!this.running) return;

    const hash = hashBlock(block);
    await this.state.commitBlock(block);
    this.p2p.setHead(height, hash);
    console.log(`${getLocalTs()} [Consensus] 🔨 Imported #${height} (${hash.slice(0, 10)}…)`);
  }

  async sync(targetHeight: number) {
    let currentHeight = await this.state.getHead();
    if (currentHeight >= targetHeight) return;

    console.log(`${getLocalTs()} [Consensus] ⏩ Syncing from #${currentHeight} to #${targetHeight}...`);

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
            try { await applyTx(this.state, tx); } catch (e) { }
          }
          if (!this.running) break;
          await this.state.commitBlock(block);
          const blockHash = hashBlock(block);
          this.p2p.setHead(h, blockHash);
          console.log(`${getLocalTs()} [Consensus] ⏩ Syncing block #${h} (${blockHash.slice(0, 10)}…)`);
        } catch (err) {
          console.error(`${getLocalTs()} ⚠️  Failed to validate synced block #${h}`);
          break;
        }
      } else {
        break;
      }
    }
  }

  async run() {
    this.running = true;
    let iterations = 0;

    while (this.running) {
      const headHeight = await this.state.getHead();
      const networkHeight = this.p2p.getNetworkHeight();
      const maxFinalizedHeight = this.p2p.getMaxFinalizedHeight();

      // Periodic status log (every ~5s)
      if (iterations % 5 === 0) {
        const lastBlock = await this.state.getBlock(headHeight);
        const hash = lastBlock ? hashBlock(lastBlock).slice(0, 10) : '0x0000';
        const isSyncing = (headHeight > 0 && maxFinalizedHeight > headHeight) ||
          (headHeight === 0 && maxFinalizedHeight > 0);
        const status = isSyncing ? '⏩ Syncing' : '💤 Idle';
        const peerCount = this.p2p.node.getPeers().length;

        console.log(`${getLocalTs()} ${status} (${peerCount} peers), best: #${headHeight} (${hash}…), finalized #${headHeight} (${hash}…)`);
      }

      // Sync logic: only sync if someone is strictly ahead of our next expected block OR confirmed finalized height is ahead.
      if (maxFinalizedHeight > headHeight || networkHeight > headHeight + 1) {
        await this.sync(Math.max(networkHeight, maxFinalizedHeight));
      }

      const nextHeight = (await this.state.getHead()) + 1;
      await this.step(nextHeight);

      if (!this.running) break;
      await new Promise(r => setTimeout(r, 1000));
      iterations++;
    }
  }
}
