// chain/src/state.ts
import { Level } from "level";
import { Tx, Block } from "./types.js";
import { hashTx } from "./block.js";

export class State {
  private db: Level<string, string>;

  constructor(path: string) {
    this.db = new Level<string, string>(path, { valueEncoding: "utf8" });
  }

  async initialize(genesisBlock: Block) {
    try {
      await this.db.get("head");
    } catch {
      // Database is empty, set up genesis
      await this.commitBlock(genesisBlock);
      // Give initial balances to validators for testing visibility
      const validators = ['val1', 'val2', 'val3', 'val4'];
      for (const val of validators) {
        await this.setBalance(val, 1000000);
      }
    }
  }

  async getBalance(addr: string): Promise<number> {
    try {
      return Number(await this.db.get(`bal:${addr}`));
    } catch {
      return 0;
    }
  }

  async setBalance(addr: string, amt: number) {
    await this.db.put(`bal:${addr}`, String(amt));
  }

  async getNonce(addr: string): Promise<number> {
    try {
      return Number(await this.db.get(`nonce:${addr}`));
    } catch {
      return 0;
    }
  }

  async incNonce(addr: string) {
    const n = await this.getNonce(addr);
    await this.db.put(`nonce:${addr}`, String(n + 1));
  }

  async addDataset(owner: string, datasetId: string, root: string, sizeGiB: number, collateral: number) {
    const key = `ds:${datasetId}`;
    const obj = { owner, root, sizeGiB, collateral, minted: false };
    await this.db.put(key, JSON.stringify(obj));
  }

  async markMinted(datasetId: string) {
    const v = await this.db.get(`ds:${datasetId}`);
    const obj = JSON.parse(v);
    obj.minted = true;
    await this.db.put(`ds:${datasetId}`, JSON.stringify(obj));
  }

  async commitBlock(block: Block) {
    await this.db.put(`blk:${block.header.height}`, JSON.stringify(block));
    await this.db.put("head", String(block.header.height));
  }

  async getBlock(height: number): Promise<Block | undefined> {
    try {
      const v = await this.db.get(`blk:${height}`);
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  }

  async getHead(): Promise<number> {
    try {
      return Number(await this.db.get("head"));
    } catch {
      return 0;
    }
  }
}

export async function applyTx(s: State, tx: Tx): Promise<void> {
  switch (tx.type) {
    case "TRANSFER": {
      const { to, amount } = tx.payload;
      const fb = await s.getBalance(tx.from);
      if (fb < amount) throw new Error("insufficient balance");
      await s.setBalance(tx.from, fb - amount);
      const tb = await s.getBalance(to);
      await s.setBalance(to, tb + amount);
      await s.incNonce(tx.from);
      break;
    }
    case "DATA_REGISTER": {
      const { commitmentRoot, sizeGiB, salt, collateral } = tx.payload;
      const id = hashTx(tx);
      const fb = await s.getBalance(tx.from);
      if (fb < collateral) throw new Error("insufficient collateral");
      await s.setBalance(tx.from, fb - collateral);
      await s.addDataset(tx.from, id, commitmentRoot, sizeGiB, collateral);
      await s.incNonce(tx.from);
      break;
    }
    case "MINT": {
      const { datasetId } = tx.payload;
      await s.markMinted(datasetId);
      await s.incNonce(tx.from);
      break;
    }
    default:
      throw new Error("unknown tx type");
  }
}
