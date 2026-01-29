import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { P2P } from './p2p.js';
import { State } from './state.js';
import { Block } from './types.js';
import fs from 'fs';

describe('P2P Synchronization', () => {
    let node1: P2P;
    let node2: P2P;
    const dataDir1 = './data/test-sync-1';
    const dataDir2 = './data/test-sync-2';

    beforeAll(async () => {
        // Clean up old data
        if (fs.existsSync(dataDir1)) fs.rmSync(dataDir1, { recursive: true });
        if (fs.existsSync(dataDir2)) fs.rmSync(dataDir2, { recursive: true });

        node1 = new P2P();
        node2 = new P2P();

        const state1 = new State(dataDir1);
        const state2 = new State(dataDir2);

        await node1.start(7101, [], state1);
        await node2.start(7102, node1.getMultiaddrs(), state2);

        // Wait for libp2p connection
        let connected = false;
        for (let i = 0; i < 20; i++) {
            if (node1.node.getPeers().length > 0) {
                connected = true;
                break;
            }
            await new Promise(r => setTimeout(r, 500));
        }
        if (!connected) throw new Error('libp2p failed to connect');
    }, 30000);

    afterAll(async () => {
        await new Promise(r => setTimeout(r, 1000));
        try {
            if (node1?.node) await node1.node.stop();
            if (node2?.node) await node2.node.stop();
        } catch (err) { }
        if (fs.existsSync(dataDir1)) fs.rmSync(dataDir1, { recursive: true });
        if (fs.existsSync(dataDir2)) fs.rmSync(dataDir2, { recursive: true });
    });

    it('should allow node2 to request a block from node1', async () => {
        const state1 = (node1 as any).state as State;

        // 1. Manually add a block to node1's state
        const testBlock: Block = {
            header: {
                height: 1,
                prevHash: '0x000',
                txRoot: '0x123',
                timestamp: Date.now(),
                proposer: 'val1'
            },
            txs: [],
            signature: 'sig1'
        };
        await state1.commitBlock(testBlock);

        // 2. Node 2 requests block 1 from Node 1
        const peerId1 = node1.node.peerId.toString();
        console.log(`[Test] Node 2 requesting block 1 from Node 1 (${peerId1})`);

        const receivedBlock = await node2.requestBlockFromPeer(peerId1, 1);

        expect(receivedBlock).toBeDefined();
        expect(receivedBlock?.header.height).toBe(1);
        expect(receivedBlock?.header.proposer).toBe('val1');
    }, 10000);
});
