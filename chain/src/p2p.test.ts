import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { P2P } from './p2p.js';
import * as libp2p from 'libp2p';
import { ValidationError } from './validation.js';

vi.mock('libp2p', () => ({
    createLibp2p: vi.fn(),
}));

describe('P2P Gossip Logging & Broadcast', () => {
    let p2p: P2P;
    let mockNode: any;
    let mockPubsub: any;
    let logSpy: any;

    beforeEach(() => {
        vi.useFakeTimers();
        mockPubsub = {
            subscribe: vi.fn().mockResolvedValue(undefined),
            publish: vi.fn().mockResolvedValue(undefined),
            addEventListener: vi.fn(),
            getPeers: vi.fn().mockReturnValue([]),
            getSubscribers: vi.fn().mockReturnValue([]),
        };

        mockNode = {
            start: vi.fn().mockResolvedValue(undefined),
            stop: vi.fn().mockResolvedValue(undefined),
            services: { pubsub: mockPubsub },
            peerId: { toString: () => 'QmTestPeerId123456' },
            getMultiaddrs: () => [],
            getPeers: () => ['QmPeerX'],
            addEventListener: vi.fn(),
            dial: vi.fn().mockResolvedValue(undefined),
            handle: vi.fn(),
            dialProtocol: vi.fn(),
        };

        (libp2p.createLibp2p as any).mockResolvedValue(mockNode);
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
        vi.spyOn(console, 'error').mockImplementation(() => { });
        p2p = new P2P();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('should subscribe to required topics on start', async () => {
        await p2p.start(7001);
        expect(mockPubsub.subscribe).toHaveBeenCalledWith('block:proposal');
        expect(mockPubsub.subscribe).toHaveBeenCalledWith('vote:prevote');
        expect(mockPubsub.subscribe).toHaveBeenCalledWith('vote:precommit');
    });

    describe('Incoming Messages', () => {
        it('should validate and store block:proposal messages', async () => {
            await p2p.start(7001);
            const handler = mockPubsub.addEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];

            // Create a valid block proposal (height 1, prevHash is 0x0000... for initial state)
            const validBlock = {
                header: {
                    height: 1,
                    prevHash: '0x' + '0'.repeat(64),
                    txRoot: '0x' + '0'.repeat(64),
                    timestamp: Date.now(),
                    proposer: 'validator1'
                },
                txs: [],
                signature: 'sig'
            };

            handler({
                detail: {
                    topic: 'block:proposal',
                    from: { toString: () => 'QmSender987654' },
                    data: new TextEncoder().encode(JSON.stringify(validBlock))
                }
            });
            // Verify that the proposal was stored
            expect(p2p.getValidatedProposal(1)).toEqual(validBlock);
        });

        it('should reject invalid block proposals', async () => {
            await p2p.start(7001);
            const handler = mockPubsub.addEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

            // Create an invalid block proposal (missing prevHash)
            const invalidBlock = {
                header: {
                    height: 1,
                    // missing prevHash
                    txRoot: '0x' + '0'.repeat(64),
                    timestamp: Date.now(),
                    proposer: 'validator1'
                },
                txs: [],
                signature: 'sig'
            };

            handler({
                detail: {
                    topic: 'block:proposal',
                    from: { toString: () => 'QmSender987654' },
                    data: new TextEncoder().encode(JSON.stringify(invalidBlock))
                }
            });

            // Verify that invalid proposal was NOT stored
            expect(p2p.getValidatedProposal(1)).toBeUndefined();
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid block proposal'));

            warnSpy.mockRestore();
        });

        it('should store vote:prevote messages', async () => {
            await p2p.start(7001);
            const handler = mockPubsub.addEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];
            handler({
                detail: {
                    topic: 'vote:prevote',
                    from: { toString: () => 'QmSender112233' },
                    data: new TextEncoder().encode(JSON.stringify({ height: 100, type: 'PREVOTE', validator: 'val1' }))
                }
            });
            // Votes should be stored internally
            expect(p2p['votes'].has('100:PREVOTE')).toBe(true);
        });

        it('should store vote:precommit messages', async () => {
            await p2p.start(7001);
            const handler = mockPubsub.addEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];
            handler({
                detail: {
                    topic: 'vote:precommit',
                    from: { toString: () => 'QmSender445566' },
                    data: new TextEncoder().encode(JSON.stringify({ height: 200, type: 'PRECOMMIT', validator: 'val2' }))
                }
            });
            // Votes should be stored internally
            expect(p2p['votes'].has('200:PRECOMMIT')).toBe(true);
        });

        it('should ignore messages on unknown topics', async () => {
            await p2p.start(7001);
            const handler = mockPubsub.addEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];
            handler({
                detail: {
                    topic: 'unknown:topic',
                    from: { toString: () => 'QmSenderXXXXXX' },
                    data: new TextEncoder().encode(JSON.stringify({ foo: 'bar' }))
                }
            });
            // Unknown topics should not cause errors, just be ignored
            expect(logSpy).toHaveBeenCalled();
        });
    });

    describe('Broadcast & Retry', () => {
        beforeEach(async () => {
            await p2p.start(7001);
        });

        it('should retry publish on failure with exponential backoff', async () => {
            const err = new Error('No peers subscribed');
            err.name = 'PublishError';
            (err as any).code = 'ERR_NO_PEERS_SUBSCRIBED_TO_TOPIC';

            mockPubsub.publish
                .mockRejectedValueOnce(err)
                .mockRejectedValueOnce(err)
                .mockResolvedValueOnce({});

            const broadcastPromise = p2p.broadcast('topic', { foo: 'bar' });

            await vi.advanceTimersByTimeAsync(100);
            await vi.advanceTimersByTimeAsync(200);

            await broadcastPromise;
            expect(mockPubsub.publish).toHaveBeenCalledTimes(3);
        });

        it('should give up after max retries', async () => {
            const err = new Error('No peers subscribed');
            err.name = 'PublishError';
            (err as any).code = 'ERR_NO_PEERS_SUBSCRIBED_TO_TOPIC';

            mockPubsub.publish.mockRejectedValue(err);

            const broadcastPromise = p2p.broadcast('topic', { foo: 'bar' });

            for (let i = 0; i < 5; i++) {
                await vi.advanceTimersToNextTimerAsync();
            }

            await broadcastPromise;
            expect(mockPubsub.publish).toHaveBeenCalledTimes(6);
        });
    });

    describe('Vote Collection', () => {
        beforeEach(async () => {
            await p2p.start(7001);
        });

        it('should collect votes and return on quorum', async () => {
            const handler = mockPubsub.addEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];
            const collectionPromise = p2p.collectVotes(1, 'PREVOTE', 4); // Quorum of 3 required (2/3 of 4)

            for (let i = 1; i <= 3; i++) {
                handler({
                    detail: {
                        topic: 'vote:prevote',
                        from: { toString: () => `peer${i}` },
                        data: new TextEncoder().encode(JSON.stringify({
                            height: 1, validator: `val${i}`, type: 'PREVOTE'
                        }))
                    }
                });
            }

            await vi.advanceTimersByTimeAsync(500);
            const votes = await collectionPromise;
            expect(votes.length).toBe(3);
        });

        it('should time out if quorum is not reached', async () => {
            const handler = mockPubsub.addEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];
            const collectionPromise = p2p.collectVotes(2, 'PRECOMMIT', 4);

            handler({
                detail: {
                    topic: 'vote:precommit',
                    from: { toString: () => 'peer1' },
                    data: new TextEncoder().encode(JSON.stringify({
                        height: 2, validator: 'val1', type: 'PRECOMMIT'
                    }))
                }
            });

            for (let i = 0; i < 21; i++) {
                await vi.advanceTimersByTimeAsync(500);
            }

            const votes = await collectionPromise;
            expect(votes.length).toBe(1);
        });

        it('should clean up old votes when head is set', async () => {
            const handler = mockPubsub.addEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];

            handler({
                detail: {
                    topic: 'vote:prevote',
                    from: { toString: () => 'peer1' },
                    data: new TextEncoder().encode(JSON.stringify({
                        height: 1, validator: 'val1', type: 'PREVOTE'
                    }))
                }
            });

            p2p.setHead(5, '0xhash');
            const collectionPromise = p2p.collectVotes(1, 'PREVOTE', 4);

            for (let i = 0; i < 21; i++) {
                await vi.advanceTimersByTimeAsync(500);
            }

            const votes = await collectionPromise;
            expect(votes.length).toBe(0);
        });
    });

    describe('Faulty Validator Behavior', () => {
        beforeEach(async () => {
            await p2p.start(7001);
        });

        it('should still achieve quorum with one missing validator vote', async () => {
            const handler = mockPubsub.addEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];
            const collectionPromise = p2p.collectVotes(1, 'PREVOTE', 4); // Quorum of 3 required (2/3 of 4)

            // Only 3 out of 4 validators send votes (val4 is missing/faulty)
            for (let i = 1; i <= 3; i++) {
                handler({
                    detail: {
                        topic: 'vote:prevote',
                        from: { toString: () => `peer${i}` },
                        data: new TextEncoder().encode(JSON.stringify({
                            height: 1, validator: `val${i}`, type: 'PREVOTE'
                        }))
                    }
                });
            }

            await vi.advanceTimersByTimeAsync(500);
            const votes = await collectionPromise;
            expect(votes.length).toBe(3);
            expect(votes.map((v: any) => v.validator)).toEqual(['val1', 'val2', 'val3']);
        });

        it('should handle delayed votes from faulty validator', async () => {
            const handler = mockPubsub.addEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];
            const collectionPromise = p2p.collectVotes(2, 'PRECOMMIT', 4);

            // Validators 1-3 send votes immediately
            for (let i = 1; i <= 3; i++) {
                handler({
                    detail: {
                        topic: 'vote:precommit',
                        from: { toString: () => `peer${i}` },
                        data: new TextEncoder().encode(JSON.stringify({
                            height: 2, validator: `val${i}`, type: 'PRECOMMIT'
                        }))
                    }
                });
            }

            await vi.advanceTimersByTimeAsync(500);
            
            // Faulty validator (val4) sends vote late (after quorum already reached)
            handler({
                detail: {
                    topic: 'vote:precommit',
                    from: { toString: () => 'peer4' },
                    data: new TextEncoder().encode(JSON.stringify({
                        height: 2, validator: 'val4', type: 'PRECOMMIT'
                    }))
                }
            });

            const votes = await collectionPromise;
            expect(votes.length).toBe(3); // Quorum already achieved
        });

        it('should fail quorum with 2 or more missing validators', async () => {
            const handler = mockPubsub.addEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];
            const collectionPromise = p2p.collectVotes(3, 'PREVOTE', 4);

            // Only 2 validators send votes (val3 and val4 are faulty/missing)
            for (let i = 1; i <= 2; i++) {
                handler({
                    detail: {
                        topic: 'vote:prevote',
                        from: { toString: () => `peer${i}` },
                        data: new TextEncoder().encode(JSON.stringify({
                            height: 3, validator: `val${i}`, type: 'PREVOTE'
                        }))
                    }
                });
            }

            // Wait for timeout (21 intervals * 500ms = 10.5s, exceeds 20 attempts at 500ms)
            for (let i = 0; i < 21; i++) {
                await vi.advanceTimersByTimeAsync(500);
            }

            const votes = await collectionPromise;
            expect(votes.length).toBe(2); // Below quorum threshold of 3
        });

        it('should tolerate Byzantine behavior with partial vote recovery', async () => {
            const handler = mockPubsub.addEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];
            const collectionPromise = p2p.collectVotes(4, 'PRECOMMIT', 4);

            // First round: val1 and val2 send votes
            handler({
                detail: {
                    topic: 'vote:precommit',
                    from: { toString: () => 'peer1' },
                    data: new TextEncoder().encode(JSON.stringify({
                        height: 4, validator: 'val1', type: 'PRECOMMIT'
                    }))
                }
            });

            handler({
                detail: {
                    topic: 'vote:precommit',
                    from: { toString: () => 'peer2' },
                    data: new TextEncoder().encode(JSON.stringify({
                        height: 4, validator: 'val2', type: 'PRECOMMIT'
                    }))
                }
            });

            // Advance time
            await vi.advanceTimersByTimeAsync(1000);

            // Second round: val3 and val4 eventually send votes (Byzantine recovery)
            handler({
                detail: {
                    topic: 'vote:precommit',
                    from: { toString: () => 'peer3' },
                    data: new TextEncoder().encode(JSON.stringify({
                        height: 4, validator: 'val3', type: 'PRECOMMIT'
                    }))
                }
            });

            handler({
                detail: {
                    topic: 'vote:precommit',
                    from: { toString: () => 'peer4' },
                    data: new TextEncoder().encode(JSON.stringify({
                        height: 4, validator: 'val4', type: 'PRECOMMIT'
                    }))
                }
            });

            await vi.advanceTimersByTimeAsync(500);

            const votes = await collectionPromise;
            expect(votes.length).toBe(4); // All validators eventually participated
            expect(votes.map((v: any) => v.validator).sort()).toEqual(['val1', 'val2', 'val3', 'val4']);
        });
    });
});
