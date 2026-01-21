import { Block, Vote } from './types.js';
import { merkleRoot, hashBlock, hashTx } from './block.js';
import { State, applyTx } from './state.js';
import { Mempool } from './mempool.js';
import { P2P } from './p2p.js';
import { validateBlockProposal } from './validation.js';

export class Consensus {
  constructor(
    private state: State,
    private mempool: Mempool,
    private p2p: P2P,
    private validators: string[],
    private me: string
  ) { }

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
    // Only propose if I am the proposer for this height
    let block: Block;

    if (this.isProposer(height)) {
      block = await this.propose(height);

      // Validate block proposal before broadcasting (sanity check self)
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
      // If not proposer, wait for proposal? 
      // In this simple implementation, we might just need to verify we *received* a valid proposal from P2P 
      // via the message handler in P2P class which puts it in validatedProposals?
      // But here loop drives it.
      // For unit test purposes of "should not propose", I just need to restrict the broadcast.

      // However, the rest of the function continues to PREVOTE/PRECOMMIT.
      // We need the block hash to vote on.
      // If we didn't propose, we need to fetch the block from P2P (validatedProposals).

      // For now, let's just make the test pass by adding the check.
      // BUT, notice: `const blockHash = hashBlock(block);` uses `block`.
      // If we didn't propose, `block` is undefined.
      // We need to retrieve it.

      const maxRetries = 10;
      let retries = 0;
      while (retries < maxRetries) {
        const existing = this.p2p.getValidatedProposal(height);
        if (existing) {
          block = existing;
          break;
        }
        await new Promise(r => setTimeout(r, 100)); // wait for gossip
        retries++;
      }
      if (!block!) {
        // If we never got the block, we can't vote.
        // console.log(`[Consensus] No block proposal received for height ${height}`);
        return;
      }
    }

    const blockHash = hashBlock(block);

    const prevote: Vote = {
      height, round: 0, type: 'PREVOTE', blockHash,
      validator: this.me, signature: 'sig-prevote'
    };
    await this.p2p.broadcast('vote:prevote', prevote);

    const prevotes = await this.p2p.collectVotes(height, 'PREVOTE', this.validators.length);
    if (prevotes.length < Math.ceil((2 * this.validators.length) / 3)) return;

    const precommit: Vote = {
      height, round: 0, type: 'PRECOMMIT', blockHash,
      validator: this.me, signature: 'sig-precommit'
    };
    await this.p2p.broadcast('vote:precommit', precommit);

    const precommits = await this.p2p.collectVotes(height, 'PRECOMMIT', this.validators.length);
    if (precommits.length < Math.ceil((2 * this.validators.length) / 3)) return;

    for (const tx of block.txs) {
      try { await applyTx(this.state, tx); } catch (e) { /* log */ }
    }
    await this.state.commitBlock(block);
    this.p2p.setHead(height, blockHash);
  }

  async run() {
    let height = Number(await this.p2p.getHeadHeight());
    while (true) {
      height += 1;
      await this.step(height);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
