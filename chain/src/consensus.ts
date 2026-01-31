import { Block, Vote } from './types.js';
import { merkleRoot, hashBlock } from './block.js';
import { State, applyTx } from './state.js';
import { Mempool } from './mempool.js';
import { P2P } from './p2p.js';

export class Consensus {
  constructor(
    private state: State,
    private mempool: Mempool,
    private p2p: P2P,
    private validators: string[],
    private me: string
  ) {}

  async propose(height: number): Promise<Block> {
    const txs = await this.mempool.take(100);
    const header = {
      height,
      prevHash: await this.p2p.getPrevHash(),
      txRoot: merkleRoot(txs.map(t => JSON.stringify(t))),
      timestamp: Date.now(),
      proposer: this.me,
    };
    return { header, txs, signature: 'sig-placeholder' };
  }

  async run() {
    let height = Number(await this.p2p.getHeadHeight());
    while (true) {
      height += 1;

      const block = await this.propose(height);
      const blockHash = hashBlock(block);
      await this.p2p.broadcast('block:proposal', block);

      const prevote: Vote = {
        height, round: 0, type: 'PREVOTE', blockHash,
        validator: this.me, signature: 'sig-prevote'
      };
      await this.p2p.broadcast('vote:prevote', prevote);

      const prevotes = await this.p2p.collectVotes(height, 'PREVOTE', this.validators.length);
      if (prevotes.length < Math.ceil((2 * this.validators.length) / 3)) continue;

      const precommit: Vote = {
        height, round: 0, type: 'PRECOMMIT', blockHash,
        validator: this.me, signature: 'sig-precommit'
      };
      await this.p2p.broadcast('vote:precommit', precommit);

      const precommits = await this.p2p.collectVotes(height, 'PRECOMMIT', this.validators.length);
      if (precommits.length < Math.ceil((2 * this.validators.length) / 3)) continue;

      for (const tx of block.txs) {
        try { await applyTx(this.state, tx); } catch (e) { /* log */ }
      }
      await this.state.commitBlock(block);
      this.p2p.setHead(height, blockHash);

      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
