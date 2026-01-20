import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { P2P } from './p2p.js';
import * as libp2p from 'libp2p';

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
        it('should log incoming block:proposal messages', async () => {
            await p2p.start(7001);
            const handler = mockPubsub.addEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];
            handler({
                detail: {
                    topic: 'block:proposal',
                    from: { toString: () => 'QmSender987654' },
                    data: new TextEncoder().encode(JSON.stringify({ header: { height: 42 } }))
                }
            });
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[P2P] Incoming block:proposal from QmSender987654: height 42'));
        });

        it('should log incoming vote:prevote messages', async () => {
            await p2p.start(7001);
            const handler = mockPubsub.addEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];
            handler({
                detail: {
                    topic: 'vote:prevote',
                    from: { toString: () => 'QmSender112233' },
                    data: new TextEncoder().encode(JSON.stringify({ height: 100 }))
                }
            });
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[P2P] Incoming vote:prevote from QmSender112233: height 100'));
        });

        it('should log incoming vote:precommit messages', async () => {
            await p2p.start(7001);
            const handler = mockPubsub.addEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];
            handler({
                detail: {
                    topic: 'vote:precommit',
                    from: { toString: () => 'QmSender445566' },
                    data: new TextEncoder().encode(JSON.stringify({ height: 200 }))
                }
            });
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[P2P] Incoming vote:precommit from QmSender445566: height 200'));
        });

        it('should log ignored messages for unknown topics', async () => {
            await p2p.start(7001);
            const handler = mockPubsub.addEventListener.mock.calls.find((c: any) => c[0] === 'message')[1];
            handler({
                detail: {
                    topic: 'unknown:topic',
                    from: { toString: () => 'QmSenderXXXXXX' },
                    data: new TextEncoder().encode(JSON.stringify({ foo: 'bar' }))
                }
            });
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[P2P] Ignored message on unknown topic unknown:topic from QmSenderXXXXXX'));
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
            const collectionPromise = p2p.collectVotes(1, 'vote:prevote', 4); // Quorum of 3 required

            for (let i = 1; i <= 3; i++) {
                handler({
                    detail: {
                        topic: 'vote:prevote',
                        from: { toString: () => `peer${i}` },
                        data: new TextEncoder().encode(JSON.stringify({
                            height: 1, validator: `val${i}`, topic: 'vote:prevote'
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
            const collectionPromise = p2p.collectVotes(2, 'vote:precommit', 4);

            handler({
                detail: {
                    topic: 'vote:precommit',
                    from: { toString: () => 'peer1' },
                    data: new TextEncoder().encode(JSON.stringify({
                        height: 2, validator: 'val1', topic: 'vote:precommit'
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
                        height: 1, validator: 'val1', topic: 'vote:prevote'
                    }))
                }
            });

            p2p.setHead(5, '0xhash');
            const collectionPromise = p2p.collectVotes(1, 'vote:prevote', 4);

            for (let i = 0; i < 21; i++) {
                await vi.advanceTimersByTimeAsync(500);
            }

            const votes = await collectionPromise;
            expect(votes.length).toBe(0);
        });
    });
});
