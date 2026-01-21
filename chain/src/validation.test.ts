import { describe, it, expect } from 'vitest';
import { validateBlockProposal, ValidationError } from './validation.js';
import { Block } from './types.js';
import { merkleRoot, hashTx } from './block.js';

describe('Block Proposal Validation', () => {
  const createValidBlock = (height: number, prevHash: string): Block => {
    const txs = [
      {
        from: 'addr1',
        nonce: 0,
        type: 'TRANSFER' as const,
        payload: { to: 'addr2', amount: 100 },
        signature: 'sig1'
      }
    ];
    const txRoot = merkleRoot(txs.map(tx => hashTx(tx)));
    
    return {
      header: {
        height,
        prevHash,
        txRoot,
        timestamp: Date.now(),
        proposer: 'validator1'
      },
      txs,
      signature: 'block-sig'
    };
  };

  describe('Structure Validation', () => {
    it('should accept valid block proposal', () => {
      const block = createValidBlock(1, '0x' + '0'.repeat(64));
      expect(() => validateBlockProposal(block, 1, '0x' + '0'.repeat(64))).not.toThrow();
    });

    it('should reject non-object block', () => {
      expect(() => validateBlockProposal(null, 1, '0x' + '0'.repeat(64))).toThrow(ValidationError);
      expect(() => validateBlockProposal(undefined, 1, '0x' + '0'.repeat(64))).toThrow(ValidationError);
      expect(() => validateBlockProposal('string', 1, '0x' + '0'.repeat(64))).toThrow(ValidationError);
    });

    it('should reject block without header', () => {
      const block = { txs: [], signature: 'sig' } as any;
      expect(() => validateBlockProposal(block, 1, '0x' + '0'.repeat(64))).toThrow(ValidationError);
    });

    it('should reject block with invalid height type', () => {
      const block = createValidBlock(1, '0x' + '0'.repeat(64));
      (block.header as any).height = '1';
      expect(() => validateBlockProposal(block, 1, '0x' + '0'.repeat(64))).toThrow(ValidationError);
    });

    it('should reject block with negative height', () => {
      const block = createValidBlock(-1, '0x' + '0'.repeat(64));
      expect(() => validateBlockProposal(block, -1, '0x' + '0'.repeat(64))).toThrow(ValidationError);
    });

    it('should reject block with non-integer height', () => {
      const block = createValidBlock(1.5, '0x' + '0'.repeat(64));
      expect(() => validateBlockProposal(block, 1, '0x' + '0'.repeat(64))).toThrow(ValidationError);
    });

    it('should reject block with missing prevHash', () => {
      const block = createValidBlock(1, '0x' + '0'.repeat(64));
      delete (block.header as any).prevHash;
      expect(() => validateBlockProposal(block, 1, '0x' + '0'.repeat(64))).toThrow(ValidationError);
    });

    it('should reject block with empty prevHash', () => {
      const block = createValidBlock(1, '');
      expect(() => validateBlockProposal(block, 1, '0x' + '0'.repeat(64))).toThrow(ValidationError);
    });

    it('should reject block with missing txRoot', () => {
      const block = createValidBlock(1, '0x' + '0'.repeat(64));
      delete (block.header as any).txRoot;
      expect(() => validateBlockProposal(block, 1, '0x' + '0'.repeat(64))).toThrow(ValidationError);
    });

    it('should reject block with invalid timestamp', () => {
      const block = createValidBlock(1, '0x' + '0'.repeat(64));
      (block.header as any).timestamp = -1;
      expect(() => validateBlockProposal(block, 1, '0x' + '0'.repeat(64))).toThrow(ValidationError);
      
      (block.header as any).timestamp = 0;
      expect(() => validateBlockProposal(block, 1, '0x' + '0'.repeat(64))).toThrow(ValidationError);
    });

    it('should reject block with missing proposer', () => {
      const block = createValidBlock(1, '0x' + '0'.repeat(64));
      delete (block.header as any).proposer;
      expect(() => validateBlockProposal(block, 1, '0x' + '0'.repeat(64))).toThrow(ValidationError);
    });

    it('should reject block without txs array', () => {
      const block = createValidBlock(1, '0x' + '0'.repeat(64));
      (block as any).txs = null;
      expect(() => validateBlockProposal(block, 1, '0x' + '0'.repeat(64))).toThrow(ValidationError);
    });

    it('should reject block without signature', () => {
      const block = createValidBlock(1, '0x' + '0'.repeat(64));
      delete (block as any).signature;
      expect(() => validateBlockProposal(block, 1, '0x' + '0'.repeat(64))).toThrow(ValidationError);
    });
  });

  describe('Height Validation', () => {
    it('should accept block with correct height', () => {
      const block = createValidBlock(5, '0x' + '0'.repeat(64));
      expect(() => validateBlockProposal(block, 5, '0x' + '0'.repeat(64))).not.toThrow();
    });

    it('should reject block with incorrect height', () => {
      const block = createValidBlock(5, '0x' + '0'.repeat(64));
      expect(() => validateBlockProposal(block, 4, '0x' + '0'.repeat(64))).toThrow(ValidationError);
      expect(() => validateBlockProposal(block, 6, '0x' + '0'.repeat(64))).toThrow(ValidationError);
    });
  });

  describe('Previous Hash Validation', () => {
    const prevHash1 = '0x' + '1'.repeat(64);
    const prevHash2 = '0x' + '2'.repeat(64);

    it('should accept block with correct previous hash', () => {
      const block = createValidBlock(1, prevHash1);
      expect(() => validateBlockProposal(block, 1, prevHash1)).not.toThrow();
    });

    it('should reject block with incorrect previous hash', () => {
      const block = createValidBlock(1, prevHash1);
      expect(() => validateBlockProposal(block, 1, prevHash2)).toThrow(ValidationError);
    });
  });

  describe('Transaction Root Validation', () => {
    it('should accept block with correct transaction root', () => {
      const block = createValidBlock(1, '0x' + '0'.repeat(64));
      expect(() => validateBlockProposal(block, 1, '0x' + '0'.repeat(64))).not.toThrow();
    });

    it('should reject block with incorrect transaction root', () => {
      const block = createValidBlock(1, '0x' + '0'.repeat(64));
      block.header.txRoot = '0x' + 'f'.repeat(64);
      expect(() => validateBlockProposal(block, 1, '0x' + '0'.repeat(64))).toThrow(ValidationError);
    });

    it('should accept block with empty transactions', () => {
      const block = createValidBlock(1, '0x' + '0'.repeat(64));
      block.txs = [];
      block.header.txRoot = merkleRoot([]);
      expect(() => validateBlockProposal(block, 1, '0x' + '0'.repeat(64))).not.toThrow();
    });
  });
});
