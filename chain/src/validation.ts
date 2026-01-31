import { Block } from './types.js';
import { hashBlock, merkleRoot, hashTx } from './block.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates a block proposal for structure, height, and previous hash.
 * @param block - The block proposal to validate
 * @param expectedHeight - The expected height for this block
 * @param expectedPrevHash - The expected previous hash (hash of current head block)
 * @throws ValidationError if validation fails
 */
export function validateBlockProposal(
  block: any,
  expectedHeight: number,
  expectedPrevHash: string
): asserts block is Block {
  // 1. Structure validation
  if (!block || typeof block !== 'object') {
    throw new ValidationError('Block proposal is not an object');
  }

  if (!block.header || typeof block.header !== 'object') {
    throw new ValidationError('Block proposal missing header');
  }

  const { header } = block;

  // Validate header fields
  if (typeof header.height !== 'number' || header.height < 0 || !Number.isInteger(header.height)) {
    throw new ValidationError(`Invalid header.height: expected non-negative integer, got ${header.height}`);
  }

  if (typeof header.prevHash !== 'string' || !header.prevHash) {
    throw new ValidationError(`Invalid header.prevHash: expected non-empty string, got ${typeof header.prevHash}`);
  }

  if (typeof header.txRoot !== 'string' || !header.txRoot) {
    throw new ValidationError(`Invalid header.txRoot: expected non-empty string, got ${typeof header.txRoot}`);
  }

  if (typeof header.timestamp !== 'number' || header.timestamp <= 0) {
    throw new ValidationError(`Invalid header.timestamp: expected positive number, got ${header.timestamp}`);
  }

  if (typeof header.proposer !== 'string' || !header.proposer) {
    throw new ValidationError(`Invalid header.proposer: expected non-empty string, got ${typeof header.proposer}`);
  }

  // Validate transactions array
  if (!Array.isArray(block.txs)) {
    throw new ValidationError('Block proposal missing or invalid txs array');
  }

  // Validate signature
  if (typeof block.signature !== 'string') {
    throw new ValidationError(`Invalid block.signature: expected string, got ${typeof block.signature}`);
  }

  // 2. Height validation
  if (header.height !== expectedHeight) {
    throw new ValidationError(
      `Height mismatch: expected ${expectedHeight}, got ${header.height}`
    );
  }

  // 3. Previous hash validation
  if (header.prevHash !== expectedPrevHash) {
    throw new ValidationError(
      `Previous hash mismatch: expected ${expectedPrevHash}, got ${header.prevHash}`
    );
  }

  // 4. Transaction root validation (verify it matches computed root)
  const computedTxRoot = merkleRoot(block.txs.map((tx: any) => {
    try {
      return hashTx(tx);
    } catch (err) {
      throw new ValidationError(`Invalid transaction in block: ${err}`);
    }
  }));

  if (header.txRoot !== computedTxRoot) {
    throw new ValidationError(
      `Transaction root mismatch: expected ${computedTxRoot}, got ${header.txRoot}`
    );
  }
}
