
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Consensus } from './consensus.js';
import { Block } from './types.js';

// Mock dependencies
const mockP2P = {
    broadcast: vi.fn(),
    collectVotes: vi.fn().mockResolvedValue([]),
    setHead: vi.fn(),
    getHeadHeight: vi.fn().mockReturnValue(0),
    getPrevHash: vi.fn().mockReturnValue('0x0'),
    getValidatedProposal: vi.fn(),
};

const mockState = {
    applyBlock: vi.fn().mockResolvedValue(true),
    getBalance: vi.fn().mockResolvedValue(0),
};

const mockMempool = {
    getTxs: vi.fn().mockReturnValue([]),
    take: vi.fn().mockResolvedValue([]),
    clear: vi.fn(),
};

describe('Consensus', () => {
    let consensus: Consensus;
    const validators = ['val1', 'val2', 'val3', 'val4'];
    const myAddress = 'val1';

    beforeEach(() => {
        vi.clearAllMocks();
        consensus = new Consensus(
            mockState as any,
            mockMempool as any,
            mockP2P as any,
            validators,
            myAddress
        );
    });

    it('should initialize correctly', () => {
        expect(consensus).toBeDefined();
    });

    it('should propose a block if it is the proposer', async () => {
        // Mock getProposer to return myAddress (val1) for height 1
        // Since getProposer is private/determined by height % validators.length
        // height 1 % 4 = 1 -> validators[1] which is val2. 
        // We need height such that validators[height % 4] == val1 (index 0).
        // height 4 -> 4 % 4 = 0.

        // Wait, index is 0. So height 0 would be val1. But we start at height 1.
        // Let's check logic: const proposer = this.validators[height % this.validators.length];

        // For height 4: 4 % 4 = 0 => val1.

        // We can't easily jump to height 4 in the loop without running it. 
        // But checking `step()` logic:

        const height = 4;
        await consensus['step'](height);

        expect(mockP2P.broadcast).toHaveBeenCalledWith('block:proposal', expect.objectContaining({
            header: expect.objectContaining({
                height: 4,
                proposer: myAddress
            })
        }));
    });

    it('should not propose if not proposer', async () => {
        const height = 1; // 1 % 4 = 1 => val2 is proposer
        await consensus['step'](height);
        expect(mockP2P.broadcast).not.toHaveBeenCalledWith('block:proposal', expect.anything());
    });
});
