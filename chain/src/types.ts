export type Hash = string;

export interface Tx {
  from: string;
  nonce: number;
  type: 'TRANSFER' | 'DATA_REGISTER' | 'MINT';
  payload: any;
  signature: string;
}

export interface BlockHeader {
  height: number;
  prevHash: Hash;
  txRoot: Hash;
  timestamp: number;
  proposer: string;
}

export interface Block {
  header: BlockHeader;
  txs: Tx[];
  signature: string;
}

export interface Vote {
  height: number;
  round: number;
  type: 'PREVOTE' | 'PRECOMMIT';
  blockHash: Hash;
  validator: string;
  signature: string;
}
