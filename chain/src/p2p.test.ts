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
            subscribe: vi.fn(),
            publish: vi.fn(),
            addEventListener: vi.fn(),
        };

        mockNode = {
            start: vi.fn(),
            services: { pubsub: mockPubsub },
            peerId: { toString: () => 'QmTestPeerId123456' },
            getMultiaddrs: () => [],
            getPeers: () => ['QmPeerX'],
            addEventListener: vi.fn(),
            dial: vi.fn(),
        };

        (libp2p.createLibp2p as any).mockResolvedValue(mockNode);
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
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
        let handler: any;

        beforeEach(async () => {
            await p2p.start(7001);
            handler = mockPubsub.addEventListener.mock.calls.find((call: any) => call[0] === 'message')[1];
        });

        it('should log incoming block:proposal messages', () => {
            handler({
                detail: {
                    topic: 'block:proposal',
                    from: { toString: () => 'QmSender987654' },
                    data: new TextEncoder().encode(JSON.stringify({ header: { height: 42 } }))
                }
            });
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[P2P] Incoming block:proposal from ...987654: height 42'));
        });

        it('should log incoming vote:prevote messages', () => {
            handler({
                detail: {
                    topic: 'vote:prevote',
                    from: { toString: () => 'QmSender112233' },
                    data: new TextEncoder().encode(JSON.stringify({ height: 100 }))
                }
            });
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[P2P] Incoming vote:prevote from ...112233: height 100'));
        });

        it('should log incoming vote:precommit messages', () => {
            handler({
                detail: {
                    topic: 'vote:precommit',
                    from: { toString: () => 'QmSender445566' },
                    data: new TextEncoder().encode(JSON.stringify({ height: 200 }))
                }
            });
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[P2P] Incoming vote:precommit from ...445566: height 200'));
        });

        it('should log ignored messages for unknown topics', () => {
            handler({
                detail: {
                    topic: 'unknown:topic',
                    from: { toString: () => 'QmSenderXXXXXX' },
                    data: new TextEncoder().encode(JSON.stringify({ foo: 'bar' }))
                }
            });
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[P2P] Ignored message on unknown topic unknown:topic from ...XXXXXX'));
        });
    });

    describe('Broadcast & Retry', () => {
        it('should retry publish on failure with exponential backoff', async () => {
            await p2p.start(7001);

            let attempt = 0;
            mockPubsub.publish.mockImplementation(() => {
                attempt++;
                if (attempt < 3) throw new Error('Publish failed');
                return Promise.resolve();
            });

            const broadcastPromise = p2p.broadcast('block:proposal', { height: 99 });

            // Run timers to trigger retries
            await vi.advanceTimersByTimeAsync(500); // 1st retry
            await vi.advanceTimersByTimeAsync(1000); // 2nd retry (success)

            await broadcastPromise;

            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Publish retry on block:proposal (attempt 1/10)'));
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Publish retry on block:proposal (attempt 2/10)'));
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Published message on block:proposal to 1 peers.'));
        });

        it('should give up after max retries', async () => {
            await p2p.start(7001);

            mockPubsub.publish.mockImplementation(() => {
                throw new Error('Always fails');
            });

            const broadcastPromise = p2p.broadcast('vote:prevote', { height: 123 });

            // Advance through all retries iteratively.
            // There are 9 wait periods for 10 attempts.
            for (let i = 0; i < 9; i++) {
                await vi.advanceTimersToNextTimerAsync();
            }

            await broadcastPromise;

            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Publish on vote:prevote failed after 10 attempts'));
        });
    });
});
