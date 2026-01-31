import { Block } from './types.js';

export const GENESIS_BLOCK: Block = {
    header: {
        height: 0,
        prevHash: '0x' + '0'.repeat(64),
        txRoot: '0x' + '0'.repeat(64), // Empty tx root
        timestamp: 1735689600000, // 2025-01-01 00:00:00 UTC
        proposer: 'Barcus-Podo-Genesis',
    },
    txs: [],
    signature: 'genesis-signature',
};
