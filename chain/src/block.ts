import crypto from 'crypto';
import { Block, Tx } from './types.js';

export function hashTx(tx: Tx): string {
  const h = crypto.createHash('sha256');
  h.update(tx.from + tx.nonce + tx.type + JSON.stringify(tx.payload));
  return '0x' + h.digest('hex');
}

export function merkleRoot(hashes: string[]): string {
  if (hashes.length === 0) return '0x' + '0'.repeat(64);
  let layer = hashes.slice();
  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const a = layer[i];
      const b = layer[i + 1] ?? layer[i];
      const h = crypto.createHash('sha256');
      h.update(a + b);
      next.push('0x' + h.digest('hex'));
    }
    layer = next;
  }
  return layer[0];
}

export function hashBlock(b: Block): string {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify(b.header));
  h.update(JSON.stringify(b.txs.map(tx => hashTx(tx))));
  return '0x' + h.digest('hex');
}
