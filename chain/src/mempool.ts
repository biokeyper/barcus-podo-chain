import { Tx } from './types.js';

export class Mempool {
  private buf: Tx[] = [];
  async add(tx: Tx) { this.buf.push(tx); }
  async take(n: number): Promise<Tx[]> {
    const out = this.buf.slice(0, n);
    this.buf = this.buf.slice(n);
    return out;
  }
}
