import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { P2P } from './p2p.js';
import { State } from './state.js';
import { Consensus } from './consensus.js';
import { Block, BlockHeader } from './types.js';
import { hashBlock } from './block.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { Mempool } from './mempool.js';

describe('Consensus Synchronization Integration', () => {
    let node1: P2P;
    let node2: P2P;
    let state1: State;
    let state2: State;
    let mempool1: Mempool;
    let mempool2: Mempool;
    let consensus1: Consensus;
    let consensus2: Consensus;
    let dbPath1: string;
    let dbPath2: string;

    beforeEach(async () => {
        dbPath1 = fs.mkdtempSync(path.join(os.tmpdir(), 'node1-db-'));
        dbPath2 = fs.mkdtempSync(path.join(os.tmpdir(), 'node2-db-'));

        state1 = new State(dbPath1);
        state2 = new State(dbPath2);

        mempool1 = new Mempool();
        mempool2 = new Mempool();

        node1 = new P2P();
        node2 = new P2P();

        consensus1 = new Consensus(state1, mempool1, node1, ['node1', 'node2'], 'node1');
        consensus2 = new Consensus(state2, mempool2, node2, ['node1', 'node2'], 'node2');

        await node1.start(7201, [], state1, { enableMdns: false });
        // node2 will bootstrap from node1
        await node2.start(7202, node1.getMultiaddrs(), state2, { enableMdns: false });

        // Wait for connection
        let connected = false;
        for (let i = 0; i < 20; i++) {
            if (node1.node.getPeers().length > 0) {
                connected = true;
                break;
            }
            await new Promise(r => setTimeout(r, 200));
        }
        if (!connected) throw new Error("Nodes failed to connect for test");
    });

    afterEach(async () => {
        if (consensus1) consensus1.stop();
        if (consensus2) consensus2.stop();
        if (node1) await node1.stop();
        if (node2) await node2.stop();
        if (dbPath1) fs.rmSync(dbPath1, { recursive: true, force: true });
        if (dbPath2) fs.rmSync(dbPath2, { recursive: true, force: true });
    });

    it('should allow node2 to sync up to node1 height', async () => {
        // 1. Setup node1 with some blocks
        const emptyTxRoot = '0x' + '0'.repeat(64);
        const block1: Block = {
            header: {
                height: 1,
                prevHash: '0x' + '0'.repeat(64),
                txRoot: emptyTxRoot,
                timestamp: Date.now(),
                proposer: 'node1'
            },
            txs: [],
            signature: '0x'
        };
        await state1.commitBlock(block1);
        const hash1 = hashBlock(block1);
        node1.setHead(1, hash1);

        const block2: Block = {
            header: {
                height: 2,
                prevHash: hash1,
                txRoot: emptyTxRoot,
                timestamp: Date.now(),
                proposer: 'node1'
            },
            txs: [],
            signature: '0x'
        };
        // node2 should NOT have this block
        await state1.commitBlock(block2);
        const hash2 = hashBlock(block2);
        node1.setHead(2, hash2);

        expect(Number(node1.getHeadHeight())).toBe(2);
        expect(Number(node2.getHeadHeight())).toBe(0);

        // 2. Mock network height in node2 so it knows it's behind
        // node1 should be broadcasting its height via pubsub, but we can also check getNetworkHeight
        // node2's getNetworkHeight should return 2 if it heard node1's gossip

        // Wait for height gossip or manually set it for the test
        // node1.broadcastHead(2, hash2); // Already done in setHead normally? No, setHead is local.

        // Let's manually trigger sync in consensus2
        console.log(`[Test] Manually triggering sync on node 2 to height 2`);
        await consensus2.sync(2);

        expect(Number(node2.getHeadHeight())).toBe(2);
        const retrievedBlock1 = await state2.getBlock(1);
        const retrievedBlock2 = await state2.getBlock(2);

        expect(retrievedBlock1).toBeDefined();
        expect(retrievedBlock2).toBeDefined();
        expect(hashBlock(retrievedBlock1!)).toBe(hash1);
        expect(hashBlock(retrievedBlock2!)).toBe(hash2);
    }, 10000);
});
